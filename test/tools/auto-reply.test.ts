import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAutoReplyTools } from "../../src/tools/auto-reply.js";
import { WorkspaceRegistry } from "../../src/workspace.js";
import { SlidingWindowRateLimiter } from "../../src/rate-limiter.js";
import { readAuditLog } from "../../src/audit-log.js";
import { saveCache } from "../../src/cache.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDeps } from "../../src/tools/discovery.js";

// NOTE: `to: "U01"` is not a channel-ID shape (see CHANNEL_ID_RE in
// src/tools/messaging.ts), so sendMessageCore resolves it as a name via the
// cache rather than posting directly. The brief's fakeClient has no
// `users.list`, so (as in test/tools/messaging.test.ts) the cache is
// pre-seeded here to satisfy that resolution without a real API call.
function setup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fakeClient: any,
  limitPerMinute: number | null,
  cacheUsers: Record<string, string> = { u01: "U01" }
) {
  const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-autoreply-"));
  const workspaces = { playfield: { tokenEnv: "AR" } };
  process.env.AR = "xoxp-fake";
  const deps: ToolDeps & { rateLimiter: SlidingWindowRateLimiter } = {
    configDir,
    registry: new WorkspaceRegistry(workspaces, () => fakeClient),
    directoryMap: {},
    workspaces,
    rateLimiter: new SlidingWindowRateLimiter(limitPerMinute),
  };
  saveCache(configDir, "playfield", {
    users: cacheUsers,
    channels: {},
    dms: {},
    updatedAt: "",
  });
  return deps;
}

describe("auto_reply", () => {
  it("sends and logs when under the rate limit", async () => {
    const fakeClient = {
      conversations: {
        open: vi.fn().mockResolvedValue({ channel: { id: "D01" } }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: "1", channel: "D01" }),
      },
    };
    const deps = setup(fakeClient, 5);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAutoReplyTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["auto_reply"];

    const result = await tool.handler(
      {
        to: "U01",
        text: "On it",
        matchedRule: "bug ack",
        workspace: "playfield",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(JSON.parse(result.content[0].text)).toEqual({ sent: true });
    expect(readAuditLog(deps.configDir)).toHaveLength(1);
    expect(readAuditLog(deps.configDir)[0].matchedRule).toBe("bug ack");

    rmSync(deps.configDir, { recursive: true, force: true });
  });

  it("refuses and does not log when the rate limit is exceeded", async () => {
    const fakeClient = {
      conversations: {
        open: vi.fn().mockResolvedValue({ channel: { id: "D01" } }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: "1", channel: "D01" }),
      },
    };
    const deps = setup(fakeClient, 1);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAutoReplyTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["auto_reply"];

    await tool.handler(
      { to: "U01", text: "first", matchedRule: "r1", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    const second = await tool.handler(
      { to: "U01", text: "second", matchedRule: "r1", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(JSON.parse(second.content[0].text)).toEqual({
      sent: false,
      reason: "rate_limited",
    });
    expect(readAuditLog(deps.configDir)).toHaveLength(1);

    rmSync(deps.configDir, { recursive: true, force: true });
  });

  it("surfaces candidates and does not send or log on an ambiguous match", async () => {
    const fakeClient = {
      conversations: {
        open: vi.fn(),
      },
      chat: { postMessage: vi.fn() },
    };
    const deps = setup(fakeClient, 5, {
      "john smith": "U01",
      "john osei": "U02",
    });
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAutoReplyTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["auto_reply"];

    const result = await tool.handler(
      {
        to: "john",
        text: "On it",
        matchedRule: "bug ack",
        workspace: "playfield",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(JSON.parse(result.content[0].text)).toEqual({
      sent: false,
      status: "ambiguous",
      candidates: [
        { name: "john smith", id: "U01" },
        { name: "john osei", id: "U02" },
      ],
    });
    expect(fakeClient.conversations.open).not.toHaveBeenCalled();
    expect(fakeClient.chat.postMessage).not.toHaveBeenCalled();
    expect(readAuditLog(deps.configDir)).toHaveLength(0);

    rmSync(deps.configDir, { recursive: true, force: true });
  });

  it("does not consume a rate-limit token when resolution fails, so a later resolvable send still succeeds", async () => {
    // Regression guard for the resolve-before-rate-limit fix: with a budget
    // of exactly 1, a first call that fails to resolve (ambiguous name)
    // must NOT burn the only available token. A second call with a
    // resolvable name should then still succeed.
    const fakeClient = {
      conversations: {
        open: vi.fn().mockResolvedValue({ channel: { id: "D01" } }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: "1", channel: "D01" }),
      },
    };
    const deps = setup(fakeClient, 1, {
      "john smith": "U01",
      "john osei": "U02",
      dave: "U03",
    });
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAutoReplyTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["auto_reply"];

    const first = await tool.handler(
      {
        to: "john",
        text: "On it",
        matchedRule: "bug ack",
        workspace: "playfield",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(JSON.parse(first.content[0].text)).toEqual({
      sent: false,
      status: "ambiguous",
      candidates: [
        { name: "john smith", id: "U01" },
        { name: "john osei", id: "U02" },
      ],
    });
    expect(fakeClient.chat.postMessage).not.toHaveBeenCalled();

    const second = await tool.handler(
      {
        to: "dave",
        text: "On it",
        matchedRule: "bug ack",
        workspace: "playfield",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(JSON.parse(second.content[0].text)).toEqual({ sent: true });
    expect(fakeClient.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(readAuditLog(deps.configDir)).toHaveLength(1);

    rmSync(deps.configDir, { recursive: true, force: true });
  });
});
