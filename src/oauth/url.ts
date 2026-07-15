export interface BuildAuthorizeUrlOptions {
  clientId: string;
  scopes: string[];
  redirectUri: string;
  state: string;
}

export function buildAuthorizeUrl(options: BuildAuthorizeUrlOptions): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("user_scope", options.scopes.join(","));
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);
  return url.toString();
}
