import { describe, expect, it } from "vitest";
import { createRateLimiter, RateLimitError } from "../src/rate-limit.js";

describe("rate limiter", () => {
  it("enforces the configured limit within one window", () => {
    let timestamp = 0;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1_000,
      now: () => timestamp,
    });

    limiter.assertAllowed("snapshot:127.0.0.1:room_123");
    limiter.assertAllowed("snapshot:127.0.0.1:room_123");

    expect(() => limiter.assertAllowed("snapshot:127.0.0.1:room_123")).toThrow(RateLimitError);
    expect(limiter.bucketCount()).toBe(1);
  });

  it("resets a key after its window expires", () => {
    let timestamp = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      now: () => timestamp,
    });

    limiter.assertAllowed("message:room_123:socket_a");
    expect(() => limiter.assertAllowed("message:room_123:socket_a")).toThrow(RateLimitError);

    timestamp = 1_000;
    expect(() => limiter.assertAllowed("message:room_123:socket_a")).not.toThrow();
    expect(limiter.bucketCount()).toBe(1);
  });

  it("prunes expired buckets during normal checks", () => {
    let timestamp = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      now: () => timestamp,
    });

    limiter.assertAllowed("message:room_123:socket_a");
    limiter.assertAllowed("message:room_123:socket_b");
    expect(limiter.bucketCount()).toBe(2);

    timestamp = 1_000;
    limiter.assertAllowed("message:room_123:socket_c");

    expect(limiter.bucketCount()).toBe(1);
  });

  it("does not allocate buckets when disabled", () => {
    const limiter = createRateLimiter({ limit: 0 });

    limiter.assertAllowed("socket:127.0.0.1");
    limiter.assertAllowed("socket:127.0.0.1");

    expect(limiter.bucketCount()).toBe(0);
  });
});
