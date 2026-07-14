import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface CursorState {
  [conversationId: string]: string;
}

// Slack's real `ts` format is always a 10-digit second count, a literal ".",
// and a 6-digit microsecond count (until year 2286). All comparisons in this
// module (and in src/tools/reading.ts) use lexical string comparison, which
// only sorts correctly when every compared value shares this fixed shape —
// unlike the parseFloat-based comparison this module used to use, it is NOT
// robust to arbitrary numeric strings of differing digit-counts (e.g. "0" or
// "123"). cursors/<workspace>.json lives under the user's config directory
// and could be hand-edited, so we validate on load rather than trusting it.
const CANONICAL_TS = /^\d{10}\.\d{6}$/;

function cursorPath(configDir: string, workspace: string): string {
  return join(configDir, "cursors", `${workspace}.json`);
}

export function loadCursor(configDir: string, workspace: string): CursorState {
  const path = cursorPath(configDir, workspace);
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf-8")) as CursorState;

  const validated: CursorState = {};
  for (const [conversationId, ts] of Object.entries(raw)) {
    if (CANONICAL_TS.test(ts)) {
      validated[conversationId] = ts;
    } else {
      // Drop rather than crash or trust: a missing cursor is treated by
      // get_new_messages as "no prior cursor for this conversation" (full
      // poll from the start), which can re-report already-seen messages
      // once but can never silently skip messages. That's the safe
      // direction to fail in for a tool whose entire point is not losing
      // messages.
      process.stderr.write(
        `slack-mcp: dropping invalid cursor for workspace "${workspace}", ` +
          `conversation "${conversationId}": non-canonical ts value ${JSON.stringify(ts)}\n`
      );
    }
  }
  return validated;
}

export function saveCursor(
  configDir: string,
  workspace: string,
  state: CursorState
): void {
  const path = cursorPath(configDir, workspace);
  mkdirSync(join(configDir, "cursors"), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function advanceCursor(
  state: CursorState,
  conversationId: string,
  ts: string
): void {
  const current = state[conversationId];
  // Slack `ts` values are fixed-width strings (10-digit seconds + "." +
  // 6-digit microseconds, until year 2286), so a plain string comparison
  // sorts them identically to numeric comparison while avoiding parseFloat's
  // precision loss past ~16 significant digits.
  if (!current || ts > current) {
    state[conversationId] = ts;
  }
}
