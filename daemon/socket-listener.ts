// daemon/socket-listener.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SocketModeClient } from "@slack/socket-mode";
import { getConfigDir, loadWorkspaces } from "../src/config.js";

interface DaemonWorkspaceEntry {
  tokenEnv: string;
  appTokenEnv: string; // xapp- token, required for Socket Mode, separate from the xoxp- user token
}

// Every message event is appended here verbatim, unfiltered — this daemon still
// makes no reply/allowlist decisions itself (see warning below). A consumer
// (e.g. the /slack-auto-reply command, run under /loop) drains this file,
// applies its own allowlist + policy gate, and calls the `auto_reply` tool.
function appendToQueue(configDir: string, workspace: string, entry: unknown) {
  const dir = join(configDir, "queue");
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${workspace}.jsonl`), JSON.stringify(entry) + "\n");
}

async function startListener(
  name: string,
  entry: DaemonWorkspaceEntry,
  configDir: string
) {
  const appToken = process.env[entry.appTokenEnv];
  const userToken = process.env[entry.tokenEnv];
  if (!appToken || !userToken) {
    console.error(
      `[slack-mcp-daemon] Skipping workspace "${name}": missing ${entry.appTokenEnv} or ${entry.tokenEnv}.`
    );
    return;
  }

  const socket = new SocketModeClient({ appToken });

  socket.on("message", async ({ event, ack }) => {
    await ack();
    console.log(
      `[slack-mcp-daemon] [${name}] New message in ${event.channel} from ${event.user}: ${event.text}`
    );
    // Intentionally does not call an LLM or send a reply itself — this daemon's job is
    // only to observe, log, and queue in real time. Allowlisting, policy-gating, and
    // actually drafting/sending a reply is done by an external consumer (see
    // /slack-auto-reply), kept deliberately separate so the token-burn behavior
    // described in the warning below stays opt-in and explicit at that point.
    appendToQueue(configDir, name, {
      workspace: name,
      channel: event.channel,
      user: event.user,
      text: event.text,
      ts: event.ts,
      receivedAt: new Date().toISOString(),
    });
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
  // Each workspace's startup is isolated: a rejection (bad app token, transient
  // network issue, etc.) for one workspace is caught and logged here rather than
  // propagating, so it can't tear down other workspaces' already-live connections.
  await Promise.all(
    names.map((name) =>
      startListener(name, workspaces[name], configDir).catch((error: unknown) => {
        console.error(`[slack-mcp-daemon] [${name}] Failed to start: ${error}`);
      })
    )
  );
}

main().catch((err) => {
  console.error("[slack-mcp-daemon] fatal error:", err);
  process.exit(1);
});
