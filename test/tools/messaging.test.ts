import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessagingTools } from "../../src/tools/messaging.js";
import { WorkspaceRegistry } from "../../src/workspace.js";
import { saveCache } from "../../src/cache.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDeps } from "../../src/tools/discovery.js";

// NOTE: the installed @modelcontextprotocol/sdk version stores a registered tool's
// invocable function under `.handler` (not `.callback` as some docs/examples assume) —
// see node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js `_createRegisteredTool`.
// `_registeredTools[name]` itself is still the correct lookup.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setup(fakeClient: any) {
  const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-msg-"));
  const workspaces = { playfield: { tokenEnv: "Y" } };
  process.env.Y = "xoxp-fake";
  const registry = new WorkspaceRegistry(workspaces, () => fakeClient);
  const deps: ToolDeps = {
    configDir,
    registry,
    directoryMap: {},
    workspaces,
  };
  return deps;
}

describe("send_message", () => {
  it("resolves a cached user, opens a DM, and posts", async () => {
    const fakeClient = {
      conversations: {
        open: vi.fn().mockResolvedValue({ channel: { id: "D999" } }),
      },
      chat: {
        postMessage: vi
          .fn()
          .mockResolvedValue({ ts: "123.456", channel: "D999" }),
      },
    };
    const deps = setup(fakeClient);
    saveCache(deps.configDir, "playfield", {
      users: { john: "U0123ABCD" },
      channels: {},
      dms: {},
      updatedAt: "",
    });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerMessagingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["send_message"];
    const result = await tool.handler(
      { to: "John", text: "hey", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.conversations.open).toHaveBeenCalledWith({
      users: "U0123ABCD",
    });
    expect(fakeClient.chat.postMessage).toHaveBeenCalledWith({
      channel: "D999",
      text: "hey",
    });
    expect(JSON.parse(result.content[0].text)).toEqual({
      ts: "123.456",
      channel: "D999",
    });

    rmSync(deps.configDir, { recursive: true, force: true });
  });

  it("returns candidates without sending when the name is ambiguous", async () => {
    const fakeClient = {
      conversations: { open: vi.fn() },
      chat: { postMessage: vi.fn() },
    };
    const deps = setup(fakeClient);
    saveCache(deps.configDir, "playfield", {
      users: { "john smith": "U01", "john osei": "U02" },
      channels: {},
      dms: {},
      updatedAt: "",
    });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerMessagingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["send_message"];
    const result = await tool.handler(
      { to: "john", text: "hey", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.chat.postMessage).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ambiguous");
    expect(parsed.candidates).toHaveLength(2);

    rmSync(deps.configDir, { recursive: true, force: true });
  });

  it("drops a stale cache entry and retries once on user_not_found", async () => {
    const fakeClient = {
      conversations: {
        open: vi.fn().mockResolvedValue({ channel: { id: "D999" } }),
      },
      chat: {
        postMessage: vi
          .fn()
          .mockRejectedValueOnce(
            Object.assign(new Error("user_not_found"), {
              data: { error: "user_not_found" },
            })
          )
          .mockResolvedValueOnce({ ts: "999", channel: "D999" }),
      },
      users: {
        list: vi.fn().mockResolvedValue({
          members: [{ id: "U0999NEW", name: "john", real_name: "John Smith" }],
        }),
      },
    };
    const deps = setup(fakeClient);
    saveCache(deps.configDir, "playfield", {
      users: { john: "U_STALE" },
      channels: {},
      dms: {},
      updatedAt: "",
    });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerMessagingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["send_message"];
    const result = await tool.handler(
      { to: "John", text: "hey", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.users.list).toHaveBeenCalled();
    expect(fakeClient.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(JSON.parse(result.content[0].text)).toEqual({
      ts: "999",
      channel: "D999",
    });

    rmSync(deps.configDir, { recursive: true, force: true });
  });

  it("reuses a cached DM channel and does not re-open the conversation", async () => {
    // Regression guard: WorkspaceCache normalizes ALL keys (including "dms",
    // which are keyed by Slack user ID) to lowercase on write via
    // upsertCacheEntry. A cache-hit lookup that doesn't apply the same
    // normalization to the lookup key would never hit, since real Slack
    // user IDs are uppercase (e.g. "U0123ABCD"). conversations.open is
    // intentionally left unconfigured (no mockResolvedValue) so that if the
    // cache-hit path is bypassed, this test fails loudly instead of
    // silently passing.
    const fakeClient = {
      conversations: { open: vi.fn() },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: "42", channel: "D999" }),
      },
    };
    const deps = setup(fakeClient);
    saveCache(deps.configDir, "playfield", {
      users: { john: "U0123ABCD" },
      channels: {},
      dms: { u0123abcd: "D999" },
      updatedAt: "",
    });

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerMessagingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["send_message"];
    const result = await tool.handler(
      { to: "John", text: "hey", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.conversations.open).not.toHaveBeenCalled();
    expect(fakeClient.chat.postMessage).toHaveBeenCalledWith({
      channel: "D999",
      text: "hey",
    });
    expect(JSON.parse(result.content[0].text)).toEqual({
      ts: "42",
      channel: "D999",
    });

    rmSync(deps.configDir, { recursive: true, force: true });
  });
});

describe("send_file", () => {
  it("uploads a file to the given channel", async () => {
    const fakeClient = {
      filesUploadV2: vi.fn().mockResolvedValue({ ok: true }),
    };
    const deps = setup(fakeClient);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerMessagingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["send_file"];

    const result = await tool.handler(
      { channel: "C01", filePath: "/tmp/report.pdf", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.filesUploadV2).toHaveBeenCalledWith({
      channel_id: "C01",
      file: "/tmp/report.pdf",
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true });

    rmSync(deps.configDir, { recursive: true, force: true });
  });
});

describe("add_reaction", () => {
  it("adds an emoji reaction to a message", async () => {
    const fakeClient = {
      reactions: { add: vi.fn().mockResolvedValue({ ok: true }) },
    };
    const deps = setup(fakeClient);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerMessagingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["add_reaction"];

    const result = await tool.handler(
      {
        channel: "C01",
        ts: "123.456",
        emoji: "thumbsup",
        workspace: "playfield",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.reactions.add).toHaveBeenCalledWith({
      channel: "C01",
      timestamp: "123.456",
      name: "thumbsup",
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true });

    rmSync(deps.configDir, { recursive: true, force: true });
  });
});
