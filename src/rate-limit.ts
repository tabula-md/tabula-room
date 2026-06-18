export type RateLimiter = {
  assertAllowed: (key: string) => void;
};

type Bucket = {
  count: number;
  startedAt: number;
};

export function createRateLimiter({
  limit,
  windowMs = 60_000,
  now = () => Date.now(),
}: {
  limit: number;
  windowMs?: number;
  now?: () => number;
}): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    assertAllowed(key) {
      if (!Number.isFinite(limit) || limit <= 0) {
        return;
      }

      const timestamp = now();
      const bucket = buckets.get(key);
      if (!bucket || timestamp - bucket.startedAt >= windowMs) {
        buckets.set(key, { count: 1, startedAt: timestamp });
        return;
      }

      bucket.count += 1;
      if (bucket.count > limit) {
        throw new RateLimitError();
      }
    },
  };
}

export class RateLimitError extends Error {
  readonly statusCode = 429;

  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}
