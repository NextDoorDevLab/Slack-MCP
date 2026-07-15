import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WebClient } from "@slack/web-api";
import open from "open";
import { USER_SCOPES } from "./oauth/scopes.js";
import { buildAuthorizeUrl } from "./oauth/url.js";
import { parseCallbackParams } from "./oauth/callback.js";
import { exchangeCodeForToken } from "./oauth/exchange.js";
import { upsertEnvVar } from "./oauth/env-writer.js";
import {
  deriveClientIdEnvVar,
  deriveClientSecretEnvVar,
  deriveTokenEnvVar,
} from "./oauth/workspace-env.js";
import { getConfigDir, loadWorkspaces, saveWorkspaces } from "./config.js";

const CALLBACK_PATH = "/slack/oauth/callback";
const DEFAULT_PORT = 51827;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const GENERIC_FAILURE_HTML =
  "<html><body>Something went wrong. You can close this tab.</body></html>";

// Constant-time comparison for the OAuth state token: a length check would
// leak timing information about how many leading bytes matched otherwise.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

interface CallbackOutcome {
  code: string;
}

// Starts a single-use local HTTP server, opens the browser once it's
// listening, and resolves with the authorization code from Slack's
// redirect — or rejects with a specific, actionable error for every
// failure mode (denied, state mismatch, missing code, timeout, port in
// use). Deliberately thin/untested per the design spec (see spec §10) —
// this is I/O glue, validated manually against a live Slack app.
function waitForCallback(
  port: number,
  expectedState: string,
  authorizeUrl: string,
  timeoutMs: number
): Promise<CallbackOutcome> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const server = createServer((req, res) => {
      const requestPath = req.url
        ? new URL(req.url, "http://127.0.0.1").pathname
        : "";
      if (requestPath !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }
      const params = parseCallbackParams(req.url!);

      const finish = (status: number, body: string) => {
        res.writeHead(status, { "Content-Type": "text/html" }).end(body);
        clearTimeout(timer);
        settled = true;
        server.close();
      };

      if (!params.state || !safeEqual(params.state, expectedState)) {
        finish(400, GENERIC_FAILURE_HTML);
        reject(
          new Error(
            "State parameter did not match — possible CSRF attempt or stale callback. Aborting."
          )
        );
        return;
      }
      if (params.error) {
        finish(
          200,
          "<html><body>Authorization was denied. You can close this tab.</body></html>"
        );
        reject(
          new Error(
            `Slack returned error=${params.error} (authorization denied).`
          )
        );
        return;
      }
      if (!params.code) {
        finish(400, GENERIC_FAILURE_HTML);
        reject(new Error("Callback did not include an authorization code."));
        return;
      }

      finish(
        200,
        "<html><body>Authorized. You can close this tab.</body></html>"
      );
      resolve({ code: params.code });
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(
        new Error(
          `No response from Slack within ${Math.round(timeoutMs / 1000)}s. Run the command again.`
        )
      );
    }, timeoutMs);

    server.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    server.listen(port, "127.0.0.1", () => {
      open(authorizeUrl).catch(() => {
        console.error(
          `Could not open a browser automatically. Open this URL manually:\n${authorizeUrl}`
        );
      });
    });
  });
}

async function main(): Promise<void> {
  const workspace = process.argv[2];
  if (!workspace) {
    console.error("Usage: authorize <workspace-name>");
    process.exitCode = 1;
    return;
  }

  const clientIdVar = deriveClientIdEnvVar(workspace);
  const clientSecretVar = deriveClientSecretEnvVar(workspace);
  const clientId = process.env[clientIdVar];
  const clientSecret = process.env[clientSecretVar];
  if (!clientId || !clientSecret) {
    console.error(
      `Missing ${clientIdVar} and/or ${clientSecretVar}. Copy both values ` +
        `from your Slack app's Basic Information page (App Credentials ` +
        `section) into your .env file, then re-source it.`
    );
    process.exitCode = 1;
    return;
  }

  // Resolved and validated up front, before opening a browser or touching
  // the network, so a name collision fails fast instead of after the user
  // has already clicked through Slack's consent screen.
  const configDir = getConfigDir();
  const workspaces = loadWorkspaces(configDir);
  const existingEntry = workspaces[workspace];
  const tokenVar = existingEntry?.tokenEnv ?? deriveTokenEnvVar(workspace);

  // Different workspace names can derive the same env var name (e.g.
  // "client-a" and "client_a" both become SLACK_TOKEN_CLIENT_A), which
  // would otherwise silently overwrite another workspace's token in .env.
  const collision = Object.entries(workspaces).find(
    ([name, entry]) => name !== workspace && entry.tokenEnv === tokenVar
  );
  if (collision) {
    const [collidingName] = collision;
    console.error(
      `Workspace "${workspace}" derives the same token env var (${tokenVar}) ` +
        `as existing workspace "${collidingName}". Choose a different ` +
        `workspace name, or manually set a distinct tokenEnv for one of ` +
        `them in ${join(configDir, "workspaces.json")}.`
    );
    process.exitCode = 1;
    return;
  }

  const rawPort = process.env.SLACK_MCP_OAUTH_PORT;
  const port = rawPort !== undefined ? Number(rawPort) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(
      `Invalid SLACK_MCP_OAUTH_PORT "${rawPort}" — must be an integer ` +
        `between 1 and 65535.`
    );
    process.exitCode = 1;
    return;
  }

  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const state = randomBytes(32).toString("hex");
  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    scopes: USER_SCOPES,
    redirectUri,
    state,
  });

  let code: string;
  try {
    const outcome = await waitForCallback(
      port,
      state,
      authorizeUrl,
      CALLBACK_TIMEOUT_MS
    );
    code = outcome.code;
  } catch (err) {
    const errCode = (err as NodeJS.ErrnoException)?.code;
    if (errCode === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Set SLACK_MCP_OAUTH_PORT to a free ` +
          `port and add the matching http://127.0.0.1:<port>${CALLBACK_PATH} ` +
          `URL to your Slack app's OAuth & Permissions -> Redirect URLs ` +
          `before retrying.`
      );
    } else {
      console.error(err instanceof Error ? err.message : String(err));
    }
    process.exitCode = 1;
    return;
  }

  const client = new WebClient();
  let accessToken: string;
  try {
    const result = await exchangeCodeForToken(client, {
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
    accessToken = result.accessToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Token exchange failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  const envExamplePath = join(process.cwd(), ".env.example");
  const seed = existsSync(envExamplePath)
    ? readFileSync(envExamplePath, "utf-8")
    : "";
  // .env (the secret) is written first, then workspaces.json (a reference
  // to which env var holds it). If the second write fails, .env already
  // has the valid token and a retry is idempotent — the ordering is
  // intentional, not incidental.
  upsertEnvVar(join(process.cwd(), ".env"), tokenVar, accessToken, seed);

  workspaces[workspace] = { ...existingEntry, tokenEnv: tokenVar };
  saveWorkspaces(configDir, workspaces);

  console.log(
    `Authorized "${workspace}". Wrote ${tokenVar} to .env and updated ` +
      `${join(configDir, "workspaces.json")}.\n` +
      `Re-source your .env (or restart your MCP client) to pick up the new token.`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
