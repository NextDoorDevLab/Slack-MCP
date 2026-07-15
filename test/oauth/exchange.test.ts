import { describe, it, expect, vi } from "vitest";
import type { WebClient } from "@slack/web-api";
import { exchangeCodeForToken } from "../../src/oauth/exchange.js";

describe("exchangeCodeForToken", () => {
  it("returns the authed user's access token", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient: any = {
      oauth: {
        v2: {
          access: vi.fn().mockResolvedValue({
            ok: true,
            authed_user: { access_token: "xoxp-fake" },
          }),
        },
      },
    };

    const result = await exchangeCodeForToken(fakeClient as WebClient, {
      clientId: "123.456",
      clientSecret: "shh",
      code: "abc",
      redirectUri: "http://localhost:51827/slack/oauth/callback",
    });

    expect(fakeClient.oauth.v2.access).toHaveBeenCalledWith({
      client_id: "123.456",
      client_secret: "shh",
      code: "abc",
      redirect_uri: "http://localhost:51827/slack/oauth/callback",
    });
    expect(result).toEqual({ accessToken: "xoxp-fake" });
  });

  it("throws a clear error when the response has no user access token", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient: any = {
      oauth: { v2: { access: vi.fn().mockResolvedValue({ ok: true }) } },
    };

    await expect(
      exchangeCodeForToken(fakeClient as WebClient, {
        clientId: "123.456",
        clientSecret: "shh",
        code: "abc",
        redirectUri: "http://localhost:51827/slack/oauth/callback",
      })
    ).rejects.toThrow(/did not return a user access token/);
  });
});
