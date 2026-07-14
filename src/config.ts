import { readFileSync, existsSync } from "node:fs";
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
