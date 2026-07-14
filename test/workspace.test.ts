import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceRegistry } from "../src/workspace.js";
import type { WorkspacesFile } from "../src/config.js";

describe("WorkspaceRegistry", () => {
  const workspaces: WorkspacesFile = {
    playfield: { tokenEnv: "TEST_SLACK_TOKEN_PLAYFIELD" },
  };

  beforeEach(() => {
    process.env.TEST_SLACK_TOKEN_PLAYFIELD = "xoxp-fake-token";
  });

  afterEach(() => {
    delete process.env.TEST_SLACK_TOKEN_PLAYFIELD;
  });

  it("lists configured workspace names", () => {
    const registry = new WorkspaceRegistry(workspaces);
    expect(registry.list()).toEqual(["playfield"]);
  });

  it("builds a client lazily using the injected factory", () => {
    const seenTokens: string[] = [];
    const registry = new WorkspaceRegistry(workspaces, (token) => {
      seenTokens.push(token);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { fake: true } as any;
    });
    const { name, client } = registry.get("playfield");
    expect(name).toBe("playfield");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).fake).toBe(true);
    expect(seenTokens).toEqual(["xoxp-fake-token"]);
  });

  it("reuses the same client instance on repeated get() calls", () => {
    let calls = 0;
    const registry = new WorkspaceRegistry(workspaces, () => {
      calls += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {} as any;
    });
    registry.get("playfield");
    registry.get("playfield");
    expect(calls).toBe(1);
  });

  it("throws naming the missing env var when the token is unset", () => {
    delete process.env.TEST_SLACK_TOKEN_PLAYFIELD;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = new WorkspaceRegistry(workspaces, (t) => ({ t }) as any);
    expect(() => registry.get("playfield")).toThrowError(
      /TEST_SLACK_TOKEN_PLAYFIELD/
    );
  });

  it("throws listing configured workspaces for an unknown workspace", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = new WorkspaceRegistry(workspaces, (t) => ({ t }) as any);
    expect(() => registry.get("unknown")).toThrowError(/playfield/);
  });
});
