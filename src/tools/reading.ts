import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWorkspace } from "../config.js";
import type { ToolDeps } from "./discovery.js";
import { paginateSlack } from "../slack-pagination.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerReadingTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "read_channel_history",
    "Read recent messages from a Slack channel",
    {
      channel: z.string(),
      limit: z.number().default(20),
      workspace: z.string().optional(),
    },
    async ({ channel, limit, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const finalLimit = limit ?? 20;
      const res = await client.conversations.history({
        channel,
        limit: finalLimit,
      });
      return json(
        (res.messages ?? []).map((m) => ({
          ts: m.ts,
          user: m.user,
          text: m.text,
        }))
      );
    }
  );

  server.tool(
    "read_thread",
    "Read all replies in a Slack thread",
    {
      channel: z.string(),
      threadTs: z.string(),
      workspace: z.string().optional(),
    },
    async ({ channel, threadTs, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const messages = await paginateSlack(async (cursor) => {
        const res = await client.conversations.replies({
          channel,
          ts: threadTs,
          cursor,
        });
        return {
          items: (res.messages ?? []).map((m) => ({
            ts: m.ts,
            user: m.user,
            text: m.text,
          })),
          nextCursor: res.response_metadata?.next_cursor || undefined,
        };
      });
      return json(messages);
    }
  );
}
