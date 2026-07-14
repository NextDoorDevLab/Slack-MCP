import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  resolveWorkspaceFromCwd,
  resolveWorkspace,
  getConfigDir,
  loadWorkspaces,
  loadDirectoryMap,
  loadAppConfig,
  type DirectoryMap,
  type WorkspacesFile,
} from "../src/config.js";

describe("resolveWorkspaceFromCwd", () => {
  const map: DirectoryMap = {
    "/home/bakhtarian/projects/matchable_project": "playfield",
    "/home/bakhtarian/projects/tessly": "nextdoordev",
  };

  it("matches an exact directory", () => {
    expect(
      resolveWorkspaceFromCwd("/home/bakhtarian/projects/tessly", map)
    ).toBe("nextdoordev");
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
    expect(
      resolveWorkspaceFromCwd("/home/bakhtarian/projects/other", map)
    ).toBeNull();
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
      resolveWorkspace(
        "playfield",
        "/home/bakhtarian/projects/tessly",
        map,
        workspaces
      )
    ).toBe("playfield");
  });

  it("falls back to directory-map resolution", () => {
    expect(
      resolveWorkspace(
        undefined,
        "/home/bakhtarian/projects/tessly",
        map,
        workspaces
      )
    ).toBe("nextdoordev");
  });

  it("throws listing configured workspaces when unresolvable", () => {
    expect(() =>
      resolveWorkspace(
        undefined,
        "/home/bakhtarian/projects/other",
        map,
        workspaces
      )
    ).toThrowError(/nextdoordev, playfield/);
  });

  it("throws when the explicit workspace is not configured", () => {
    expect(() =>
      resolveWorkspace(
        "unknown-ws",
        "/home/bakhtarian/projects/tessly",
        map,
        workspaces
      )
    ).toThrowError(/nextdoordev, playfield/);
  });
});

describe("getConfigDir", () => {
  const originalEnv = process.env.SLACK_MCP_CONFIG_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SLACK_MCP_CONFIG_DIR;
    } else {
      process.env.SLACK_MCP_CONFIG_DIR = originalEnv;
    }
  });

  it("returns SLACK_MCP_CONFIG_DIR when set", () => {
    process.env.SLACK_MCP_CONFIG_DIR = "/custom/config/dir";
    expect(getConfigDir()).toBe("/custom/config/dir");
  });

  it("falls back to ~/.slack-mcp when unset", () => {
    delete process.env.SLACK_MCP_CONFIG_DIR;
    expect(getConfigDir()).toBe(join(homedir(), ".slack-mcp"));
  });
});

describe("load* functions", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "slack-mcp-config-test-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  describe("loadWorkspaces", () => {
    it("returns {} when workspaces.json does not exist", () => {
      expect(loadWorkspaces(configDir)).toEqual({});
    });

    it("parses and returns workspaces.json contents when present", () => {
      const data: WorkspacesFile = {
        nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
      };
      writeFileSync(join(configDir, "workspaces.json"), JSON.stringify(data));
      expect(loadWorkspaces(configDir)).toEqual(data);
    });
  });

  describe("loadDirectoryMap", () => {
    it("returns {} when directory-map.json does not exist", () => {
      expect(loadDirectoryMap(configDir)).toEqual({});
    });

    it("parses and returns directory-map.json contents when present", () => {
      const data: DirectoryMap = {
        "/home/bakhtarian/projects/tessly": "nextdoordev",
      };
      writeFileSync(
        join(configDir, "directory-map.json"),
        JSON.stringify(data)
      );
      expect(loadDirectoryMap(configDir)).toEqual(data);
    });
  });

  describe("loadAppConfig", () => {
    it("returns the default fallback when config.json does not exist", () => {
      expect(loadAppConfig(configDir)).toEqual({
        autoReplyRateLimitPerMinute: 5,
      });
    });

    it("parses and returns config.json contents when present", () => {
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({ autoReplyRateLimitPerMinute: 10 })
      );
      expect(loadAppConfig(configDir)).toEqual({
        autoReplyRateLimitPerMinute: 10,
      });
    });
  });

  describe("malformed JSON handling", () => {
    it("throws a clear error naming the file and parse failure", () => {
      const path = join(configDir, "workspaces.json");
      writeFileSync(path, "{ not valid json");
      expect(() => loadWorkspaces(configDir)).toThrowError(
        new RegExp(
          `Malformed JSON in ${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
        )
      );
    });
  });
});
