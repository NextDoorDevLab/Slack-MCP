import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface WorkspaceEntry {
  tokenEnv: string;
}
export interface WorkspacesFile {
  [workspaceName: string]: WorkspaceEntry;
}
export interface DirectoryMap {
  [absolutePathPrefix: string]: string;
}
export interface AppConfig {
  autoReplyRateLimitPerMinute: number | null;
}

export function getConfigDir(): string {
  return process.env.SLACK_MCP_CONFIG_DIR ?? join(homedir(), ".slack-mcp");
}

function readJsonIfExists<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Malformed JSON in ${path}: ${message}`);
  }
}

export function loadWorkspaces(configDir: string): WorkspacesFile {
  return readJsonIfExists(join(configDir, "workspaces.json"), {});
}

export function saveWorkspaces(
  configDir: string,
  workspaces: WorkspacesFile
): void {
  // Mirrors cache.ts's owner-only hardening (0700 dir, 0600 file) — this
  // file is a read path for which env var holds each workspace's live
  // Slack token, so it gets the same treatment as the token/cache files
  // themselves rather than relying on the process umask.
  // mkdirSync/writeFileSync's mode option only applies when the
  // directory/file is newly created; it does not re-chmod a pre-existing
  // path with looser permissions, so the explicit chmodSync calls below
  // are what actually re-harden one.
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  chmodSync(configDir, 0o700);
  const workspacesPath = join(configDir, "workspaces.json");
  writeFileSync(workspacesPath, JSON.stringify(workspaces, null, 2), {
    mode: 0o600,
  });
  chmodSync(workspacesPath, 0o600);
}

export function loadDirectoryMap(configDir: string): DirectoryMap {
  return readJsonIfExists(join(configDir, "directory-map.json"), {});
}

export function loadAppConfig(configDir: string): AppConfig {
  return readJsonIfExists(join(configDir, "config.json"), {
    autoReplyRateLimitPerMinute: 5,
  });
}

export function resolveWorkspaceFromCwd(
  cwd: string,
  directoryMap: DirectoryMap
): string | null {
  let best: { prefix: string; workspace: string } | null = null;
  for (const [prefix, workspace] of Object.entries(directoryMap)) {
    if (
      (cwd === prefix || cwd.startsWith(prefix + "/")) &&
      (best === null || prefix.length > best.prefix.length)
    ) {
      best = { prefix, workspace };
    }
  }
  return best?.workspace ?? null;
}

export function resolveWorkspace(
  explicit: string | undefined,
  cwd: string,
  directoryMap: DirectoryMap,
  workspaces: WorkspacesFile
): string {
  const candidate = explicit ?? resolveWorkspaceFromCwd(cwd, directoryMap);
  const known = Object.keys(workspaces).sort();
  if (candidate && workspaces[candidate]) return candidate;
  throw new Error(
    `Could not resolve a Slack workspace (explicit="${explicit ?? "none"}", cwd="${cwd}"). ` +
      `Configured workspaces: ${known.join(", ") || "none configured"}.`
  );
}
