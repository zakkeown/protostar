export class CanonicalizationError extends Error {
  constructor(public readonly reason: string, public readonly path: string) {
    super(`canonicalize: ${reason} at ${path}`);
    this.name = "CanonicalizationError";
  }
}

/**
 * canonicalForm "json-c14n@1.0" — JCS-compatible JSON subset.
 *
 * The authority verifier fail-closes on values JSON.stringify would silently
 * coerce or omit, including -0, non-finite numbers, undefined, and non-plain
 * objects.
 */
export function canonicalizeJsonC14nV1(value: unknown): string {
  validateCanonicalInput(value, "$");
  return canonicalSerialize(value);
}

export function validateCanonicalInput(v: unknown, path = "$"): void {
  if (v === undefined) {
    throw new CanonicalizationError("undefined not permitted", path);
  }

  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      throw new CanonicalizationError("non-finite number", path);
    }
    if (Object.is(v, -0)) {
      throw new CanonicalizationError("-0 not permitted", path);
    }
    return;
  }

  if (v === null || typeof v === "boolean" || typeof v === "string") {
    return;
  }

  if (typeof v === "bigint") {
    throw new CanonicalizationError("BigInt not permitted", path);
  }
  if (typeof v === "symbol") {
    throw new CanonicalizationError("Symbol not permitted", path);
  }
  if (typeof v === "function") {
    throw new CanonicalizationError("function not permitted", path);
  }

  if (Array.isArray(v)) {
    v.forEach((item, index) => validateCanonicalInput(item, `${path}[${index}]`));
    return;
  }

  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
    throw new CanonicalizationError(`non-plain object (${(v as object).constructor?.name ?? "?"})`, path);
  }

  const symbols = Object.getOwnPropertySymbols(v as object);
  if (symbols.length > 0) {
    throw new CanonicalizationError("Symbol keys not permitted", path);
  }

  for (const key of Object.keys(v as object)) {
    validateCanonicalInput((v as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

function canonicalSerialize(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" || typeof v === "string") {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return `[${v.map(canonicalSerialize).join(",")}]`;
  }

  const keys = Object.keys(v as object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize((v as Record<string, unknown>)[key])}`).join(",")}}`;
}
