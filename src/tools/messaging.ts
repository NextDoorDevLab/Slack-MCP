import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebClient } from "@slack/web-api";
import { resolveWorkspace } from "../config.js";
import type { ToolDeps } from "./discovery.js";
import { paginateSlack } from "../slack-pagination.js";
import {
  loadCache,
  saveCache,
  resolveFromCache,
  upsertCacheEntry,
  dropCacheEntry,
  type WorkspaceCache,
} from "../cache.js";
import { isUploadAllowed } from "../upload-policy.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

const STALE_ERRORS = new Set([
  "user_not_found",
  "channel_not_found",
  "not_in_channel",
]);

// Slack conversation IDs: public channel (C), private channel/group (G), or
// DM (D), followed by 8+ uppercase alphanumerics. When `to` has this shape,
// it's treated as a direct send target instead of a person name to resolve.
const CHANNEL_ID_RE = /^[CGD][A-Z0-9]{8,}$/;

async function resolveUserId(
  client: WebClient,
  cache: WorkspaceCache,
  name: string
): Promise<
  | { status: "found"; id: string }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: { name: string; id: string }[] }
> {
  const cached = resolveFromCache(cache, "users", name);
  if (cached.status !== "not_found") return cached;

  const members = await paginateSlack<{
    id?: string;
    name?: string;
    real_name?: string;
  }>(async (cursor) => {
    const res = await client.users.list({ cursor });
    return {
      items: (res.members ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        real_name: u.real_name,
      })),
      nextCursor: res.response_metadata?.next_cursor || undefined,
    };
  });
  for (const u of members) {
    if (u.id && u.name) upsertCacheEntry(cache, "users", u.name, u.id);
    if (u.id && u.real_name)
      upsertCacheEntry(cache, "users", u.real_name, u.id);
  }
  return resolveFromCache(cache, "users", name);
}

async function openDm(
  client: WebClient,
  cache: WorkspaceCache,
  userId: string
): Promise<string> {
  // WorkspaceCache normalizes every stored key (including "dms", which are
  // keyed by Slack user ID) to lowercase via upsertCacheEntry. Slack user
  // IDs are uppercase, so the cache-hit lookup must normalize the same way
  // or it will never hit and every send will needlessly re-open the DM.
  const key = userId.toLowerCase().trim();
  if (cache.dms[key]) return cache.dms[key];
  const res = await client.conversations.open({ users: userId });
  const channelId = res.channel!.id!;
  upsertCacheEntry(cache, "dms", userId, channelId);
  return channelId;
}

export type SendTargetResolution =
  | { status: "resolved"; channelId: string; userId?: string }
  | { status: "ambiguous"; candidates: { name: string; id: string }[] }
  | { status: "not_found" };

// Resolves `to` to a concrete Slack channel/DM ID WITHOUT sending anything —
// no chat.postMessage call happens here. This lets callers (e.g. auto_reply)
// separate "figure out where this would go" from "actually send it", so
// something like a rate limiter can gate the send without being charged for
// resolution failures (ambiguous/not_found).
//
// `userId` is only set when `to` was resolved via name -> user-ID lookup
// (i.e. NOT a direct channel-ID send). Downstream send logic uses its
// presence to decide whether the stale-cache retry-by-name applies.
export async function resolveSendTarget(
  client: WebClient,
  cache: WorkspaceCache,
  to: string
): Promise<SendTargetResolution> {
  // `to` is a Slack conversation ID shape (channel/group/DM) — resolves
  // directly, no name resolution or DM-opening involved.
  if (CHANNEL_ID_RE.test(to)) {
    return { status: "resolved", channelId: to };
  }

  const resolved = await resolveUserId(client, cache, to);
  if (resolved.status !== "found") return resolved;

  const channelId = await openDm(client, cache, resolved.id);
  return { status: "resolved", channelId, userId: resolved.id };
}

