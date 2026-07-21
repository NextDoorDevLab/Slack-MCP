import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  statSync,
} from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { upsertEnvVar } from "../../src/oauth/env-writer.js";

describe("upsertEnvVar", () => {
  let dir: string;
  let envPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "slack-mcp-envwriter-"));
    envPath = join(dir, ".env");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a new file with just the variable when there is nothing to seed with", () => {
    upsertEnvVar(envPath, "SLACK_TOKEN_PLAYFIELD", "xoxp-abc");
    expect(readFileSync(envPath, "utf-8")).toBe(
      "SLACK_TOKEN_PLAYFIELD=xoxp-abc\n"
    );
  });

  it("seeds a new file from the given content and appends the variable", () => {
    upsertEnvVar(
      envPath,
      "SLACK_TOKEN_PLAYFIELD",
      "xoxp-abc",
      "# comment\nOTHER_VAR=1\n"
    );
    expect(readFileSync(envPath, "utf-8")).toBe(
      "# comment\nOTHER_VAR=1\nSLACK_TOKEN_PLAYFIELD=xoxp-abc\n"
    );
  });

  it("replaces an existing variable in place, preserving other lines", () => {
    writeFileSync(
      envPath,
      "# comment\nSLACK_TOKEN_PLAYFIELD=xoxp-old\nOTHER_VAR=1\n"
    );
    upsertEnvVar(envPath, "SLACK_TOKEN_PLAYFIELD", "xoxp-new");
    expect(readFileSync(envPath, "utf-8")).toBe(
      "# comment\nSLACK_TOKEN_PLAYFIELD=xoxp-new\nOTHER_VAR=1\n"
    );
  });

  it("appends the variable when the file exists but doesn't have it yet", () => {
    writeFileSync(envPath, "OTHER_VAR=1\n");
    upsertEnvVar(envPath, "SLACK_TOKEN_PLAYFIELD", "xoxp-new");
    expect(readFileSync(envPath, "utf-8")).toBe(
      "OTHER_VAR=1\nSLACK_TOKEN_PLAYFIELD=xoxp-new\n"
    );
  });

  it("re-hardens file permissions when updating an existing file with loose permissions", () => {
    if (platform() === "win32") return;
    writeFileSync(envPath, "OTHER_VAR=1\n", { mode: 0o644 });
    upsertEnvVar(envPath, "SLACK_TOKEN_PLAYFIELD", "xoxp-new");
    const mode = statSync(envPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("writes the file as owner-only (0600)", () => {
    if (platform() === "win32") return;
    upsertEnvVar(envPath, "SLACK_TOKEN_PLAYFIELD", "xoxp-abc");
    const mode = statSync(envPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
