import type { WebClient } from "@slack/web-api";

export interface ExchangeCodeOptions {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface ExchangeCodeResult {
  accessToken: string;
}

export async function exchangeCodeForToken(
  client: WebClient,
  options: ExchangeCodeOptions
): Promise<ExchangeCodeResult> {
  const response = await client.oauth.v2.access({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code,
    redirect_uri: options.redirectUri,
  });

  const accessToken = response.authed_user?.access_token;
  if (!accessToken) {
    throw new Error(
      `Slack did not return a user access token. Response: ${JSON.stringify(response)}`
    );
  }
  return { accessToken };
}
