import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface AutoReplyLogEntry {
  ts: string;
  workspace: string;
  to: string;
  text: string;
  matchedRule: string;
}

function logPath(configDir: string): string {
  return join(configDir, "auto-reply-log.jsonl");
}

export function appendAuditLog(
  configDir: string,
  entry: AutoReplyLogEntry
): void {
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  appendFileSync(logPath(configDir), JSON.stringify(entry) + "\n", {
    mode: 0o600,
  });
}

export function readAuditLog(configDir: string): AutoReplyLogEntry[] {
  const path = logPath(configDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AutoReplyLogEntry);
}
