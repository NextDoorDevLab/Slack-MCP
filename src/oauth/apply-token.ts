import {
  loadWorkspaces,
  saveWorkspaces,
  type WorkspacesFile,
} from "../config.js";
import { upsertEnvVar } from "./env-writer.js";

export function findTokenEnvCollision(
  workspaces: WorkspacesFile,
  workspace: string,
  tokenVar: string
): string | null {
  const collision = Object.entries(workspaces).find(
    ([name, entry]) => name !== workspace && entry.tokenEnv === tokenVar
  );
  return collision ? collision[0] : null;
}

export interface ApplyTokenOptions {
  configDir: string;
  envPath: string;
  workspace: string;
  tokenVar: string;
  accessToken: string;
  seed: string;
}

export interface ApplyTokenResult {
  collidingWorkspace: string | null;
}

// Reloads workspaces.json immediately before writing (rather than reusing
// a snapshot loaded before the OAuth browser wait) and re-checks for a
// token-env-var collision against that fresh state. This catches a second
// `authorize` run for a colliding workspace name that completed during
// this run's browser wait, instead of silently overwriting the other
// workspace's token — the same guarantee the earlier, pre-wait collision
// check provides, re-validated at the point of the actual write.
export function applyToken(options: ApplyTokenOptions): ApplyTokenResult {
  const { configDir, envPath, workspace, tokenVar, accessToken, seed } =
    options;
  const latestWorkspaces = loadWorkspaces(configDir);
  const collidingWorkspace = findTokenEnvCollision(
    latestWorkspaces,
    workspace,
    tokenVar
  );
  if (collidingWorkspace) {
    return { collidingWorkspace };
  }

  upsertEnvVar(envPath, tokenVar, accessToken, seed);
  latestWorkspaces[workspace] = {
    ...latestWorkspaces[workspace],
    tokenEnv: tokenVar,
  };
  saveWorkspaces(configDir, latestWorkspaces);
  return { collidingWorkspace: null };
}
