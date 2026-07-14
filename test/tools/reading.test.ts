import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadingTools } from "../../src/tools/reading.js";
import { WorkspaceRegistry } from "../../src/workspace.js";
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
    });
    expect(JSON.parse(threadResult.content[0].text)).toHaveLength(2);
  });
});
