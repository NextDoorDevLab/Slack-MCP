import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceRegistry } from "../workspace.js";
import type { DirectoryMap, WorkspacesFile } from "../config.js";
import { resolveWorkspace } from "../config.js";
import {
  loadCache,
  saveCache,
  resolveFromCache,
  upsertCacheEntry,
} from "../cache.js";

export interface ToolDeps {
  configDir: string;
  registry: WorkspaceRegistry;
  directoryMap: DirectoryMap;
  workspaces: WorkspacesFile;
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerDiscoveryTools(
  server: McpServer,
  deps: ToolDeps
): void {
  server.tool(
    "list_channels",
    "List Slack channels in a workspace",
    { workspace: z.string().optional() },
    async ({ workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const res = await client.conversations.list({
        types: "public_channel,private_channel",
      });
      const channels = (res.channels ?? []).map((c) => ({
        id: c.id!,
        name: c.name!,
      }));

      const cache = loadCache(deps.configDir, ws);
      for (const c of channels)
        upsertCacheEntry(cache, "channels", c.name, c.id);
      saveCache(deps.configDir, ws, cache);

      return json(channels);
    }
  );

  server.tool(
    "list_users",
    "List Slack users in a workspace",
    { workspace: z.string().optional() },
    async ({ workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const res = await client.users.list({});
      const users = (res.members ?? [])
        .filter((u) => !u.deleted && !u.is_bot)
        .map((u) => ({
          id: u.id!,
          name: u.name!,
          realName: u.real_name ?? u.name!,
        }));

      const cache = loadCache(deps.configDir, ws);
      for (const u of users) {
        upsertCacheEntry(cache, "users", u.name, u.id);
        upsertCacheEntry(cache, "users", u.realName, u.id);
      }
      saveCache(deps.configDir, ws, cache);

      return json(users);
    }
  );

  server.tool(
    "resolve",
    "Resolve a person or channel name to a Slack ID, cache-first",
    {
      name: z.string(),
      kind: z.enum(["users", "channels"]).default("users"),
      workspace: z.string().optional(),
    },
    async ({ name, kind, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const cache = loadCache(deps.configDir, ws);
      const result = resolveFromCache(cache, kind, name);
      return json({ workspace: ws, ...result });
    }
  );
}
