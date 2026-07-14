import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWorkspace } from "../config.js";
import type { ToolDeps } from "./discovery.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerCanvasTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "create_canvas",
    "Create a new Slack canvas",
    {
      title: z.string(),
      markdown: z.string(),
      workspace: z.string().optional(),
    },
    async ({ title, markdown, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const res = await client.canvases.create({
        title,
        document_content: { type: "markdown", markdown },
      });
      return json({ canvasId: res.canvas_id });
    }
  );

  server.tool(
    "read_canvas",
    "Read a Slack canvas as markdown",
    { canvasId: z.string(), workspace: z.string().optional() },
    async ({ canvasId, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const res = await client.files.info({ file: canvasId });
      return json({ markdown: res.content });
    }
  );

  server.tool(
    "update_canvas",
    "Replace a Slack canvas's content",
    {
      canvasId: z.string(),
      markdown: z.string(),
      workspace: z.string().optional(),
    },
    async ({ canvasId, markdown, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const res = await client.canvases.edit({
        canvas_id: canvasId,
        changes: [
          {
            operation: "replace",
            document_content: { type: "markdown", markdown },
          },
        ],
      });
      return json({ ok: res.ok });
    }
  );
}
