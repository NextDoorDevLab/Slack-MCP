# slack_mcp — Design Spec

Date: 2026-07-14
Status: Approved, pending implementation
Org: NextDoorDevLabs (to be open sourced)

## Purpose

A generic, self-hostable MCP server that connects Claude (or any MCP client) to one or more Slack workspaces via the Slack Web API, sending and reading messages as the authenticated user's own identity — no bot label, no "sent via Claude" footer.

Primary motivating use case: freelancers/contractors who work across multiple client workspaces from different project directories on disk, and want Slack messaging to "just know" which workspace to use based on which project they're currently in, without repeating channel/user lookups on every message.

## Non-goals (v1)

- No hosted OAuth flow / redirect server. Auth is bring-your-own-token per workspace.
- No mobile/desktop notification integration.
- No multi-user / team-shared deployment — this is a single-operator tool (one person, their own tokens, their own cache).

## Architecture

Single Node.js/TypeScript stdio MCP server. No separate bridge process is needed — unlike WhatsApp, Slack has an official REST API, so the server talks to `@slack/web-api` directly.

```
slack_mcp/
  src/
    index.ts          — MCP entrypoint, registers tools, starts stdio transport
    config.ts         — loads workspaces.json + directory-map.json + config.json,
                         resolves default workspace from process.cwd()
    workspace.ts       — per-workspace Slack WebClient wrapper (one instance per configured token)
    cache.ts            — read/write ~/.slack-mcp/cache/<workspace>.json;
                           resolve(name) with fuzzy match + disambiguation;
                           stale-entry detection and single-retry re-resolution
    cursor.ts             — read/write ~/.slack-mcp/cursors/<workspace>.json for get_new_messages
    policy.ts               — loads rules.json + policy.md, evaluates an incoming message
                               against both, returns: auto-send | draft-for-review
    rate-limiter.ts           — per-workspace sliding-window cap on autonomous sends
    audit-log.ts               — appends to ~/.slack-mcp/auto-reply-log.jsonl
    tools/
      messaging.ts    — send_message, send_file, add_reaction
      reading.ts      — read_channel_history, read_thread, get_new_messages
      discovery.ts    — list_channels, list_users, resolve
      search.ts       — search_messages
      canvas.ts       — canvas create/read/update
  daemon/
    socket-listener.ts — optional, opt-in Socket Mode process (see "Real-time mode" below)
  manifest/
    slack-app-manifest.yaml — Slack App template with the scopes below; used to create
                               one app per workspace during setup
  README.md
  LICENSE
```

Runtime config and all secrets live outside the repo, under `~/.slack-mcp/` (git-ignored, never committed):

- `workspaces.json` — `{ "playfield": { "token_env": "SLACK_TOKEN_PLAYFIELD" }, "nextdoordev": { "token_env": "SLACK_TOKEN_NEXTDOORDEV" } }`
- `directory-map.json` — path prefix → workspace name, e.g. `{ "/home/bakhtarian/projects/matchable_project": "playfield", "/home/bakhtarian/projects/tessly": "nextdoordev" }`
- `config.json` — misc settings, including `auto_reply_rate_limit_per_minute` (default `5`; `0`/`null` disables the cap)
- `cache/<workspace>.json` — resolved name→ID maps: `{ users: {}, channels: {}, dms: {}, updated_at }`
- `cursors/<workspace>.json` — last-seen timestamp per conversation, used by `get_new_messages`
- `policy.md` — plain-language auto-reply categories and examples
- `rules.json` — optional structured auto-reply rules (channel + pattern → template)
- `auto-reply-log.jsonl` — audit trail of every autonomous send
- tokens themselves live in a local `.env` sourced by the shell, referenced only by env var name in `workspaces.json`

## Workspace resolution

At startup, the server reads `process.cwd()` — which equals wherever `claude` was launched from — and does a longest-prefix match against `directory-map.json` to pick a default workspace. Every tool also accepts an optional `workspace` argument that overrides the default. If cwd matches nothing and no explicit `workspace` is given, the tool returns an error listing configured workspace names rather than guessing.

Known limitation: resolution happens once at process startup. If the Claude Code session changes directories mid-session (e.g. via `cd` in Bash), the server's notion of "current directory" does not update. Acceptable for v1 given the primary workflow (one session per project directory); an explicit `workspace` arg is always available as an override.

## ID cache and resolution

`~/.slack-mcp/cache/<workspace>.json` holds name→ID maps for users, channels, and DM conversation IDs, refreshed lazily.

Resolution flow for e.g. `send_message({ to: "John", workspace: "playfield" })`:

1. Check `cache/playfield.json`'s `users` map for `"john"` (case-insensitive).
   - Single match → use the ID directly, no Slack API call.
   - No entry → search via `users.list`, cache the result.
   - Multiple matches → return all candidates to the caller (name, ID, workspace) instead of guessing; the caller must repeat the call with a fuller name or an explicit ID.
2. Resolve the DM conversation ID from the `dms` map, or call `conversations.open` if not yet cached, and cache the result.
3. Send via `chat.postMessage`.
4. If Slack returns `user_not_found` / `channel_not_found` / `not_in_channel`: drop the stale cache entry, re-resolve by last-known name once, retry. If that also fails, surface the error rather than looping.

