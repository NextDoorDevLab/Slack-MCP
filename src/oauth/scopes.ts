// Single source of truth for the Slack OAuth user scopes this app requests.
// test/oauth/manifest-scopes.test.ts asserts this stays in sync with
// manifest/slack-app-manifest.yaml's oauth_config.scopes.user list.
export const USER_SCOPES: string[] = [
  "chat:write",
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:read",
  "im:write",
  "im:history",
  "users:read",
  "search:read",
  "reactions:write",
  "files:read",
  "files:write",
  "canvases:write",
];
