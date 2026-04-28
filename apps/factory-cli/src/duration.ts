const DURATION_PATTERN = /^(\d+)(s|m|h|d|w)$/;

const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000
} as const;

export function parseDuration(input: string):
  | { readonly ok: true; readonly ms: number }
  | { readonly ok: false; readonly reason: string } {
  const match = DURATION_PATTERN.exec(input);
  if (match === null) {
    return {
      ok: false,
      reason: `duration must match <integer><s|m|h|d|w>, got ${JSON.stringify(input)}`
    };
  }

  const [, amountRaw, unit] = match;
  return {
    ok: true,
    ms: Number(amountRaw) * UNIT_MS[unit as keyof typeof UNIT_MS]
  };
}
