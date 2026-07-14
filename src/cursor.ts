import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface CursorState {
  [conversationId: string]: string;
}

function cursorPath(configDir: string, workspace: string): string {
  return join(configDir, "cursors", `${workspace}.json`);
}

export function loadCursor(configDir: string, workspace: string): CursorState {
  const path = cursorPath(configDir, workspace);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as CursorState;
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
