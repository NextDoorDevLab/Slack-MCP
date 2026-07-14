import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWorkspace } from "../config.js";
import type { ToolDeps } from "./discovery.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerSearchTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "search_messages",
    "Search messages across a workspace",
    { query: z.string(), workspace: z.string().optional() },
    async ({ query, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const res = await client.search.messages({ query });
      const matches = res.messages?.matches ?? [];
      return json(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        matches.map((m: any) => ({
          ts: m.ts,
          channel: m.channel?.id,
          text: m.text,
        }))
      );
    }
  );
}
