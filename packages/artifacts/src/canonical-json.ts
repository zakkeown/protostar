/** Recursively sorts object keys; arrays preserve order; primitives unchanged. Used for byte-stable JSON output across factory-cli stdout (Q-12) and packages/execution snapshot serialization. */
export function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)])
    );
  }
  return value;
}
