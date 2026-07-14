import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWorkspace } from "../config.js";
import { loadCache, saveCache } from "../cache.js";
import { resolveSendTarget, sendToResolvedTarget } from "./messaging.js";
import { appendAuditLog } from "../audit-log.js";
import type { ToolDeps } from "./discovery.js";
import type { SlidingWindowRateLimiter } from "../rate-limiter.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerAutoReplyTools(
  server: McpServer,
  deps: ToolDeps & { rateLimiter: SlidingWindowRateLimiter }
): void {
  server.tool(
    "auto_reply",
    "Send a rate-limited, audit-logged autonomous reply — use only when a policy rule or the model's own judgment against policy.md has approved this message",
    {
      to: z.string(),
      text: z.string(),
      matchedRule: z.string(),
      workspace: z.string().optional(),
    },
    async ({ to, text, matchedRule, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );

      const { client } = deps.registry.get(ws);
      const cache = loadCache(deps.configDir, ws);

      // Resolve BEFORE consuming a rate-limit token: a name that fails to
      // resolve (ambiguous/not_found) never reaches Slack, so it must not
      // cost the caller part of their budget. Only once we know exactly
      // where this would be sent do we check/consume the limiter, and only
      // then do we actually call chat.postMessage. The try/finally spans
      // both steps because resolution alone can mutate the cache (e.g.
      // populating it from users.list), and that mutation must survive
      // even if we return early (ambiguous/not_found/rate_limited) or the
      // send itself throws.
      let result: Awaited<ReturnType<typeof sendToResolvedTarget>>;
      try {
        const target = await resolveSendTarget(client, cache, to);
        if (target.status !== "resolved") {
          // Mirror send_message's behavior: surface the full non-sent
          // result (e.g. `candidates` on an ambiguous match) rather than
          // collapsing it to just a reason string, so the calling agent
          // has what it needs to retry with a disambiguated name/ID
          // instead of hitting a dead end.
          return json({ sent: false, ...target });
        }

        if (!deps.rateLimiter.tryConsume(ws, Date.now())) {
          return json({ sent: false, reason: "rate_limited" });
        }

        result = await sendToResolvedTarget(client, cache, to, text, target);
      } finally {
        saveCache(deps.configDir, ws, cache);
      }

      if (result.status !== "sent") {
        return json({ sent: false, ...result });
      }

      appendAuditLog(deps.configDir, {
        ts: new Date().toISOString(),
        workspace: ws,
        to,
        text,
        matchedRule,
      });

      return json({ sent: true });
    }
  );
}
