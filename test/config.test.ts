import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  statSync,
  chmodSync,
} from "node:fs";
import { tmpdir, homedir, platform } from "node:os";
import { join } from "node:path";
import {
  resolveWorkspaceFromCwd,
  resolveWorkspace,
  getConfigDir,
  loadWorkspaces,
  saveWorkspaces,
  loadDirectoryMap,
  loadAppConfig,
  type DirectoryMap,
  type WorkspacesFile,
} from "../src/config.js";

describe("resolveWorkspaceFromCwd", () => {
  const map: DirectoryMap = {
    "/home/you/projects/client-a": "playfield",
    "/home/you/projects/client-b": "nextdoordev",
  };

  it("matches an exact directory", () => {
    expect(resolveWorkspaceFromCwd("/home/you/projects/client-b", map)).toBe(
      "nextdoordev"
    );
  });

  it("matches a subdirectory via longest prefix", () => {
    expect(
      resolveWorkspaceFromCwd("/home/you/projects/client-a/src", map)
    ).toBe("playfield");
  });

  it("returns null when nothing matches", () => {
    expect(resolveWorkspaceFromCwd("/home/you/projects/other", map)).toBeNull();
  });

  it("prefers the longer of two overlapping prefixes", () => {
    const overlapping: DirectoryMap = {
      "/home/you/projects": "default-ws",
      "/home/you/projects/client-b": "nextdoordev",
    };
    expect(
      resolveWorkspaceFromCwd("/home/you/projects/client-b", overlapping)
    ).toBe("nextdoordev");
  });
});

describe("resolveWorkspace", () => {
  const map: DirectoryMap = {
    "/home/you/projects/client-b": "nextdoordev",
  };
  const workspaces: WorkspacesFile = {
    nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
    playfield: { tokenEnv: "SLACK_TOKEN_PLAYFIELD" },
  };

  it("uses the explicit workspace when given", () => {
    expect(
      resolveWorkspace(
        "playfield",
        "/home/you/projects/client-b",
        map,
        workspaces
      )
    ).toBe("playfield");
  });

  it("falls back to directory-map resolution", () => {
    expect(
      resolveWorkspace(
        undefined,
        "/home/you/projects/client-b",
        map,
        workspaces
      )
    ).toBe("nextdoordev");
  });

  it("throws listing configured workspaces when unresolvable", () => {
    expect(() =>
      resolveWorkspace(undefined, "/home/you/projects/other", map, workspaces)
    ).toThrowError(/nextdoordev, playfield/);
  });

  it("throws when the explicit workspace is not configured", () => {
    expect(() =>
      resolveWorkspace(
        "unknown-ws",
        "/home/you/projects/client-b",
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
        "/home/you/projects/client-b": "nextdoordev",
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

describe("saveWorkspaces", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "slack-mcp-config-save-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("creates the config directory and workspaces.json when neither exists", () => {
    const data: WorkspacesFile = {
      nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
    };
    saveWorkspaces(configDir, data);
    expect(loadWorkspaces(configDir)).toEqual(data);
  });

  it("overwrites an existing workspaces.json with the given contents", () => {
    saveWorkspaces(configDir, {
      nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
    });
    const updated: WorkspacesFile = {
      nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
      playfield: { tokenEnv: "SLACK_TOKEN_PLAYFIELD" },
    };
    saveWorkspaces(configDir, updated);
    expect(loadWorkspaces(configDir)).toEqual(updated);
  });

  it("writes the file and directory as owner-only (0600/0700)", () => {
    if (platform() === "win32") return;
    saveWorkspaces(configDir, {
      nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
    });
    const fileMode = statSync(join(configDir, "workspaces.json")).mode & 0o777;
    const dirMode = statSync(configDir).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(dirMode).toBe(0o700);
  });

  it("re-hardens permissions when overwriting a pre-existing loose-permission workspaces.json", () => {
    if (platform() === "win32") return;
    writeFileSync(join(configDir, "workspaces.json"), "{}", { mode: 0o644 });
    saveWorkspaces(configDir, {
      nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
    });
    const fileMode = statSync(join(configDir, "workspaces.json")).mode & 0o777;
    expect(fileMode).toBe(0o600);
  });

  it("re-hardens permissions on a pre-existing loose-permission config directory", () => {
    if (platform() === "win32") return;
    chmodSync(configDir, 0o755);
    saveWorkspaces(configDir, {
      nextdoordev: { tokenEnv: "SLACK_TOKEN_NEXTDOORDEV" },
    });
    const dirMode = statSync(configDir).mode & 0o777;
    expect(dirMode).toBe(0o700);
  });
});
