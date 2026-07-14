import { WebClient } from "@slack/web-api";
import type { WorkspacesFile } from "./config.js";

export interface WorkspaceClient {
  name: string;
  client: WebClient;
}

export class WorkspaceRegistry {
  private clients = new Map<string, WebClient>();

  constructor(
    private workspaces: WorkspacesFile,
    // retryConfig caps @slack/web-api's built-in Retry-After handling to a single retry,
    // per the spec's error-handling requirement (default is unbounded exponential backoff).
    private clientFactory: (token: string) => WebClient = (token) =>
      new WebClient(token, { retryConfig: { retries: 1 } })
  ) {}

  list(): string[] {
    return Object.keys(this.workspaces).sort();
  }

  get(name: string): WorkspaceClient {
    const entry = this.workspaces[name];
    if (!entry) {
      throw new Error(
        `Unknown workspace "${name}". Configured workspaces: ${this.list().join(", ") || "none"}.`
      );
    }

    const cached = this.clients.get(name);
    if (cached) return { name, client: cached };

    const token = process.env[entry.tokenEnv];
    if (!token) {
      throw new Error(
        `Missing Slack token for workspace "${name}": environment variable ${entry.tokenEnv} is not set.`
      );
    }

    const client = this.clientFactory(token);
    this.clients.set(name, client);
    return { name, client };
  }
}
