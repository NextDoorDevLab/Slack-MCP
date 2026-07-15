import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";

// Updates or appends exactly one VAR=value line in a .env file, leaving
// every other line (including comments and ordering) untouched. If the
// file doesn't exist yet, it's created from `seedIfMissing` (typically the
// contents of .env.example) with the variable appended. Always written/left
// owner-only (0600) — this file holds live Slack tokens.
export function upsertEnvVar(
  envPath: string,
  varName: string,
  value: string,
  seedIfMissing = ""
): void {
  const existing = existsSync(envPath)
    ? readFileSync(envPath, "utf-8")
    : seedIfMissing;
  const lines =
    existing.length > 0 ? existing.replace(/\n$/, "").split("\n") : [];

  const prefix = `${varName}=`;
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${varName}=${value}`;
    }
    return line;
  });
  if (!found) {
    updated.push(`${varName}=${value}`);
  }

  writeFileSync(envPath, updated.join("\n") + "\n", { mode: 0o600 });
  chmodSync(envPath, 0o600);
}
