import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCanvasTools } from "../../src/tools/canvas.js";
import { WorkspaceRegistry } from "../../src/workspace.js";
import type { ToolDeps } from "../../src/tools/discovery.js";

describe("canvas tools", () => {
  it("creates, reads, and updates a canvas", async () => {
    const fakeClient = {
      canvases: {
        create: vi.fn().mockResolvedValue({ canvas_id: "F01" }),
        edit: vi.fn().mockResolvedValue({ ok: true }),
      },
      files: {
        info: vi.fn().mockResolvedValue({ content: "# Canvas markdown" }),
      },
    };
    const workspaces = { playfield: { tokenEnv: "CV" } };
    process.env.CV = "xoxp-fake";
    const deps: ToolDeps = {
      configDir: "/tmp/unused",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registry: new WorkspaceRegistry(workspaces, () => fakeClient as any),
      directoryMap: {},
      workspaces,
    };

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerCanvasTools(server, deps);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = (server as any)._registeredTools["create_canvas"];
    const created = await create.handler(
      { title: "Notes", markdown: "# Hi", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    expect(fakeClient.canvases.create).toHaveBeenCalled();
    expect(JSON.parse(created.content[0].text)).toEqual({ canvasId: "F01" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = (server as any)._registeredTools["read_canvas"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got = await read.handler(
      { canvasId: "F01", workspace: "playfield" },
      {} as any
    );
    expect(JSON.parse(got.content[0].text)).toEqual({
      markdown: "# Canvas markdown",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = (server as any)._registeredTools["update_canvas"];
    const updated = await update.handler(
      { canvasId: "F01", markdown: "# Updated", workspace: "playfield" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any
    );
    expect(fakeClient.canvases.edit).toHaveBeenCalled();
    expect(JSON.parse(updated.content[0].text)).toEqual({ ok: true });
  });
});
