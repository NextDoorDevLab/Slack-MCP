export interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
}

// requestUrl is Node's http.IncomingMessage#url, e.g.
// "/slack/oauth/callback?code=abc&state=xyz" — always relative, so it's
// parsed against a throwaway base to get a usable URL/searchParams object.
export function parseCallbackParams(requestUrl: string): CallbackParams {
  const url = new URL(requestUrl, "http://localhost");
  const params: CallbackParams = {};
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (code) params.code = code;
  if (state) params.state = state;
  if (error) params.error = error;
  return params;
}
