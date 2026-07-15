import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyToken,
  findTokenEnvCollision,
} from "../../src/oauth/apply-token.js";
import type { WorkspacesFile } from "../../src/config.js";

describe("findTokenEnvCollision", () => {
  const workspaces: WorkspacesFile = {
    "existing-ws": { tokenEnv: "SLACK_TOKEN_COLLIDE" },
  };

  it("finds another workspace already using the same token env var", () => {
    expect(
      findTokenEnvCollision(workspaces, "collide", "SLACK_TOKEN_COLLIDE")
    ).toBe("existing-ws");
  });

  it("excludes the workspace's own entry from the collision check", () => {
    expect(
      findTokenEnvCollision(workspaces, "existing-ws", "SLACK_TOKEN_COLLIDE")
    ).toBeNull();
  });

  it("returns null when no other workspace uses the token env var", () => {
    expect(
      findTokenEnvCollision(workspaces, "playfield", "SLACK_TOKEN_PLAYFIELD")
    ).toBeNull();
  });
});

describe("applyToken", () => {
  let configDir: string;
  let envPath: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "slack-mcp-apply-token-"));
    envPath = join(configDir, ".env");
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("writes the token to .env and the entry to workspaces.json on success", () => {
    const result = applyToken({
      configDir,
      envPath,
      workspace: "playfield",
      tokenVar: "SLACK_TOKEN_PLAYFIELD",
      accessToken: "xoxp-fake",
      seed: "",
    });

    expect(result).toEqual({ collidingWorkspace: null });
    expect(readFileSync(envPath, "utf-8")).toBe(
      "SLACK_TOKEN_PLAYFIELD=xoxp-fake\n"
    );
    expect(
      JSON.parse(readFileSync(join(configDir, "workspaces.json"), "utf-8"))
    ).toEqual({ playfield: { tokenEnv: "SLACK_TOKEN_PLAYFIELD" } });
  });

  it("detects a collision written concurrently after the caller's own snapshot was loaded, and writes nothing", () => {
    // Simulates a second `authorize` run for a colliding workspace name
    // completing while this run was waiting on the OAuth browser flow —
    // the caller's in-memory `workspaces` snapshot (loaded before that
    // wait) would still be empty, but applyToken reloads from disk.
    writeFileSync(
      join(configDir, "workspaces.json"),
      JSON.stringify({
        "existing-ws": { tokenEnv: "SLACK_TOKEN_COLLIDE" },
      })
    );

    const result = applyToken({
      configDir,
      envPath,
      workspace: "collide",
      tokenVar: "SLACK_TOKEN_COLLIDE",
      accessToken: "xoxp-fake",
      seed: "",
    });

    expect(result).toEqual({ collidingWorkspace: "existing-ws" });
    expect(
      JSON.parse(readFileSync(join(configDir, "workspaces.json"), "utf-8"))
    ).toEqual({ "existing-ws": { tokenEnv: "SLACK_TOKEN_COLLIDE" } });
    expect(existsSync(envPath)).toBe(false);
  });

  it("does not flag re-applying a token for the workspace's own existing entry as a collision", () => {
    writeFileSync(
      join(configDir, "workspaces.json"),
      JSON.stringify({
        playfield: { tokenEnv: "SLACK_TOKEN_PLAYFIELD" },
      })
    );

    const result = applyToken({
      configDir,
      envPath,
      workspace: "playfield",
      tokenVar: "SLACK_TOKEN_PLAYFIELD",
      accessToken: "xoxp-new",
      seed: "",
    });

    expect(result).toEqual({ collidingWorkspace: null });
    expect(readFileSync(envPath, "utf-8")).toBe(
      "SLACK_TOKEN_PLAYFIELD=xoxp-new\n"
    );
  });
});
