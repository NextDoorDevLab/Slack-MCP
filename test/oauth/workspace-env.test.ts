import { describe, it, expect } from "vitest";
import {
  deriveEnvSuffix,
  deriveClientIdEnvVar,
  deriveClientSecretEnvVar,
  deriveTokenEnvVar,
} from "../../src/oauth/workspace-env.js";

describe("workspace-env", () => {
  it("uppercases a plain alphanumeric workspace name", () => {
    expect(deriveEnvSuffix("nextdoordev")).toBe("NEXTDOORDEV");
  });

  it("replaces non-alphanumeric characters with underscores", () => {
    expect(deriveEnvSuffix("client-a-workspace")).toBe("CLIENT_A_WORKSPACE");
  });

  it("normalizes mixed-case input", () => {
    expect(deriveEnvSuffix("PlayField")).toBe("PLAYFIELD");
  });

  it("derives the client id, client secret, and token env var names", () => {
    expect(deriveClientIdEnvVar("playfield")).toBe(
      "SLACK_CLIENT_ID_PLAYFIELD"
    );
    expect(deriveClientSecretEnvVar("playfield")).toBe(
      "SLACK_CLIENT_SECRET_PLAYFIELD"
    );
    expect(deriveTokenEnvVar("playfield")).toBe("SLACK_TOKEN_PLAYFIELD");
  });
});
