import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface WorkspaceCache {
  users: Record<string, string>;
  channels: Record<string, string>;
  dms: Record<string, string>;
  updatedAt: string;
}

export type ResolveResult =
  | { status: "found"; id: string }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: { name: string; id: string }[] };

function cachePath(configDir: string, workspace: string): string {
  return join(configDir, "cache", `${workspace}.json`);
}

function normalizeKeys(map: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    normalized[key.toLowerCase().trim()] = value;
  }
  return normalized;
}

export function loadCache(
  configDir: string,
  workspace: string
): WorkspaceCache {
  const path = cachePath(configDir, workspace);
  if (!existsSync(path)) {
    return {
      users: {},
      channels: {},
      dms: {},
      updatedAt: new Date(0).toISOString(),
    };
  }
  const raw = readFileSync(path, "utf-8");
  let parsed: WorkspaceCache;
  try {
    parsed = JSON.parse(raw) as WorkspaceCache;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Malformed JSON in ${path}: ${message}`);
  }
  return {
    users: normalizeKeys(parsed.users),
    channels: normalizeKeys(parsed.channels),
    dms: normalizeKeys(parsed.dms),
    updatedAt: parsed.updatedAt,
  };
}

export function saveCache(
  configDir: string,
  workspace: string,
  cache: WorkspaceCache
): void {
  const path = cachePath(configDir, workspace);
  mkdirSync(join(configDir, "cache"), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function resolveFromCache(
  cache: WorkspaceCache,
  kind: "users" | "channels",
  name: string
): ResolveResult {
  const map = cache[kind];
  const query = name.toLowerCase().trim();

  const exact = map[query];
  if (exact) return { status: "found", id: exact };

  const candidates = Object.entries(map)
    .filter(([key]) => key.includes(query))
    .map(([key, id]) => ({ name: key, id }));

  if (candidates.length === 0) return { status: "not_found" };
  if (candidates.length === 1) return { status: "found", id: candidates[0].id };
  return { status: "ambiguous", candidates };
}

export function upsertCacheEntry(
  cache: WorkspaceCache,
  kind: "users" | "channels" | "dms",
  key: string,
  id: string
): void {
  cache[kind][key.toLowerCase().trim()] = id;
  cache.updatedAt = new Date().toISOString();
}

export function dropCacheEntry(
  cache: WorkspaceCache,
  kind: "users" | "channels" | "dms",
  key: string
): void {
  delete cache[kind][key.toLowerCase().trim()];
  cache.updatedAt = new Date().toISOString();
}
