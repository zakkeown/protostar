// ============================================================================
// Public mint-surface contract test (Plan 06b Task D).
//
// The type-level Assert<Equal<MintingKeys, "promoteIntentDraft">> is the
// LOAD-bearing check: it fails `tsc -b` whenever any new public function on
// @protostar/intent returns a ConfirmedIntent. The runtime smoke + leak grep
// are tripwires for the cases the type-level check cannot see (export * from
// "./internal/...", stale rebuilds, etc.).
//
// If the type-level Equal breaks, `tsc -b` fails before this file runs.
// ============================================================================

import * as IntentPublicApi from "@protostar/intent";
import type { ConfirmedIntentBrandWitness } from "@protostar/intent/internal/brand-witness";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---- Type-level pin: only one public function returns ConfirmedIntent ----
type IntentPublicSurface = typeof IntentPublicApi;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// Distributing R via a conditional ensures discriminated-union return shapes
// (e.g. `{ ok: true; intent: ConfirmedIntent } | { ok: false; ... }`) match
// the brand-on-`intent` arm rather than collapsing to `false` because the
// failure arm lacks `intent`.
type ReturnsConfirmed<K extends keyof IntentPublicSurface> =
  IntentPublicSurface[K] extends (...args: never[]) => infer R
    ? Extract<R, ConfirmedIntentBrandWitness> extends never
      ? Extract<R, { readonly intent: ConfirmedIntentBrandWitness }> extends never
        ? false
        : true
      : true
    : false;

type MintingKeys = {
  [K in keyof IntentPublicSurface]: ReturnsConfirmed<K> extends true ? K : never;
}[keyof IntentPublicSurface];

type _MintSurfacePinned = Assert<Equal<MintingKeys, "promoteIntentDraft">>;

// ---- Type-level negative: test/internal helpers must NOT be on public surface ----
type IntentPublicKeys = keyof typeof IntentPublicApi;
type _NoBuildConfirmedIntentForTest = Assert<
  "buildConfirmedIntentForTest" extends IntentPublicKeys ? false : true
>;
type _NoMintConfirmedIntent = Assert<"mintConfirmedIntent" extends IntentPublicKeys ? false : true>;
type _NoDefineConfirmedIntent = Assert<"defineConfirmedIntent" extends IntentPublicKeys ? false : true>;
type _NoAssertConfirmedIntent = Assert<"assertConfirmedIntent" extends IntentPublicKeys ? false : true>;

// Suppress unused-type warnings (these asserts run at compile time).
void (undefined as unknown as
  | _MintSurfacePinned
  | _NoBuildConfirmedIntentForTest
  | _NoMintConfirmedIntent
  | _NoDefineConfirmedIntent
  | _NoAssertConfirmedIntent);

// ---- Runtime smoke + leak grep ----
const __dirname = dirname(fileURLToPath(import.meta.url));
const intentSrcRoot = resolve(__dirname, "../../intent/src");

async function* walkBarrels(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip the internal/ subtree itself — it's the source, not a leak vector.
      if (entry.name === "internal") continue;
      yield* walkBarrels(full);
    } else if (entry.name === "index.ts") {
      yield full;
    }
  }
}

describe("ConfirmedIntent mint surface", () => {
  it("only promoteIntentDraft mints ConfirmedIntent on @protostar/intent public surface", () => {
    assert.equal(typeof IntentPublicApi.promoteIntentDraft, "function");
  });

  it("no consumer-facing barrel re-exports from ./internal/*", async () => {
    const offenders: string[] = [];
    for await (const barrel of walkBarrels(intentSrcRoot)) {
      const body = await readFile(barrel, "utf8");
      // Strip line + block comments for the leak check.
      const stripped = body
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (
        /from\s+["']\.\/internal\//.test(stripped) ||
        /from\s+["']\.\.\/internal\//.test(stripped) ||
        /from\s+["']\.\.\/\.\.\/internal\//.test(stripped)
      ) {
        offenders.push(barrel);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Public/subpath barrels must not re-export from internal/. Offenders: ${offenders.join(", ")}`
    );
  });
});
