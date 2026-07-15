import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl } from "../../src/oauth/url.js";

describe("buildAuthorizeUrl", () => {
  it("builds the Slack v2 authorize URL with the expected query params", () => {
    const url = buildAuthorizeUrl({
      clientId: "123.456",
      scopes: ["chat:write", "channels:read"],
      redirectUri: "http://localhost:51827/slack/oauth/callback",
      state: "abc123",
    });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      "https://slack.com/oauth/v2/authorize"
    );
    expect(parsed.searchParams.get("client_id")).toBe("123.456");
    expect(parsed.searchParams.get("user_scope")).toBe(
      "chat:write,channels:read"
    );
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:51827/slack/oauth/callback"
    );
    expect(parsed.searchParams.get("state")).toBe("abc123");
  });
});
