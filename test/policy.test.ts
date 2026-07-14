import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRules, matchRules, loadPolicyText } from "../src/policy.js";

describe("policy", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "slack-mcp-policy-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns an empty rule list when rules.json is absent", () => {
    expect(loadRules(dir, "playfield")).toEqual([]);
  });

  it("loads rules.json when present", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "rules.json"),
      JSON.stringify([
        {
          name: "bug ack",
          channel: "C01",
          pattern: "bug",
          template: "On it, will review today",
        },
      ])
    );
    expect(loadRules(dir, "playfield")).toEqual([
      {
        name: "bug ack",
        channel: "C01",
        pattern: "bug",
        template: "On it, will review today",
      },
    ]);
  });

  it("matches a rule by channel and pattern", () => {
    const rules = [
      { name: "bug ack", channel: "C01", pattern: "bug", template: "On it" },
    ];
    const result = matchRules(rules, {
      channel: "C01",
      text: "found a bug in prod",
    });
    expect(result).toEqual({ matched: true, rule: rules[0] });
  });

  it("does not match when the channel differs", () => {
    const rules = [
      { name: "bug ack", channel: "C01", pattern: "bug", template: "On it" },
    ];
    expect(matchRules(rules, { channel: "C02", text: "found a bug" })).toEqual({
      matched: false,
    });
  });

  it("matches any channel when the rule omits one", () => {
    const rules = [
      { name: "thanks", pattern: "thanks", template: "You're welcome!" },
    ];
    expect(matchRules(rules, { channel: "C99", text: "thanks!" })).toEqual({
      matched: true,
      rule: rules[0],
    });
  });

  it("returns null policy text when policy.md is absent", () => {
    expect(loadPolicyText(dir)).toBeNull();
  });

  it("loads policy.md content when present", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "policy.md"),
      "## Auto-approved\n- Simple acknowledgements"
    );
    expect(loadPolicyText(dir)).toContain("Auto-approved");
  });
});
