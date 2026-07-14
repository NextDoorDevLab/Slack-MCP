import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWorkspace } from "../config.js";
import type { ToolDeps } from "./discovery.js";
import { paginateSlack } from "../slack-pagination.js";
import { loadCursor, saveCursor, advanceCursor } from "../cursor.js";

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

  server.tool(
    "get_new_messages",
    "Return messages posted since the last check, across all channels the user is a member of, advancing the per-workspace cursor",
    { workspace: z.string().optional() },
    async ({ workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const cursor = loadCursor(deps.configDir, ws);

      const channelsRes = await client.conversations.list({
        types: "public_channel,private_channel,im",
      });
      const channels = (channelsRes.channels ?? []).filter(
        (c) => c.is_member !== false
      );

      const newMessages: {
        channel: string;
        ts: string;
        user?: string;
        text?: string;
      }[] = [];
      for (const channel of channels) {
        const channelId = channel.id!;
        const since = cursor[channelId];
        let history;
        try {
          history = await client.conversations.history({
            channel: channelId,
            oldest: since,
            limit: 50,
          });
        } catch {
          // Skip channels we can't read right now (e.g. archived, kicked,
          // transient API error) so one bad channel doesn't block the poll
          // for every other channel or lose progress already made.
          continue;
        }
        for (const m of history.messages ?? []) {
          if (!since || parseFloat(m.ts!) > parseFloat(since)) {
            newMessages.push({
              channel: channelId,
              ts: m.ts!,
              user: m.user,
              text: m.text,
            });
          }
          advanceCursor(cursor, channelId, m.ts!);
        }
      }

      saveCursor(deps.configDir, ws, cursor);
      newMessages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
      return json({ messages: newMessages });
    }
  );
}
