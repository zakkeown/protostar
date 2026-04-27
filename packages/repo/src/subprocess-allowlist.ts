export const SUBPROCESS_BASELINE_ALLOWLIST: readonly string[] =
  Object.freeze(["git", "pnpm", "node", "tsc"]);

/**
 * Baseline ∪ policyExtension. Policy may extend but never remove baseline.
 */
export function intersectAllowlist(policyExtension?: readonly string[]): readonly string[] {
  const merged = new Set<string>(SUBPROCESS_BASELINE_ALLOWLIST);
  for (const command of policyExtension ?? []) {
    merged.add(command);
  }
  return Object.freeze([...merged].sort());
}
