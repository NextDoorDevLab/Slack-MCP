import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("authorize CLI validation", () => {
  it("exits 1 with a usage message when no workspace is given", () => {
    const result = spawnSync("npx", ["tsx", "src/authorize.ts"], {
      encoding: "utf-8",
      env: { ...process.env },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Usage: authorize <workspace-name>/);
  });

  it("exits 1 with a clear message when client credentials are missing", () => {
    const env = { ...process.env };
    delete env.SLACK_CLIENT_ID_TESTWS;
    delete env.SLACK_CLIENT_SECRET_TESTWS;

    const result = spawnSync("npx", ["tsx", "src/authorize.ts", "testws"], {
      encoding: "utf-8",
      env,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/SLACK_CLIENT_ID_TESTWS/);
    expect(result.stderr).toMatch(/SLACK_CLIENT_SECRET_TESTWS/);
  });
});

describe("authorize CLI — token env var collision", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "slack-mcp-authorize-collide-"));
    writeFileSync(
      join(configDir, "workspaces.json"),
      JSON.stringify({
        "existing-ws": { tokenEnv: "SLACK_TOKEN_COLLIDE" },
      })
    );
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("exits 1 without opening a browser when the derived token env var collides with another workspace", () => {
    const env = {
      ...process.env,
      SLACK_MCP_CONFIG_DIR: configDir,
      SLACK_CLIENT_ID_COLLIDE: "dummy-id",
      SLACK_CLIENT_SECRET_COLLIDE: "dummy-secret",
    };

    const result = spawnSync("npx", ["tsx", "src/authorize.ts", "collide"], {
      encoding: "utf-8",
      env,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/derives the same token env var/);
    expect(result.stderr).toMatch(/SLACK_TOKEN_COLLIDE/);
    expect(result.stderr).toMatch(/existing-ws/);
  });

  it("does not flag a workspace re-authorizing against its own existing entry as a collision", () => {
    // "existing-ws" already owns SLACK_TOKEN_COLLIDE in workspaces.json.
    // Re-running authorize for "existing-ws" itself must not trip the
    // collision check. An invalid port forces a fast, deterministic exit
    // on the next synchronous check instead of opening a browser, which
    // proves the collision check was reached and passed silently.
    const env = {
      ...process.env,
      SLACK_MCP_CONFIG_DIR: configDir,
      SLACK_CLIENT_ID_EXISTING_WS: "dummy-id",
      SLACK_CLIENT_SECRET_EXISTING_WS: "dummy-secret",
      SLACK_MCP_OAUTH_PORT: "not-a-number",
    };

    const result = spawnSync(
      "npx",
      ["tsx", "src/authorize.ts", "existing-ws"],
      { encoding: "utf-8", env }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Invalid SLACK_MCP_OAUTH_PORT/);
    expect(result.stderr).not.toMatch(/derives the same token env var/);
  });
});

describe("authorize CLI — invalid SLACK_MCP_OAUTH_PORT", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "slack-mcp-authorize-port-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("exits 1 with a clear message instead of attempting to listen on NaN", () => {
    const env = {
      ...process.env,
      SLACK_MCP_CONFIG_DIR: configDir,
      SLACK_CLIENT_ID_TESTWS2: "dummy-id",
      SLACK_CLIENT_SECRET_TESTWS2: "dummy-secret",
      SLACK_MCP_OAUTH_PORT: "not-a-number",
    };

    const result = spawnSync("npx", ["tsx", "src/authorize.ts", "testws2"], {
      encoding: "utf-8",
      env,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Invalid SLACK_MCP_OAUTH_PORT/);
  });
});
