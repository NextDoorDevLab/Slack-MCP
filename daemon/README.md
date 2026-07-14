# slack-mcp Socket Mode daemon (optional, advanced)

This is an **opt-in, real-time** alternative to polling Slack via `/loop` and
`get_new_messages`. It holds a Socket Mode WebSocket connection open per
configured workspace and logs incoming messages the instant they arrive.

## Warning: token/cost risk

This daemon runs independently of any open Claude Code session. If you wire
its message handler to trigger an agent invocation (not done by default — see
the comment in `socket-listener.ts`), every single incoming message in every
configured workspace becomes a full agent run. Left pointed at a busy channel
with no scoping, this can burn through your model quota very quickly, with no
human in the loop to notice until the bill or rate limit does.

Recommended before enabling:

- Scope `workspaces.json` entries used by the daemon to specific, low-traffic
  DMs/channels only, not "every workspace, every channel."
- Decide deliberately how (and whether) a received message should trigger an
  agent, and keep the `auto_reply` rate limit (Task 11/13) in place regardless
  of trigger source.

## Requirements

Each workspace entry used by the daemon needs, in addition to the existing
`tokenEnv` (user `xoxp-` token, for sending as yourself):

- `appTokenEnv` — the name of an env var holding a Slack app-level token
  (`xapp-...`) with `connections:write`, generated from the app's
  **Socket Mode** settings page. This is separate from the API token used for
  `chat.postMessage` etc.

## Running

```bash
npm run daemon
```

Recommended: run as a systemd user service (matching the pattern used by
this machine's other background daemons) rather than a foreground process,
so it survives terminal closure but is still visible via `systemctl status`.