// Posts to an already-resolved target, preserving the stale-cache
// retry-once behavior for name-resolved targets (userId set). Direct
// channel-ID sends (userId absent) have no name to fall back to, so a
// stale-cache-style error (e.g. the bot/user was removed from the channel)
// just propagates as-is, exactly as before this function existed.
export async function sendToResolvedTarget(
  client: WebClient,
  cache: WorkspaceCache,
  to: string,
  text: string,
  target: { channelId: string; userId?: string }
): Promise<
  | { status: "sent"; ts: string; channel: string }
  | { status: "ambiguous"; candidates: { name: string; id: string }[] }
  | { status: "not_found" }
> {
  if (!target.userId) {
    const res = await client.chat.postMessage({
      channel: target.channelId,
      text,
    });
    return { status: "sent", ts: res.ts!, channel: res.channel! };
  }

  const userId = target.userId;
  let channelId = target.channelId;

  try {
    const res = await client.chat.postMessage({ channel: channelId, text });
    return { status: "sent", ts: res.ts!, channel: res.channel! };
  } catch (err: unknown) {
    const code = (err as { data?: { error?: string } })?.data?.error;
    if (!code || !STALE_ERRORS.has(code)) throw err;

    dropCacheEntry(cache, "users", to);
    dropCacheEntry(cache, "dms", userId);
    const retried = await resolveUserId(client, cache, to);
    if (retried.status !== "found") return retried;

    channelId = await openDm(client, cache, retried.id);
    const res = await client.chat.postMessage({ channel: channelId, text });
    return { status: "sent", ts: res.ts!, channel: res.channel! };
  }
}

export async function sendMessageCore(
  client: WebClient,
  cache: WorkspaceCache,
  to: string,
  text: string
): Promise<
  | { status: "sent"; ts: string; channel: string }
  | { status: "ambiguous"; candidates: { name: string; id: string }[] }
  | { status: "not_found" }
> {
  const target = await resolveSendTarget(client, cache, to);
  if (target.status !== "resolved") return target;

  return sendToResolvedTarget(client, cache, to, text, target);
}

export function registerMessagingTools(
  server: McpServer,
  deps: ToolDeps
): void {
  server.tool(
    "send_message",
    "Send a Slack message as the authenticated user, to a person (by name, cache-resolved) or a channel ID",
    { to: z.string(), text: z.string(), workspace: z.string().optional() },
    async ({ to, text, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const cache = loadCache(deps.configDir, ws);

      // sendMessageCore mutates `cache` in place (dropping/re-resolving
      // stale entries) before it can throw on a second failed send. Save
      // whatever state it left behind even on a throw, so that mutation
      // isn't lost and the same stale-cache failure doesn't repeat next
      // call — then let the error propagate.
      let result: Awaited<ReturnType<typeof sendMessageCore>>;
      try {
        result = await sendMessageCore(client, cache, to, text);
      } finally {
        saveCache(deps.configDir, ws, cache);
      }

      if (result.status === "sent") {
        return json({ ts: result.ts, channel: result.channel });
      }
      return json(result);
    }
  );

  server.tool(
    "send_file",
    "Upload and send a file to a Slack channel or DM",
    {
      channel: z.string(),
      filePath: z.string(),
      workspace: z.string().optional(),
    },
    async ({ channel, filePath, workspace }) => {
      const decision = isUploadAllowed(deps.configDir, filePath);
      if (!decision.allowed) {
        return json({
          ok: false,
          reason: "denied_by_upload_policy",
          message: decision.reason,
        });
      }

      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      const res = await client.filesUploadV2({
        channel_id: channel,
        file: filePath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return json({ ok: res.ok });
    }
  );

  server.tool(
    "add_reaction",
    "Add an emoji reaction to a message",
    {
      channel: z.string(),
      ts: z.string(),
      emoji: z.string(),
      workspace: z.string().optional(),
    },
    async ({ channel, ts, emoji, workspace }) => {
      const ws = resolveWorkspace(
        workspace,
        process.cwd(),
        deps.directoryMap,
        deps.workspaces
      );
      const { client } = deps.registry.get(ws);
      await client.reactions.add({ channel, timestamp: ts, name: emoji });
      return json({ ok: true });
    }
  );
}
