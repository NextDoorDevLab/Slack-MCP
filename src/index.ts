import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfigDir, loadWorkspaces, loadDirectoryMap } from "./config.js";
import { WorkspaceRegistry } from "./workspace.js";
import { registerDiscoveryTools, type ToolDeps } from "./tools/discovery.js";
import { registerMessagingTools } from "./tools/messaging.js";
import { registerReadingTools } from "./tools/reading.js";
import { registerSearchTools } from "./tools/search.js";
import { registerCanvasTools } from "./tools/canvas.js";

export function createServer(): McpServer {
  return new McpServer({ name: "slack-mcp", version: "0.1.0" });
}

function buildDeps(): ToolDeps {
  const configDir = getConfigDir();
  const workspaces = loadWorkspaces(configDir);
  const directoryMap = loadDirectoryMap(configDir);
  return {
    configDir,
    registry: new WorkspaceRegistry(workspaces),
    directoryMap,
    workspaces,
  };
}

async function main() {
  const server = createServer();
  const deps = buildDeps();
  registerDiscoveryTools(server, deps);
  registerMessagingTools(server, deps);
  registerReadingTools(server, deps);
  registerSearchTools(server, deps);
  registerCanvasTools(server, deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("slack-mcp fatal error:", err);
    process.exit(1);
  });
}
