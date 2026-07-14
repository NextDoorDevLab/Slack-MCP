import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadingTools } from "../../src/tools/reading.js";
import { WorkspaceRegistry } from "../../src/workspace.js";
import { saveCursor, loadCursor } from "../../src/cursor.js";
import type { ToolDeps } from "../../src/tools/discovery.js";

describe("reading tools", () => {
  it("read_channel_history returns messages", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient: any = {
      conversations: {
        history: vi.fn().mockResolvedValue({
          messages: [{ ts: "1", user: "U01", text: "hi" }],
        }),
        replies: vi.fn().mockResolvedValue({
          messages: [
            { ts: "1", user: "U01", text: "hi" },
            { ts: "2", user: "U02", text: "hey" },
          ],
        }),
      },
    };
    const workspaces = { playfield: { tokenEnv: "Z" } };
    process.env.Z = "xoxp-fake";
    const deps: ToolDeps = {
      configDir: "/tmp/unused",
      registry: new WorkspaceRegistry(workspaces, () => fakeClient),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history = (server as any)._registeredTools["read_channel_history"];
    const historyResult = await history.handler(
      { channel: "C01", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    expect(fakeClient.conversations.history).toHaveBeenCalledWith({
      channel: "C01",
      limit: 20,
    });
    expect(JSON.parse(historyResult.content[0].text)).toEqual([
      { ts: "1", user: "U01", text: "hi" },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thread = (server as any)._registeredTools["read_thread"];
    const threadResult = await thread.handler(
      { channel: "C01", threadTs: "1", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    expect(fakeClient.conversations.replies).toHaveBeenCalledWith({
      channel: "C01",
      ts: "1",
      cursor: undefined,
    });
    expect(JSON.parse(threadResult.content[0].text)).toHaveLength(2);
  });

  it("paginates read_thread across multiple pages via response_metadata.next_cursor", async () => {
    const fakeClient = {
      conversations: {
        history: vi.fn(),
        replies: vi
          .fn()
          .mockResolvedValueOnce({
            messages: [{ ts: "1", user: "U01", text: "hi" }],
            response_metadata: { next_cursor: "cursor-1" },
          })
          .mockResolvedValueOnce({
            messages: [{ ts: "2", user: "U02", text: "hey" }],
            response_metadata: { next_cursor: "" },
          }),
      },
    };
    const workspaces = { playfield: { tokenEnv: "Z" } };
    process.env.Z = "xoxp-fake";
    const deps: ToolDeps = {
      configDir: "/tmp/unused",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thread = (server as any)._registeredTools["read_thread"];
    const threadResult = await thread.handler(
      { channel: "C01", threadTs: "1", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.conversations.replies).toHaveBeenCalledTimes(2);
    expect(fakeClient.conversations.replies).toHaveBeenNthCalledWith(1, {
      channel: "C01",
      ts: "1",
      cursor: undefined,
    });
    expect(fakeClient.conversations.replies).toHaveBeenNthCalledWith(2, {
      channel: "C01",
      ts: "1",
      cursor: "cursor-1",
    });
    expect(JSON.parse(threadResult.content[0].text)).toEqual([
      { ts: "1", user: "U01", text: "hi" },
      { ts: "2", user: "U02", text: "hey" },
    ]);
  });
});

describe("get_new_messages", () => {
  it("returns messages newer than the stored cursor and advances it", async () => {
    const fakeClient = {
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [{ id: "C01", name: "general", is_member: true }],
        }),
        history: vi.fn().mockResolvedValue({
          messages: [
            { ts: "1700000200.000000", user: "U01", text: "new one" },
            { ts: "1700000100.000000", user: "U02", text: "old one" },
          ],
        }),
      },
    };
    const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-newmsg-"));
    // Canonical-shaped ts (10-digit seconds + "." + 6-digit microseconds) so
    // loadCursor's format validation (see cursor.test.ts) doesn't drop it.
    saveCursor(configDir, "playfield", { C01: "1700000100.000000" });
    const workspaces = { playfield: { tokenEnv: "NM" } };
    process.env.NM = "xoxp-fake";
    const deps: ToolDeps = {
      configDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["get_new_messages"];
    const result = await tool.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.messages).toEqual([
      {
        channel: "C01",
        ts: "1700000200.000000",
        user: "U01",
        text: "new one",
      },
    ]);
    expect(parsed.policyText).toBeNull();
    expect(loadCursor(configDir, "playfield")).toEqual({
      C01: "1700000200.000000",
    });

    rmSync(configDir, { recursive: true, force: true });
  });

  it("follows multiple history pages within the cap and advances the cursor to the newest ts (exhausted case)", async () => {
    const fakeClient = {
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [{ id: "C01", name: "general", is_member: true }],
        }),
        history: vi
          .fn()
          .mockResolvedValueOnce({
            messages: [{ ts: "1700000150.000000", user: "U01", text: "page1" }],
            response_metadata: { next_cursor: "page-2" },
          })
          .mockResolvedValueOnce({
            messages: [{ ts: "1700000120.000000", user: "U02", text: "page2" }],
            response_metadata: { next_cursor: "" },
          }),
      },
    };
    const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-newmsg-"));
    // Canonical-shaped ts (10-digit seconds + "." + 6-digit microseconds) so
    // loadCursor's format validation (see cursor.test.ts) doesn't drop it.
    saveCursor(configDir, "playfield", { C01: "1700000100.000000" });
    const workspaces = { playfield: { tokenEnv: "NM2" } };
    process.env.NM2 = "xoxp-fake";
    const deps: ToolDeps = {
      configDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["get_new_messages"];
    const result = await tool.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.conversations.history).toHaveBeenCalledTimes(2);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.messages).toEqual([
      {
        channel: "C01",
        ts: "1700000120.000000",
        user: "U02",
        text: "page2",
      },
      {
        channel: "C01",
        ts: "1700000150.000000",
        user: "U01",
        text: "page1",
      },
    ]);
    // Fully drained (no next_cursor left) -> cursor advances to the newest ts.
    expect(loadCursor(configDir, "playfield")).toEqual({
      C01: "1700000150.000000",
    });

    rmSync(configDir, { recursive: true, force: true });
  });

  it("caps per-channel history at 5 pages and advances the cursor only to the oldest fetched ts (capped case)", async () => {
    const history = vi.fn();
    // Fixed-width, 10-integer-digit values matching real Slack `ts` shape —
    // unlike short ad-hoc numbers (e.g. "50.0" vs "600.0"), these compare
    // identically whether treated as strings or floats.
    const tsByPage = [
      "1700000600.000000",
      "1700000500.000000",
      "1700000400.000000",
      "1700000300.000000",
      "1700000200.000000",
    ];
    tsByPage.forEach((ts, i) => {
      const isLastPage = i === tsByPage.length - 1;
      history.mockResolvedValueOnce({
        messages: [{ ts, user: `U0${i}`, text: `page${i + 1}` }],
        // Even the last page we're willing to fetch still reports more
        // history available beyond it — that's what makes this "capped".
        response_metadata: {
          next_cursor: isLastPage ? "page-6" : `page-${i + 2}`,
        },
      });
    });
    const fakeClient = {
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [{ id: "C01", name: "general", is_member: true }],
        }),
        history,
      },
    };
    const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-newmsg-"));
    saveCursor(configDir, "playfield", { C01: "1700000000.000000" });
    const workspaces = { playfield: { tokenEnv: "NM3" } };
    process.env.NM3 = "xoxp-fake";
    const deps: ToolDeps = {
      configDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["get_new_messages"];
    const result = await tool.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    // The cap (5 pages) must stop the loop even though the 5th page still
    // reported a next_cursor (more backlog exists beyond the cap).
    expect(history).toHaveBeenCalledTimes(5);
    const parsed = JSON.parse(result.content[0].text);
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsed.messages.map((m: any) => m.ts)
    ).toEqual([
      "1700000200.000000",
      "1700000300.000000",
      "1700000400.000000",
      "1700000500.000000",
      "1700000600.000000",
    ]);

    // Capped: the cursor must advance only to the OLDEST ts actually fetched
    // this poll (1700000200.000000), NOT the newest (1700000600.000000).
    // Advancing to the newest here would permanently skip the
    // still-unfetched backlog beyond page 5 on every future poll, since it
    // would now fall before the cursor.
    expect(loadCursor(configDir, "playfield")).toEqual({
      C01: "1700000200.000000",
    });

    rmSync(configDir, { recursive: true, force: true });
  });

  it("paginates the channel list across multiple pages via response_metadata.next_cursor", async () => {
    const fakeClient = {
      conversations: {
        list: vi
          .fn()
          .mockResolvedValueOnce({
            channels: [{ id: "C01", name: "general", is_member: true }],
            response_metadata: { next_cursor: "cursor-1" },
          })
          .mockResolvedValueOnce({
            channels: [{ id: "C02", name: "random", is_member: true }],
            response_metadata: { next_cursor: "" },
          }),
        history: vi.fn().mockResolvedValue({ messages: [] }),
      },
    };
    const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-newmsg-"));
    const workspaces = { playfield: { tokenEnv: "NM4" } };
    process.env.NM4 = "xoxp-fake";
    const deps: ToolDeps = {
      configDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["get_new_messages"];
    await tool.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.conversations.list).toHaveBeenCalledTimes(2);
    expect(fakeClient.conversations.list).toHaveBeenNthCalledWith(1, {
      types: "public_channel,private_channel,im",
      cursor: undefined,
    });
    expect(fakeClient.conversations.list).toHaveBeenNthCalledWith(2, {
      types: "public_channel,private_channel,im",
      cursor: "cursor-1",
    });
    // Both pages' channels must have been polled for history — proving the
    // second page of channels isn't silently dropped.
    expect(fakeClient.conversations.history).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "C01" })
    );
    expect(fakeClient.conversations.history).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "C02" })
    );

    rmSync(configDir, { recursive: true, force: true });
  });

  it("records a failing channel in skippedChannels without blocking other channels", async () => {
    const fakeClient = {
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [
            { id: "C01", name: "broken", is_member: true },
            { id: "C02", name: "fine", is_member: true },
          ],
        }),
        history: vi
          .fn()
          .mockImplementation(async ({ channel }: { channel: string }) => {
            if (channel === "C01") throw new Error("not_in_channel");
            return { messages: [{ ts: "10.0", user: "U01", text: "hi" }] };
          }),
      },
    };
    const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-newmsg-"));
    const workspaces = { playfield: { tokenEnv: "NM5" } };
    process.env.NM5 = "xoxp-fake";
    const deps: ToolDeps = {
      configDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["get_new_messages"];
    const result = await tool.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.skippedChannels).toEqual([
      { channel: "C01", error: "not_in_channel" },
    ]);
    expect(parsed.messages).toEqual([
      { channel: "C02", ts: "10.0", user: "U01", text: "hi" },
    ]);

    rmSync(configDir, { recursive: true, force: true });
  });

  it("annotates matching messages with a ruleMatch and includes policyText", async () => {
    const fakeClient = {
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [{ id: "C01", name: "general", is_member: true }],
        }),
        history: vi.fn().mockResolvedValue({
          messages: [
            { ts: "200.0", user: "U01", text: "found a bug in prod" },
            { ts: "300.0", user: "U02", text: "no rule for this one" },
          ],
        }),
      },
    };
    const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-newmsg-"));
    saveCursor(configDir, "playfield", { C01: "100.0" });
    writeFileSync(
      join(configDir, "rules.json"),
      JSON.stringify([
        { name: "bug ack", channel: "C01", pattern: "bug", template: "On it" },
      ])
    );
    writeFileSync(join(configDir, "policy.md"), "## Auto-approved\n- Thanks");
    const workspaces = { playfield: { tokenEnv: "NM6" } };
    process.env.NM6 = "xoxp-fake";
    const deps: ToolDeps = {
      configDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerReadingTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["get_new_messages"];
    const result = await tool.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.messages).toEqual([
      {
        channel: "C01",
        ts: "200.0",
        user: "U01",
        text: "found a bug in prod",
        ruleMatch: { name: "bug ack", suggestedText: "On it" },
      },
      {
        channel: "C01",
        ts: "300.0",
        user: "U02",
        text: "no rule for this one",
      },
    ]);
    expect(parsed.policyText).toContain("Auto-approved");

    rmSync(configDir, { recursive: true, force: true });
  });
});
