import { describe, it, expect } from "vitest";
import {
  resolveWorkspaceFromCwd,
  resolveWorkspace,
  type DirectoryMap,
  type WorkspacesFile,
} from "../src/config.js";

describe("resolveWorkspaceFromCwd", () => {
  const map: DirectoryMap = {
    "/home/bakhtarian/projects/matchable_project": "playfield",
    "/home/bakhtarian/projects/tessly": "nextdoordev",
  };

  it("matches an exact directory", () => {
    expect(resolveWorkspaceFromCwd("/home/bakhtarian/projects/tessly", map)).toBe(
      "nextdoordev"
    );
  });

  it("matches a subdirectory via longest prefix", () => {
    expect(
      resolveWorkspaceFromCwd(
        "/home/bakhtarian/projects/matchable_project/src",
        map
      )
    ).toBe("playfield");
  });

  it("returns null when nothing matches", () => {
    expect(resolveWorkspaceFromCwd("/home/bakhtarian/projects/other", map)).toBeNull();
  });

  it("prefers the longer of two overlapping prefixes", () => {
    const overlapping: DirectoryMap = {
      "/home/bakhtarian/projects": "default-ws",
      "/home/bakhtarian/projects/tessly": "nextdoordev",
    };
    expect(
      resolveWorkspaceFromCwd("/home/bakhtarian/projects/tessly", overlapping)
    ).toBe("nextdoordev");
  });
});

describe("resolveWorkspace", () => {
  const map: DirectoryMap = {
    "/home/bakhtarian/projects/tessly": "nextdoordev",
  };
  const workspaces: WorkspacesFile = {
    nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
    playfield: { tokenEnv: "SLACK_TOKEN_PLAYFIELD" },
  };

  it("uses the explicit workspace when given", () => {
    expect(
      resolveWorkspace("playfield", "/home/bakhtarian/projects/tessly", map, workspaces)
    ).toBe("playfield");
  });

  it("falls back to directory-map resolution", () => {
    expect(
      resolveWorkspace(undefined, "/home/bakhtarian/projects/tessly", map, workspaces)
    ).toBe("nextdoordev");
  });

  it("throws listing configured workspaces when unresolvable", () => {
    expect(() =>
      resolveWorkspace(undefined, "/home/bakhtarian/projects/other", map, workspaces)
    ).toThrowError(/nextdoordev, playfield/);
  });

  it("throws when the explicit workspace is not configured", () => {
    expect(() =>
      resolveWorkspace("unknown-ws", "/home/bakhtarian/projects/tessly", map, workspaces)
    ).toThrowError(/nextdoordev, playfield/);
  });
});
