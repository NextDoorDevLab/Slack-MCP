import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTools } from "../../src/tools/search.js";
import { WorkspaceRegistry } from "../../src/workspace.js";
import type { ToolDeps } from "../../src/tools/discovery.js";

describe("search_messages", () => {
  it("returns matched messages", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient: any = {
      search: {
        messages: vi.fn().mockResolvedValue({
          messages: {
            matches: [{ ts: "1", channel: { id: "C01" }, text: "found it" }],
          },
        }),
      },
    };
    const workspaces = { playfield: { tokenEnv: "SQ" } };
    process.env.SQ = "xoxp-fake";
    const deps: ToolDeps = {
      configDir: "/tmp/unused",
      registry: new WorkspaceRegistry(workspaces, () => fakeClient),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerSearchTools(server, deps);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools["search_messages"];
    const result = await tool.handler(
      { query: "found it", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );

    expect(fakeClient.search.messages).toHaveBeenCalledWith({
      query: "found it",
    });
    expect(JSON.parse(result.content[0].text)).toEqual([
      { ts: "1", channel: "C01", text: "found it" },
    ]);
  });
});