## Tool surface (v1)

All tools accept an optional `workspace` parameter (defaults via directory-map resolution).

- `send_message(to, text, workspace?)` — DM or channel, resolved via cache
- `send_file(to, path, workspace?)`
- `add_reaction(channel, ts, emoji, workspace?)`
- `list_channels(workspace?)`
- `list_users(workspace?)`
- `resolve(name, workspace?)` — explicit cache-first name→ID lookup, useful for disambiguation
- `read_channel_history(channel, limit?, workspace?)`
- `read_thread(channel, thread_ts, workspace?)`
- `search_messages(query, workspace?)`
- `get_new_messages(since?, workspace?)` — cursor-based, for polling (see below)
- `create_canvas` / `read_canvas` / `update_canvas`

## Reading & responding to messages (workflow integration)

Two trigger modes are both supported; they differ only in what wakes the message-handling logic, which is shared.

### 1. Polling via `/loop` (documented default)

`get_new_messages(workspace?, since?)` returns anything new since a stored per-conversation cursor (`cursors/<workspace>.json`), advancing the cursor as messages are read. Intended to be driven by the existing `/loop` skill:

```
/loop 10m "check Slack for new messages across my workspaces, read them, and handle per the auto-reply policy"
```

No additional infrastructure — this runs inside a normal Claude Code session.

### 2. Socket Mode daemon (opt-in, advanced)

A separate long-running process (`daemon/socket-listener.ts`, run as a systemd service like your other daemons) holds a Slack Socket Mode WebSocket connection open per workspace and reacts to messages the instant they arrive, instead of waiting for the next `/loop` tick.

**Explicit warning, surfaced in the README and logged at daemon startup:** an unattended busy channel can trigger a full agent invocation per incoming message. Left running against a high-traffic channel, this can burn through model quota quickly. Recommended to scope the daemon to specific channels/DMs via `directory-map.json`-style config, not "every workspace, every channel."

### Auto-reply policy

Both a deterministic and a model-judged path are supported, checked in this order:

1. `rules.json` — optional structured rules (channel + pattern match → template). If a message matches, the reply is deterministic; no model judgment involved. Fast path, fully predictable, best for repetitive/mechanical cases.
2. `policy.md` — plain-language categories with examples (default/recommended path for everything else). The model judges the incoming message against this doc; only a clear, confident match auto-sends. Anything ambiguous produces a drafted suggested reply and waits for explicit approval instead of guessing.

Example `policy.md`:

```markdown
## Auto-approved
- Simple acknowledgements ("got it", "thanks", "will do") to direct pings
- "On it" replies to bug reports assigned to me in #matchable-bugs

## Never auto-send
- Anything involving money, deadlines, or commitments
- First message in a new DM thread
```

### Safety cap and audit log

- **Rate limit:** default **5 auto-sends per minute per workspace**, configurable via `config.json`'s `auto_reply_rate_limit_per_minute` (raise, lower, or set to `0`/`null` to disable). Exceeding it pauses auto-send for that workspace and surfaces a warning rather than silently dropping or queueing messages.
- **Audit log:** every autonomous send is appended to `~/.slack-mcp/auto-reply-log.jsonl` — timestamp, workspace, recipient, message text, and which rule/policy line matched. This is the only record of what went out under your name without a review step, so it's not optional.

## Auth setup

The repo ships `manifest/slack-app-manifest.yaml` with the scopes below. Setup per workspace: create a Slack App from the manifest in that workspace, install it, copy the resulting user token (`xoxp-...`) into the env var referenced by `workspaces.json`. No OAuth redirect server to run or maintain.

Scopes: `chat:write`, `channels:read`, `channels:history`, `groups:read`, `groups:history`, `im:read`, `im:write`, `im:history`, `users:read`, `users:read.email`, `search:read`, `reactions:write`, `files:write`, `canvases:read`, `canvases:write`.

## Error handling

- Missing token env var for a configured workspace only errors when that workspace is actually used, not at server startup.
- Rate limits (HTTP 429) from Slack are respected via `Retry-After`, with a single retry.
- No workspace resolvable (no directory match, no explicit arg) → clear error listing configured workspace names.
- Cache staleness → handled per the resolution flow above (drop, re-resolve once, surface if still failing).

## Testing

- Cache resolution logic (prefix matching, fuzzy name matching, disambiguation, stale-entry recovery) is pure functions — unit-tested with vitest.
- Policy evaluation (`rules.json` matching, rate limiter windowing) — unit-tested with vitest.
- Slack API interaction itself — validated manually against two real workspaces (e.g. Matchable/Playfield and NextDoorDev) before considering v1 done: send DM, send channel message, ambiguous-name resolution, stale-cache recovery, directory-based default resolution, one `/loop` polling cycle, and (if built) one Socket Mode round-trip.

## Open source

To be published under the NextDoorDevLabs GitHub org. README should document: prerequisites, per-workspace app-manifest setup, `~/.slack-mcp/` config file formats, the `/loop` polling pattern, and the Socket Mode daemon's token-burn warning up front, not buried.
