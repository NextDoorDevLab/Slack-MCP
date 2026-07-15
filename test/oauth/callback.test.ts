import { describe, it, expect } from "vitest";
import { parseCallbackParams } from "../../src/oauth/callback.js";

describe("parseCallbackParams", () => {
  it("extracts code and state from a successful callback", () => {
    expect(
      parseCallbackParams("/slack/oauth/callback?code=abc&state=xyz")
    ).toEqual({ code: "abc", state: "xyz" });
  });

  it("extracts the error param when the user denies access", () => {
    expect(
      parseCallbackParams("/slack/oauth/callback?error=access_denied&state=xyz")
    ).toEqual({ error: "access_denied", state: "xyz" });
  });

  it("returns an empty object when no query params are present", () => {
    expect(parseCallbackParams("/slack/oauth/callback")).toEqual({});
  });
});
