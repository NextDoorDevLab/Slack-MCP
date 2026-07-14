import { describe, it, expect } from "vitest";
import { SlidingWindowRateLimiter } from "../src/rate-limiter.js";

describe("SlidingWindowRateLimiter", () => {
  it("allows sends up to the limit within a minute", () => {
    const limiter = new SlidingWindowRateLimiter(3);
    const now = 1_000_000;
    expect(limiter.tryConsume("playfield", now)).toBe(true);
    expect(limiter.tryConsume("playfield", now + 100)).toBe(true);
    expect(limiter.tryConsume("playfield", now + 200)).toBe(true);
    expect(limiter.tryConsume("playfield", now + 300)).toBe(false);
  });

  it("frees up capacity once entries age out of the 60s window", () => {
    const limiter = new SlidingWindowRateLimiter(1);
    const now = 1_000_000;
    expect(limiter.tryConsume("playfield", now)).toBe(true);
    expect(limiter.tryConsume("playfield", now + 1000)).toBe(false);
    expect(limiter.tryConsume("playfield", now + 61_000)).toBe(true);
  });

  it("tracks workspaces independently", () => {
    const limiter = new SlidingWindowRateLimiter(1);
    const now = 1_000_000;
    expect(limiter.tryConsume("playfield", now)).toBe(true);
    expect(limiter.tryConsume("nextdoordev", now)).toBe(true);
  });

  it("never blocks when the limit is null", () => {
    const limiter = new SlidingWindowRateLimiter(null);
    const now = 1_000_000;
    for (let i = 0; i < 100; i++) {
      expect(limiter.tryConsume("playfield", now)).toBe(true);
    }
  });

  it("never blocks when the limit is 0", () => {
    const limiter = new SlidingWindowRateLimiter(0);
    expect(limiter.tryConsume("playfield", 1)).toBe(true);
  });
});
