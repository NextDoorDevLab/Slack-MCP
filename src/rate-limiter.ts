const WINDOW_MS = 60_000;

export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limitPerMinute: number | null) {}

  tryConsume(workspace: string, nowMs: number): boolean {
    if (!this.limitPerMinute || this.limitPerMinute <= 0) return true;

    const existing = this.hits.get(workspace) ?? [];
    const withinWindow = existing.filter((t) => nowMs - t < WINDOW_MS);

    if (withinWindow.length >= this.limitPerMinute) {
      this.hits.set(workspace, withinWindow);
      return false;
    }

    withinWindow.push(nowMs);
    this.hits.set(workspace, withinWindow);
    return true;
  }
}
