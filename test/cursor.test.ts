import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
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
    // Canonical-shaped (10-digit seconds + "." + 6-digit microseconds) so
    // this survives loadCursor's format validation (see the
    // "drops non-canonical ts entries" test below).
    saveCursor(dir, "playfield", { C01: "1700000100.500000" });
    expect(loadCursor(dir, "playfield")).toEqual({
      C01: "1700000100.500000",
    });
  });

  it("advanceCursor only moves forward", () => {
    // Fixed-width, 10-integer-digit values matching real Slack `ts` shape
    // (unlike short ad-hoc numbers, these compare identically as strings
    // and as floats).
    const state = { C01: "1700000200.000000" };
    advanceCursor(state, "C01", "1700000100.000000");
    expect(state.C01).toBe("1700000200.000000");
    advanceCursor(state, "C01", "1700000300.000000");
    expect(state.C01).toBe("1700000300.000000");
    advanceCursor(state, "C02", "1700000010.000000");
    expect(state.C02).toBe("1700000010.000000");
  });

  it("drops non-canonical ts entries on load and warns, keeping valid ones", () => {
    let stderrSpy: MockInstance;
    try {
      stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => true as any
      );

      mkdirSync(join(dir, "cursors"), { recursive: true });
      writeFileSync(
        join(dir, "cursors", "playfield.json"),
        JSON.stringify({
          C01: "1700000200.000000",
          C02: "0",
        })
      );

      const state = loadCursor(dir, "playfield");

      expect(state).toEqual({ C01: "1700000200.000000" });
      expect(stderrSpy).toHaveBeenCalled();
      const warned = stderrSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(warned).toContain("playfield");
      expect(warned).toContain("C02");
      expect(warned).toContain("0");
    } finally {
      stderrSpy!.mockRestore();
    }
  });
});
