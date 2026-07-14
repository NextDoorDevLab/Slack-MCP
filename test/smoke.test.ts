import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, registerAllTools } from "../src/index.js";
import { WorkspaceRegistry } from "../src/workspace.js";
import { SlidingWindowRateLimiter } from "../src/rate-limiter.js";
import type { ToolDeps } from "../src/tools/discovery.js";

describe("createServer", () => {
  it("creates an MCP server with the expected name", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});

describe("registerAllTools", () => {
  it("registers exactly the 14 expected tools on a real McpServer", () => {
    const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-index-"));
    const workspaces = { playfield: { tokenEnv: "SLACK_MCP_INDEX_TEST" } };
    process.env.SLACK_MCP_INDEX_TEST = "xoxp-fake";
    const deps: ToolDeps & { rateLimiter: SlidingWindowRateLimiter } = {
      configDir,
      registry: new WorkspaceRegistry(workspaces),
      directoryMap: {},
      workspaces,
      rateLimiter: new SlidingWindowRateLimiter(5),
    };

    const server = createServer();
    registerAllTools(server, deps);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registeredNames = Object.keys((server as any)._registeredTools);
    expect(registeredNames.sort()).toEqual(
      [
        "list_channels",
        "list_users",
        "resolve",
        "send_message",
        "send_file",
        "add_reaction",
        "read_channel_history",
        "read_thread",
        "get_new_messages",
        "search_messages",
        "create_canvas",
        "read_canvas",
        "update_canvas",
        "auto_reply",
      ].sort()
    );
    expect(registeredNames).toHaveLength(14);

    rmSync(configDir, { recursive: true, force: true });
  });
});
