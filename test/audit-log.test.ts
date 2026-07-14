import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAuditLog, readAuditLog } from "../src/audit-log.js";

describe("audit log", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "slack-mcp-audit-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns an empty array when no log exists yet", () => {
    expect(readAuditLog(dir)).toEqual([]);
  });

  it("appends entries as JSONL and reads them back in order", () => {
    appendAuditLog(dir, {
      ts: "2026-07-14T10:00:00.000Z",
      workspace: "playfield",
      to: "john",
      text: "On it",
      matchedRule: "bug report ack",
    });
    appendAuditLog(dir, {
      ts: "2026-07-14T10:05:00.000Z",
      workspace: "playfield",
      to: "sara",
      text: "Thanks!",
      matchedRule: "simple acknowledgement",
    });

    const entries = readAuditLog(dir);
    expect(entries).toHaveLength(2);
    expect(entries[0].to).toBe("john");
    expect(entries[1].to).toBe("sara");
  });
});
