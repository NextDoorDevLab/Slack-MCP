import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWorkspace } from "../config.js";
import type { ToolDeps } from "./discovery.js";
import { paginateSlack } from "../slack-pagination.js";
import { loadCursor, saveCursor, advanceCursor } from "../cursor.js";
import { loadRules, matchRules, loadPolicyText } from "../policy.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

// Per-channel history fetch inside get_new_messages is bounded (not fully
// paginated like list_channels/read_thread): a cold-start or long-gap poll
// on a busy channel could otherwise pull down months of history in one call,
// which is a latency and rate-limit risk. HISTORY_PAGE_SIZE and
// MAX_HISTORY_PAGES_PER_POLL together cap each channel to at most ~200
// messages per poll; anything older is picked up on a subsequent poll (see
// the "capped" cursor-advancement logic below, which advances the cursor
// only to the oldest ts actually fetched so nothing is skipped).
const HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGES_PER_POLL = 5;

// Slack `ts` values are fixed-width strings (10-digit seconds + "." +
// 6-digit microseconds, until year 2286), so lexical string comparison
// sorts them identically to numeric comparison while avoiding parseFloat's
// precision loss past ~16 significant digits.
function tsExtreme(
  messages: { ts?: string }[],
  pick: "max" | "min"
): string | undefined {
  let result: string | undefined;
  for (const m of messages) {
    if (!m.ts) continue;
    if (result === undefined) {
      result = m.ts;
      continue;
    }
    if (
      (pick === "max" && m.ts > result) ||
      (pick === "min" && m.ts < result)
    ) {
      result = m.ts;
    }
  }
  return result;
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

      const channels = await paginateSlack(async (pageCursor) => {
        const res = await client.conversations.list({
          types: "public_channel,private_channel,im",
          cursor: pageCursor,
        });
        return {
          items: (res.channels ?? [])
            .filter((c) => c.is_member !== false)
            .map((c) => ({ id: c.id! })),
          nextCursor: res.response_metadata?.next_cursor || undefined,
        };
      });

      const newMessages: {
        channel: string;
        ts: string;
        user?: string;
        text?: string;
      }[] = [];
      const skippedChannels: { channel: string; error: string }[] = [];

      for (const channel of channels) {
        const channelId = channel.id;
        const since = cursor[channelId];

        const fetched: { ts?: string; user?: string; text?: string }[] = [];
        let pageCursor: string | undefined;
        let pagesFetched = 0;
        let cappedByPageLimit = false;
        try {
          do {
            const res = await client.conversations.history({
              channel: channelId,
              oldest: since,
              cursor: pageCursor,
              limit: HISTORY_PAGE_SIZE,
            });
            fetched.push(...(res.messages ?? []));
            pagesFetched++;
            const nextCursor = res.response_metadata?.next_cursor || undefined;
            if (nextCursor && pagesFetched >= MAX_HISTORY_PAGES_PER_POLL) {
              // More history remains beyond what we're willing to fetch this
              // poll — stop here rather than following the cursor further.
              cappedByPageLimit = true;
              pageCursor = undefined;
            } else {
              pageCursor = nextCursor;
            }
          } while (pageCursor);
        } catch (err) {
          // Skip channels we can't read right now (e.g. archived, kicked,
          // transient API error) so one bad channel doesn't block the poll
          // for every other channel or lose progress already made. Record
          // it so a channel that starts silently failing every poll is
          // still observable instead of just quietly vanishing from results.
          skippedChannels.push({
            channel: channelId,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        for (const m of fetched) {
          if (!since || m.ts! > since) {
            newMessages.push({
              channel: channelId,
              ts: m.ts!,
              user: m.user,
              text: m.text,
            });
          }
        }

        // conversations.history returns messages newest-first (and pages
        // continue further back in time), so `fetched` spans newest -> oldest
        // across every page we pulled this poll.
        //
        // - Exhausted (drained all pages back to `since`, i.e. no next_cursor
        //   left): safe to advance the cursor to the newest ts seen, exactly
        //   like a single unpaginated fetch would.
        // - Capped (stopped early because MAX_HISTORY_PAGES_PER_POLL was hit
        //   while Slack still had more pages): advancing to the newest ts
        //   would permanently skip the older, not-yet-fetched backlog on all
        //   future polls (they'd now fall before the cursor). Instead advance
        //   only to the OLDEST ts actually fetched this poll, so the next
        //   poll resumes exactly where this one left off.
        if (fetched.length > 0) {
          const exhausted = !cappedByPageLimit;
          const targetTs = tsExtreme(fetched, exhausted ? "max" : "min");
          if (targetTs) advanceCursor(cursor, channelId, targetTs);
        }
      }

      saveCursor(deps.configDir, ws, cursor);
      newMessages.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

      const rules = loadRules(deps.configDir, ws);
      const annotated = newMessages.map((m) => {
        const match = matchRules(rules, {
          channel: m.channel,
          text: m.text ?? "",
        });
        return match.matched
          ? {
              ...m,
              ruleMatch: {
                name: match.rule.name,
                suggestedText: match.rule.template,
              },
            }
          : m;
      });

      return json({
        messages: annotated,
        skippedChannels,
        policyText: loadPolicyText(deps.configDir),
      });
    }
  );
}
