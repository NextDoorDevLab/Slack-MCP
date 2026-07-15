# AGENTS.md — slack_mcp Integration Guide

A dense reference for AI agents setting up or using `slack_mcp`. Read this in
full before generating setup steps or making tool calls against this server.

---

## What this is

A Node.js/TypeScript **stdio MCP server** that sends and reads Slack messages
as the operator's own user (`xoxp-...` token, not a bot), across one or more
workspaces. It's a **single-operator tool** — no shared app, no hosted OAuth
service, no multi-tenant state. Everything it needs lives under
`~/.slack-mcp/` on the machine running it (or `SLACK_MCP_CONFIG_DIR` if set).

Full tool list, parameters, and configuration file schemas: see the
[README's Tools table](README.md#tools) and
[Configuration files section](README.md#configuration-files-slack-mcp) — this
file does not duplicate those; it covers setup sequencing and cross-cutting
tool behavior the schemas alone don't capture.

---

## Setup checklist

Two steps in this sequence **require a human** — a browser session and a
click you cannot perform on the operator's behalf. Do everything else, then
stop and hand off at those two points.

1. **Clone, install, build** (you can do this):

   ```bash
   git clone https://github.com/NextDoorDevLab/slack_mcp.git
   cd slack_mcp
   npm install
   npm run build
   ```

2. **Create a Slack App per workspace — STOP, hand off to a human.** This
   happens on [api.slack.com/apps](https://api.slack.com/apps) in a browser;
   there is no API for it. Point the human at
   `manifest/slack-app-manifest.yaml` (paste-as-manifest flow) and ask them
   to install the app into the target workspace, then copy the **Client ID**
   and **Client Secret** from the app's Basic Information page.

3. **Set client credentials** (you can do this once the human hands you the
   values): copy `.env.example` to `.env`, fill in
   `SLACK_CLIENT_ID_<WORKSPACE>` / `SLACK_CLIENT_SECRET_<WORKSPACE>`.

4. **Run the OAuth handshake — STOP, hand off to a human for the click.**

   ```bash
   npm run authorize -- <workspace-name>
   ```

   This opens a browser to Slack's consent screen; a human must click
   **Allow**. On success it writes the user token to `.env` and updates
   `~/.slack-mcp/workspaces.json` automatically — no manual JSON editing
   needed after this succeeds. If no browser is available, the human can
   instead copy the **User OAuth Token** by hand from the app's OAuth &
   Permissions page and you can write `~/.slack-mcp/workspaces.json`
   directly (see the README's Setup step 3 for the exact schema).

5. **Register the server with the MCP client** (you can do this): add an
   entry to the client's MCP config pointing `command`/`args` at
   `node /absolute/path/to/slack_mcp/dist/index.js` — see README Setup step
   5 for the exact JSON. The exact config file differs by client (Claude
   Code's `.mcp.json`, Claude Desktop's `claude_desktop_config.json`, etc.);
   ask which one if it isn't obvious from context.

6. **(Optional) Map project directories to default workspaces** — you can
   write `~/.slack-mcp/directory-map.json` directly; schema in README Setup
   step 4.

Do not attempt to script around steps 2 or 4 (e.g. by trying to submit
Slack's web forms programmatically, or fabricating a token). Both are
one-time, human-gated, by design — this tool has no hosted service to hand
that trust to.

---

## Workspace resolution (read before making any tool call)

Every tool accepts an optional `workspace` argument. If omitted, the server
resolves a default from the caller's working directory via
`directory-map.json`. If nothing matches and no explicit `workspace` is
given, **the tool call fails with an error listing configured workspace
names** — it never guesses.

- **Do** pass `workspace` explicitly whenever you're not certain which
  directory-map entry (if any) applies to the current session, especially
  when working across multiple client projects.
- **Do** treat that error's workspace list as authoritative — don't retry
  blindly; surface the choice to the human or pick from the listed names.

---

## Do / Don't

**Do:**

- Use the `resolve` tool to disambiguate a name before `send_message` if
  you're not confident the cached name→ID resolution is correct — it's a
  cheap, explicit lookup.
- Use `get_new_messages`'s cursor for polling (the `/loop` pattern) rather
  than re-reading full channel history on every check — the cursor is
  per-workspace, per-channel, and persisted automatically.
- Read `daemon/README.md` in full before enabling the Socket Mode daemon —
  it's a separate opt-in process, off by default.

**Don't:**

- Don't wire the Socket Mode daemon's real-time events to an unattended
  agent invocation without reading its token-burn warning first — a busy
  channel can exhaust a model quota fast with no human in the loop to
  notice.
- Don't assume `auto_reply` is safe to call just because it exists — with
  no `policy.md`/`rules.json` configured, it never sends (by design, not a
  bug). Check `~/.slack-mcp/policy.md` and `rules.json` exist and are
  populated before relying on it.
- Don't treat the [upload denylist](README.md#upload-denylist-upload-denylist)
  as a safety net you can ignore — it's a denylist, not an allowlist; a
  `send_file` call driven by untrusted channel content is a real exfiltration
  vector if the denylist hasn't been reviewed for the environment it's
  running in.
- Don't hand-edit `~/.slack-mcp/*.json` files while the server (or
  `authorize`) might be mid-write — let the tools and `authorize` command
  own those writes; they use targeted, permission-hardened writes for a
  reason.
- Don't confuse `workspaces.json`'s `tokenEnv` field with the token itself —
  it's the _name_ of an environment variable. The actual `xoxp-...` secret
  lives only in the process environment / `.env`, never in
  `workspaces.json`.
