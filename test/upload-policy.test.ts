import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  getDenylistPath,
  ensureDenylistFile,
  loadDenylistPatterns,
  isUploadAllowed,
} from "../src/upload-policy.js";

describe("upload-policy", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "slack-mcp-upload-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("bootstraps the denylist file with defaults on first use", () => {
    expect(existsSync(getDenylistPath(dir))).toBe(false);
    const result = ensureDenylistFile(dir);
    expect(result.created).toBe(true);
    expect(existsSync(getDenylistPath(dir))).toBe(true);
    const content = readFileSync(getDenylistPath(dir), "utf-8");
    expect(content).toContain(".ssh/**");
  });

  it("bootstraps successfully when configDir itself does not exist yet", () => {
    // A truly fresh install: nothing has created ~/.slack-mcp/ yet (the
    // config loaders in config.ts are read-only-if-exists), so send_file
    // can be the very first tool call. `missingConfigDir` here is a path
    // under `dir` that was never created by beforeEach.
    const missingConfigDir = join(dir, "not-created-yet");
    expect(existsSync(missingConfigDir)).toBe(false);

    const result = ensureDenylistFile(missingConfigDir);

    expect(result.created).toBe(true);
    expect(existsSync(missingConfigDir)).toBe(true);
    expect(existsSync(getDenylistPath(missingConfigDir))).toBe(true);

    const decision = isUploadAllowed(
      missingConfigDir,
      join(homedir(), ".ssh", "id_rsa")
    );
    expect(decision.allowed).toBe(false);
  });

  it("does not overwrite an existing denylist file", () => {
    ensureDenylistFile(dir);
    writeFileSync(
      getDenylistPath(dir),
      "# custom rules only\n*.custom-secret\n"
    );
    const result = ensureDenylistFile(dir);
    expect(result.created).toBe(false);
    expect(readFileSync(getDenylistPath(dir), "utf-8")).toContain(
      "custom-secret"
    );
  });

  it("denies a path matching a default sensitive pattern", () => {
    const target = join(homedir(), ".ssh", "id_rsa");
    const decision = isUploadAllowed(dir, target);
    expect(decision.allowed).toBe(false);
  });

  it("allows a path matching no rule by default", () => {
    const target = join(homedir(), "Documents", "report.pdf");
    const decision = isUploadAllowed(dir, target);
    expect(decision.allowed).toBe(true);
  });

  it("supports deny-all-then-negate for a strict allowlist-style policy", () => {
    ensureDenylistFile(dir);
    const allowedRoot = join(homedir(), "projects", "client-a");
    writeFileSync(getDenylistPath(dir), `*\n!${allowedRoot}/**\n`);

    expect(isUploadAllowed(dir, join(allowedRoot, "report.pdf")).allowed).toBe(
      true
    );
    expect(
      isUploadAllowed(dir, join(homedir(), "Documents", "report.pdf")).allowed
    ).toBe(false);
  });

  it("loadDenylistPatterns strips comments and blank lines", () => {
    writeFileSync(
      getDenylistPath(dir),
      "# comment\n\n.ssh/**\n\n# another\n**/*.pem\n"
    );
    expect(loadDenylistPatterns(dir)).toEqual([".ssh/**", "**/*.pem"]);
  });

  it("expands a leading ~ in the target file path", () => {
    writeFileSync(getDenylistPath(dir), "**/.ssh/**\n");
    // isUploadAllowed must resolve "~/.ssh/id_rsa" the same way the
    // homedir()-based absolute path resolves, not treat "~" as a literal
    // path segment.
    const decision = isUploadAllowed(dir, "~/.ssh/id_rsa");
    expect(decision.allowed).toBe(false);
  });

  it("expands a leading ~ in a denylist pattern line", () => {
    writeFileSync(getDenylistPath(dir), "~/.ssh/**\n");
    const decision = isUploadAllowed(dir, join(homedir(), ".ssh", "id_rsa"));
    expect(decision.allowed).toBe(false);
  });

  it("resolves a symlink to its real target so an allowed-looking path to a denied file is still denied", () => {
    const deniedDir = join(dir, "denied");
    const allowedDir = join(dir, "allowed");
    mkdirSync(deniedDir);
    mkdirSync(allowedDir);
    const realSecret = join(deniedDir, "id_rsa");
    writeFileSync(realSecret, "fake-key-material");
    const symlinkPath = join(allowedDir, "innocuous.pdf");
    symlinkSync(realSecret, symlinkPath);

    writeFileSync(getDenylistPath(dir), `${deniedDir}/**\n`);

    const decision = isUploadAllowed(dir, symlinkPath);
    expect(decision.allowed).toBe(false);
  });

  it("falls back to the resolved path for a nonexistent file rather than throwing", () => {
    writeFileSync(getDenylistPath(dir), "**/.ssh/**\n");
    expect(() =>
      isUploadAllowed(dir, join(homedir(), "Documents", "does-not-exist.pdf"))
    ).not.toThrow();
    const decision = isUploadAllowed(
      dir,
      join(homedir(), "Documents", "does-not-exist.pdf")
    );
    expect(decision.allowed).toBe(true);
  });
});
