// daemon/socket-listener.ts
import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import { getConfigDir, loadWorkspaces } from "../src/config.js";

interface DaemonWorkspaceEntry {
  tokenEnv: string;
  appTokenEnv: string; // xapp- token, required for Socket Mode, separate from the xoxp- user token
}

async function startListener(name: string, entry: DaemonWorkspaceEntry) {
  const appToken = process.env[entry.appTokenEnv];
  const userToken = process.env[entry.tokenEnv];
  if (!appToken || !userToken) {
    console.error(
      `[slack-mcp-daemon] Skipping workspace "${name}": missing ${entry.appTokenEnv} or ${entry.tokenEnv}.`
    );
    return;
  }

  const socket = new SocketModeClient({ appToken });
  // `web` is constructed now (and requires userToken above) so that a future,
  // deliberate wiring of this handler to actually reply as the user doesn't
  // need to thread the token through again — see the comment in the "message"
  // handler below for why that wiring isn't done here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const web = new WebClient(userToken);

  socket.on("message", async ({ event, ack }) => {
    await ack();
    console.log(
      `[slack-mcp-daemon] [${name}] New message in ${event.channel} from ${event.user}: ${event.text}`
    );
    // Intentionally does not call an LLM or send a reply itself — this daemon's job is
    // only to observe and log in real time. Wiring this into an actual agent invocation
    // (e.g. via a queue file a scheduled Claude Code session drains, or a RemoteTrigger
    // call) is a deliberate follow-up, not part of this task, so that the token-burn
    // behavior described in the warning below is opt-in and explicit at that point too.
  });

  await socket.start();
  console.log(`[slack-mcp-daemon] [${name}] Connected via Socket Mode.`);
}

async function main() {
  console.warn(
    "[slack-mcp-daemon] WARNING: Socket Mode reacts to every incoming message in real time.\n" +
      "If wired to trigger an agent per message, an unattended busy channel can burn through\n" +
      "model quota quickly. Scope this daemon to specific, low-traffic channels/DMs, and confirm\n" +
      "each configured workspace below is intentional."
  );

  const configDir = getConfigDir();
  const workspaces = loadWorkspaces(configDir) as unknown as Record<
    string,
    DaemonWorkspaceEntry
  >;
  const names = Object.keys(workspaces);

  if (names.length === 0) {
    console.error(
      "[slack-mcp-daemon] No workspaces configured in workspaces.json. Exiting."
    );
    process.exit(1);
  }

  console.warn(
    `[slack-mcp-daemon] Starting listeners for: ${names.join(", ")}`
  );
  await Promise.all(names.map((name) => startListener(name, workspaces[name])));
}

main().catch((err) => {
  console.error("[slack-mcp-daemon] fatal error:", err);
  process.exit(1);
});
