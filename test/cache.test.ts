import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCache,
  saveCache,
  resolveFromCache,
  upsertCacheEntry,
  dropCacheEntry,
  type WorkspaceCache,
} from "../src/cache.js";

describe("cache", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "slack-mcp-cache-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty cache when no file exists yet", () => {
    const cache = loadCache(dir, "playfield");
    expect(cache).toEqual({
      users: {},
      channels: {},
      dms: {},
      updatedAt: cache.updatedAt,
    });
  });

  it("round-trips through save and load", () => {
    const cache: WorkspaceCache = {
      users: { john: "U0123ABCD" },
      channels: {},
      dms: {},
      updatedAt: "2026-07-14T10:00:00.000Z",
    };
    saveCache(dir, "playfield", cache);
    expect(loadCache(dir, "playfield")).toEqual(cache);
  });

  it("resolves a single exact match", () => {
    const cache: WorkspaceCache = {
      users: { john: "U0123ABCD" },
      channels: {},
      dms: {},
      updatedAt: "",
    };
    expect(resolveFromCache(cache, "users", "John")).toEqual({
      status: "found",
      id: "U0123ABCD",
    });
  });

  it("reports ambiguous when multiple names contain the query", () => {
    const cache: WorkspaceCache = {
      users: { "john smith": "U01", "john osei": "U02" },
      channels: {},
      dms: {},
      updatedAt: "",
    };
    const result = resolveFromCache(cache, "users", "john");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("reports not_found for an unknown name", () => {
    const cache: WorkspaceCache = {
      users: {},
      channels: {},
      dms: {},
      updatedAt: "",
    };
    expect(resolveFromCache(cache, "users", "nobody")).toEqual({
      status: "not_found",
    });
  });

  it("upserts and drops entries", () => {
    const cache: WorkspaceCache = {
      users: {},
      channels: {},
      dms: {},
      updatedAt: "",
    };
    upsertCacheEntry(cache, "users", "john", "U0123ABCD");
    expect(cache.users["john"]).toBe("U0123ABCD");
    dropCacheEntry(cache, "users", "john");
    expect(cache.users["john"]).toBeUndefined();
  });
});
