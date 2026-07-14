import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCursor, saveCursor, advanceCursor } from "../src/cursor.js";

describe("cursor", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "slack-mcp-cursor-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns empty state when no file exists", () => {
    expect(loadCursor(dir, "playfield")).toEqual({});
  });

  it("round-trips through save and load", () => {
    saveCursor(dir, "playfield", { C01: "100.5" });
    expect(loadCursor(dir, "playfield")).toEqual({ C01: "100.5" });
  });

  it("advanceCursor only moves forward", () => {
    const state = { C01: "100.5" };
    advanceCursor(state, "C01", "50.0");
    expect(state.C01).toBe("100.5");
    advanceCursor(state, "C01", "200.0");
    expect(state.C01).toBe("200.0");
    advanceCursor(state, "C02", "10.0");
    expect(state.C02).toBe("10.0");
  });
});
