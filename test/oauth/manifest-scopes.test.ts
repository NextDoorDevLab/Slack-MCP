import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { USER_SCOPES } from "../../src/oauth/scopes.js";

describe("manifest scope consistency", () => {
  const manifestPath = join(
    process.cwd(),
    "manifest",
    "slack-app-manifest.yaml"
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifest: any = parse(readFileSync(manifestPath, "utf-8"));

  it("USER_SCOPES matches the manifest's oauth_config.scopes.user exactly", () => {
    expect([...USER_SCOPES].sort()).toEqual(
      [...manifest.oauth_config.scopes.user].sort()
    );
  });

  it("manifest registers the default local redirect URL", () => {
    expect(manifest.oauth_config.redirect_urls).toContain(
      "http://localhost:51827/slack/oauth/callback"
    );
  });
});
