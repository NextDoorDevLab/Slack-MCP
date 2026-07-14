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
  if (!current || parseFloat(ts) > parseFloat(current)) {
    state[conversationId] = ts;
  }
}
