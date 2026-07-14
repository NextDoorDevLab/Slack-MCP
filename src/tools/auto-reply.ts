import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWorkspace } from "../config.js";
import { loadCache, saveCache } from "../cache.js";
import { sendMessageCore } from "./messaging.js";
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

      if (!deps.rateLimiter.tryConsume(ws, Date.now())) {
        return json({ sent: false, reason: "rate_limited" });
      }

      const { client } = deps.registry.get(ws);
      const cache = loadCache(deps.configDir, ws);

      let result: Awaited<ReturnType<typeof sendMessageCore>>;
      try {
        result = await sendMessageCore(client, cache, to, text);
      } finally {
        saveCache(deps.configDir, ws, cache);
      }

      if (result.status !== "sent") {
        return json({ sent: false, reason: result.status });
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
