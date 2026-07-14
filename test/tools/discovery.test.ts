import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerDiscoveryTools,
  type ToolDeps,
} from "../../src/tools/discovery.js";
import { WorkspaceRegistry } from "../../src/workspace.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// NOTE: the installed @modelcontextprotocol/sdk version stores a registered tool's
// invocable function under `.handler` (not `.callback` as some docs/examples assume) —
// see node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js `_createRegisteredTool`.
// `_registeredTools[name]` itself is still the correct lookup.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDeps(fakeClient: any): ToolDeps {
  const configDir = mkdtempSync(join(tmpdir(), "slack-mcp-disc-"));
  const workspaces = { playfield: { tokenEnv: "X" } };
  process.env.X = "xoxp-fake";
  const registry = new WorkspaceRegistry(workspaces, () => fakeClient);
  return {
    configDir,
    registry,
    directoryMap: { "/tmp/project": "playfield" },
    workspaces,
  };
}

describe("discovery tools", () => {
  it("registers list_channels, list_users, and resolve", async () => {
    const fakeClient = {
      users: {
        list: vi.fn().mockResolvedValue({
          members: [{ id: "U01", name: "john", real_name: "John Smith" }],
        }),
      },
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [{ id: "C01", name: "general" }],
        }),
      },
    };
    const deps = makeDeps(fakeClient);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerDiscoveryTools(server, deps);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listChannels = (server as any)._registeredTools["list_channels"];
    const result = await listChannels.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    expect(fakeClient.conversations.list).toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text)).toEqual([
      { id: "C01", name: "general" },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listUsers = (server as any)._registeredTools["list_users"];
    const usersResult = await listUsers.handler(
      { workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    expect(fakeClient.users.list).toHaveBeenCalled();
    expect(JSON.parse(usersResult.content[0].text)).toEqual([
      { id: "U01", name: "john", realName: "John Smith" },
    ]);

    // list_users just cached "john" -> U01, so resolve should now find it without another API call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolve = (server as any)._registeredTools["resolve"];
    const resolveResult = await resolve.handler(
      { name: "john", kind: "users", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    expect(JSON.parse(resolveResult.content[0].text)).toEqual({
      workspace: "playfield",
      status: "found",
      id: "U01",
    });

    rmSync(deps.configDir, { recursive: true, force: true });
  });
});
