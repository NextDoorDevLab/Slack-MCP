import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

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
