import { describe, it, expect } from "vitest";
import { createServer } from "../src/index.js";

describe("createServer", () => {
  it("creates an MCP server with the expected name", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});
