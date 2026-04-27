export function nextBackoffMs(attempt: number, rng: () => number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  const base = Math.min(16_000, 1000 * 2 ** (normalizedAttempt - 1));
  const jitter = base * 0.2 * (rng() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

export function createDeterministicRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // Mulberry32: compact deterministic RNG suitable for repeatable retry tests.
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
