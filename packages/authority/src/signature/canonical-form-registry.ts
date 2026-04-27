import type { CanonicalFormTag } from "@protostar/intent/confirmed-intent";

import { canonicalizeJsonC14nV1 } from "./canonicalize.js";

const CANONICALIZERS = {
  "json-c14n@1.0": canonicalizeJsonC14nV1
} as const satisfies Record<CanonicalFormTag, (value: unknown) => string>;

export const CANONICAL_FORM_TAGS: readonly CanonicalFormTag[] = Object.freeze(
  Object.keys(CANONICALIZERS) as CanonicalFormTag[]
);

export function resolveCanonicalizer(tag: string): ((value: unknown) => string) | null {
  return (CANONICALIZERS as Record<string, (value: unknown) => string>)[tag] ?? null;
}
