import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface Rule {
  name: string;
  channel?: string;
  pattern: string;
  template: string;
}

// `workspace` is part of the public signature (see the brief's Interfaces
// section) so callers don't need to change call sites if rules ever become
// workspace-scoped, but rules.json today is a single per-config-dir file.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loadRules(configDir: string, workspace: string): Rule[] {
  const path = join(configDir, "rules.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8")) as Rule[];
}

export function matchRules(
  rules: Rule[],
  message: { channel: string; text: string }
): { matched: true; rule: Rule } | { matched: false } {
  for (const rule of rules) {
    if (rule.channel && rule.channel !== message.channel) continue;
    if (new RegExp(rule.pattern, "i").test(message.text)) {
      return { matched: true, rule };
    }
  }
  return { matched: false };
}

export function loadPolicyText(configDir: string): string | null {
  const path = join(configDir, "policy.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}
