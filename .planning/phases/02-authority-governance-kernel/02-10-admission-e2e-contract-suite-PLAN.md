---
phase: 02-authority-governance-kernel
plan: 10
type: execute
wave: 4
depends_on: [02, 04, 05, 06, 07, 08, 09]
files_modified:
  - packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts
  - packages/admission-e2e/src/authorized-subprocess-op-mint.contract.test.ts
  - packages/admission-e2e/src/authorized-network-op-mint.contract.test.ts
  - packages/admission-e2e/src/authorized-budget-op-mint.contract.test.ts
  - packages/admission-e2e/src/precedence-decision-mint.contract.test.ts
  - packages/admission-e2e/src/signed-admission-decision-mint.contract.test.ts
  - packages/admission-e2e/src/authority-no-fs.contract.test.ts
  - packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
  - packages/admission-e2e/package.json
autonomous: true
requirements:
  - GOV-02
  - GOV-03
  - GOV-06
must_haves:
  truths:
    - "Each of the six new brands (`AuthorizedWorkspaceOp`, `AuthorizedSubprocessOp`, `AuthorizedNetworkOp`, `AuthorizedBudgetOp`, `PrecedenceDecision`, `SignedAdmissionDecision`) has a three-layer contract test mirroring `confirmed-intent-mint.contract.test.ts`"
    - "Each contract test pins the SOLE PUBLIC PRODUCER for the brand (positive keyof) AND asserts mints + test-builders are NOT on the public surface (negative keyof) AND runtime barrel-leak grep over compiled dist/"
    - "Authority boundary regression test: zero `node:fs` imports anywhere under `packages/authority/src/` (compile-time + runtime)"
    - "End-to-end signed-intent verifier test: produce signed intent via factory-cli pipeline → verify via `verifyConfirmedIntentSignature` round-trip → mutate → re-verify fails with structured mismatch"
    - "Phase 1 contract test (`promoteIntentDraft` is sole producer of ConfirmedIntent) STILL PASSES — no regression"
  artifacts:
    - path: packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts
      provides: "Three-layer contract test pinning authorizeWorkspaceOp as sole public producer"
      contains: "AuthorizedWorkspaceOp"
    - path: packages/admission-e2e/src/authority-no-fs.contract.test.ts
      provides: "Regression: grep over packages/authority/src/ for node:fs imports — fails if any exist"
      contains: "node:fs"
    - path: packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
      provides: "End-to-end sign-then-verify round-trip + tamper-detection across the full Phase 2 pipeline"
      contains: "verifyConfirmedIntentSignature"
  key_links:
    - from: packages/admission-e2e/src/*.contract.test.ts
      to: "@protostar/authority/internal/brand-witness"
      via: "type-only imports of *BrandWitness for the type-level positive keyof check"
      pattern: "BrandWitness"
    - from: packages/admission-e2e/src/authority-no-fs.contract.test.ts
      to: packages/authority/src/
      via: "fs.readdir + readFile of compiled dist + src to grep for node:fs imports"
      pattern: "node:fs"
---

<objective>
Wave 4 — the admission-e2e contract layer that pins Phase 2's six new brands and the authority boundary. Mechanical instantiation of Phase 1's `confirmed-intent-mint.contract.test.ts` template at `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` six more times — once per new brand.

Per Q-08 (locked): "Both — strict `package.json` exports + admission-e2e contract tests. Belt-and-suspenders." This plan ships the contract-test half. Plan 01 + 02 + 04 + 06 wired the export half.

Per RESEARCH.md "Pattern 1: Module-Private Brand Mint with Three-Layer Contract Guard" (lines ~191-260): each test has three layers:
- **Layer 1 (type-level positive):** `Assert<Equal<MintingKeys, "authorizeXOp">>` — fails `tsc -b` if any new public function returns the brand
- **Layer 2 (type-level negative):** `Assert<"mintAuthorizedXOp" extends keyof PublicApi ? false : true>` — fails if mint leaks
- **Layer 3 (runtime barrel-leak grep):** walks compiled dist/, asserts no string-match for the test-builder names in any public barrel

PLUS this plan ships two cross-cutting tests:
- **`authority-no-fs.contract.test.ts`:** structural regression. Greps `packages/authority/src/**/*.ts` for `from "node:fs"` or `from "fs"` — fails if any match. This is the load-bearing AGENTS.md authority-boundary lock encoded as a test.
- **`signed-confirmed-intent.e2e.test.ts`:** full-pipeline test. Uses test-builders to assemble inputs → factory-cli signing path → stage reader's verify path → mutate persisted artifact → re-verify fails. Closes T-2-1 with end-to-end coverage.

Output: 6 new contract test files + 2 cross-cutting tests; full Phase 2 surface pinned.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/02-authority-governance-kernel/02-VALIDATION.md
@packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
@packages/admission-e2e/package.json

<interfaces>
<!-- Phase 1 template — copy verbatim, adapt names. -->

From packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts:
- 3-layer guard: positive type-level + negative type-level + runtime barrel-leak grep
- Imports: `* as IntentPublicApi from "@protostar/intent"` + type `ConfirmedIntentBrandWitness from "@protostar/intent/internal/brand-witness"`

For Phase 2, six brands × same pattern. Public APIs and brand witnesses:

| Brand | PublicApi import | BrandWitness import | Sole producer | Forbidden public exports |
|-------|------------------|---------------------|---------------|--------------------------|
| AuthorizedWorkspaceOp | `@protostar/authority` | `@protostar/authority/internal/brand-witness` | `authorizeWorkspaceOp` | `mintAuthorizedWorkspaceOp`, `buildAuthorizedWorkspaceOpForTest` |
| AuthorizedSubprocessOp | same | same | `authorizeSubprocessOp` | `mintAuthorizedSubprocessOp`, `buildAuthorizedSubprocessOpForTest` |
| AuthorizedNetworkOp | same | same | `authorizeNetworkOp` | `mintAuthorizedNetworkOp`, `buildAuthorizedNetworkOpForTest` |
| AuthorizedBudgetOp | same | same | `authorizeBudgetOp` | `mintAuthorizedBudgetOp`, `buildAuthorizedBudgetOpForTest` |
| PrecedenceDecision | same | same | `intersectEnvelopes` | `mintPrecedenceDecision`, `buildPrecedenceDecisionForTest` |
| SignedAdmissionDecision | same | same | `signAdmissionDecision` | `mintSignedAdmissionDecision`, `buildSignedAdmissionDecisionForTest` |

For SignedAdmissionDecision: the brand is generic over evidence type `E`. The contract test pins via the witness alias (covered by `internal/brand-witness.ts` providing a default-erased witness type).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Six per-brand three-layer contract tests + authority-no-fs regression</name>
  <files>
    packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts,
    packages/admission-e2e/src/authorized-subprocess-op-mint.contract.test.ts,
    packages/admission-e2e/src/authorized-network-op-mint.contract.test.ts,
    packages/admission-e2e/src/authorized-budget-op-mint.contract.test.ts,
    packages/admission-e2e/src/precedence-decision-mint.contract.test.ts,
    packages/admission-e2e/src/signed-admission-decision-mint.contract.test.ts,
    packages/admission-e2e/src/authority-no-fs.contract.test.ts,
    packages/admission-e2e/package.json
  </files>
  <read_first>
    - packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts (Phase 1 template — copy verbatim, adapt brand names)
    - packages/authority/src/internal/brand-witness.ts (after Plans 02/04/06 — exports the 6 brand witnesses)
    - packages/authority/src/internal/test-builders.ts (after Plans 02/04/06 — exports the 6 test-builders)
    - packages/admission-e2e/package.json (verify @protostar/authority is a dependency; add if missing)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pattern 1" (lines ~191-260) for the verbatim 3-layer guard
  </read_first>
  <behavior>
    - Each of the 6 contract tests has the same structure as `confirmed-intent-mint.contract.test.ts` adapted for the new brand
    - Layer 1 (type-level positive): `MintingKeys` extracted via discriminated-union-aware Extract<R, BrandWitness | {ok: true; <result-field>: BrandWitness}>; `Assert<Equal<MintingKeys, "<sole-producer>">>`
    - Layer 2 (type-level negative): `Assert<"mintXXX" extends keyof PublicApi ? false : true>` for the mint AND for the test-builder
    - Layer 3 (runtime barrel grep): walks `packages/authority/src/**/*.ts` files (compiled dist mirrors source structure) AND walks `packages/authority/dist/index.js` + nested barrel files; asserts `mintXXX` and `buildXXXForTest` strings do NOT appear in any public barrel (`index.ts` files outside `internal/`)
    - The shared barrel-walk logic from Phase 1's test (the `walkBarrels` async generator) is duplicated per file or hoisted to a shared helper. **Recommended:** extract to `packages/admission-e2e/src/_helpers/barrel-walker.ts` (NOT a test file — no `.test.ts` suffix; imported by tests). Reuse across all 6 contract tests.
    - `authority-no-fs.contract.test.ts` — runtime test that walks `packages/authority/src/` (NOT just barrels — every .ts file) and asserts no `from "node:fs"` or `from "fs"` substring. Allows `node:crypto` (Q-15 lock for SHA-256).
  </behavior>
  <action>
**Extract the barrel-walker helper:**

`packages/admission-e2e/src/_helpers/barrel-walker.ts`:
```ts
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export async function* walkBarrels(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "internal") continue;  // internal/ is the source, not a leak vector
      yield* walkBarrels(full);
    } else if (entry.name === "index.ts") {
      yield full;
    }
  }
}

export async function* walkAllTypeScriptFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkAllTypeScriptFiles(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

export async function readAll(filePath: string): Promise<string> {
  return await readFile(filePath, "utf8");
}
```

Note on import: `node:fs/promises` IS allowed in `packages/admission-e2e/` — admission-e2e is a TEST package and tests inherently read fs. The authority-boundary lock applies only to `packages/authority/src/`.

**Per-brand contract test template** — produce 6 files, one per brand. Each file follows this exact structure (substitute brand name + sole producer):

```ts
// packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts
import * as AuthorityPublicApi from "@protostar/authority";
import type { AuthorizedWorkspaceOpBrandWitness } from "@protostar/authority/internal/brand-witness";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walkBarrels, readAll } from "./_helpers/barrel-walker.js";

// ---- Layer 1: type-level positive ----
type AuthoritySurface = typeof AuthorityPublicApi;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type ReturnsBrand<K extends keyof AuthoritySurface> =
  AuthoritySurface[K] extends (...args: never[]) => infer R
    ? Extract<R, AuthorizedWorkspaceOpBrandWitness> extends never
      ? Extract<R, { readonly authorized: AuthorizedWorkspaceOpBrandWitness }> extends never
        ? false
        : true
      : true
    : false;

type MintingKeys = {
  [K in keyof AuthoritySurface]: ReturnsBrand<K> extends true ? K : never;
}[keyof AuthoritySurface];

type _SurfacePinned = Assert<Equal<MintingKeys, "authorizeWorkspaceOp">>;

// ---- Layer 2: type-level negative ----
type AuthorityKeys = keyof typeof AuthorityPublicApi;
type _NoMintExported = Assert<"mintAuthorizedWorkspaceOp" extends AuthorityKeys ? false : true>;
type _NoBuilderExported = Assert<"buildAuthorizedWorkspaceOpForTest" extends AuthorityKeys ? false : true>;

void (undefined as unknown as
  | _SurfacePinned | _NoMintExported | _NoBuilderExported);

// ---- Layer 3: runtime barrel-leak grep ----
const __dirname = dirname(fileURLToPath(import.meta.url));
const authoritySrcRoot = resolve(__dirname, "../../authority/src");

describe("@protostar/authority — AuthorizedWorkspaceOp mint surface", () => {
  it("public producer is authorizeWorkspaceOp at runtime", () => {
    assert.equal(typeof AuthorityPublicApi.authorizeWorkspaceOp, "function");
  });

  it("mintAuthorizedWorkspaceOp is not on public barrels", async () => {
    for await (const barrelPath of walkBarrels(authoritySrcRoot)) {
      const contents = await readAll(barrelPath);
      assert.equal(
        contents.includes("mintAuthorizedWorkspaceOp"),
        false,
        `mint leaked at ${barrelPath}`,
      );
    }
  });

  it("buildAuthorizedWorkspaceOpForTest is not on public barrels", async () => {
    for await (const barrelPath of walkBarrels(authoritySrcRoot)) {
      const contents = await readAll(barrelPath);
      assert.equal(
        contents.includes("buildAuthorizedWorkspaceOpForTest"),
        false,
        `test builder leaked at ${barrelPath}`,
      );
    }
  });
});
```

**Repeat verbatim** for the other 5 brands. Substitutions:
- AuthorizedSubprocessOp / authorizeSubprocessOp / mintAuthorizedSubprocessOp / buildAuthorizedSubprocessOpForTest
- AuthorizedNetworkOp / authorizeNetworkOp / mintAuthorizedNetworkOp / buildAuthorizedNetworkOpForTest
- AuthorizedBudgetOp / authorizeBudgetOp / mintAuthorizedBudgetOp / buildAuthorizedBudgetOpForTest
- PrecedenceDecision / intersectEnvelopes / mintPrecedenceDecision / buildPrecedenceDecisionForTest
- SignedAdmissionDecision / signAdmissionDecision / mintSignedAdmissionDecision / buildSignedAdmissionDecisionForTest

For SignedAdmissionDecision: the witness type is generic. Use the default-erased form `SignedAdmissionDecisionBrandWitness` (export a non-generic default alias from `internal/brand-witness.ts` as `export type SignedAdmissionDecisionBrandWitness = SignedAdmissionDecision<object>;` if needed for the discriminating `Extract` to work cleanly — verify by attempting compile and adjusting).

**`packages/admission-e2e/src/authority-no-fs.contract.test.ts`:**
```ts
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walkAllTypeScriptFiles, readAll } from "./_helpers/barrel-walker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const authoritySrcRoot = resolve(__dirname, "../../authority/src");

describe("@protostar/authority — authority boundary lock", () => {
  it("no node:fs imports anywhere in src/", async () => {
    const offenders: string[] = [];
    const forbidden = [/from\s+["']node:fs["']/, /from\s+["']fs["']/, /from\s+["']node:fs\/promises["']/];
    for await (const file of walkAllTypeScriptFiles(authoritySrcRoot)) {
      const contents = await readAll(file);
      // Strip line comments before scanning to avoid false positives
      const code = contents.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const pat of forbidden) {
        if (pat.test(code)) {
          offenders.push(file);
          break;
        }
      }
    }
    assert.deepEqual(offenders, [], `node:fs imports forbidden in @protostar/authority. Offenders:\n${offenders.join("\n")}`);
  });

  it("node:crypto is permitted (Q-15 lock)", async () => {
    let foundCrypto = false;
    for await (const file of walkAllTypeScriptFiles(authoritySrcRoot)) {
      const contents = await readAll(file);
      if (/from\s+["']node:crypto["']/.test(contents)) { foundCrypto = true; break; }
    }
    assert.equal(foundCrypto, true, "expected node:crypto usage somewhere in @protostar/authority (sign/policy-snapshot)");
  });
});
```

**Update `packages/admission-e2e/package.json`** dependencies — add `@protostar/authority` and `@protostar/repo` if not already present (transitive through `@protostar/intent` does not give us the subpath imports we need).

Note on `tsc -b` semantics: Layer 1 + Layer 2 type-level checks do not produce runtime test cases — they fail the build instead. The runtime tests in Layer 3 only verify the barrel grep. Phase 1 used the same approach; reuse it.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/admission-e2e test` exits 0
    - All 7 new test files exist:
      - `test -f packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts`
      - `test -f packages/admission-e2e/src/authorized-subprocess-op-mint.contract.test.ts`
      - `test -f packages/admission-e2e/src/authorized-network-op-mint.contract.test.ts`
      - `test -f packages/admission-e2e/src/authorized-budget-op-mint.contract.test.ts`
      - `test -f packages/admission-e2e/src/precedence-decision-mint.contract.test.ts`
      - `test -f packages/admission-e2e/src/signed-admission-decision-mint.contract.test.ts`
      - `test -f packages/admission-e2e/src/authority-no-fs.contract.test.ts`
    - Each contract test has all three layers: `grep -c '_SurfacePinned\\|_NoMintExported\\|_NoBuilderExported' packages/admission-e2e/src/authorized-*-op-mint.contract.test.ts | grep -v ':0' | wc -l` outputs `4` (4 op-brand tests; precedence + signed-admission have analogous Asserts)
    - **Authority boundary regression test runs**: `pnpm --filter @protostar/admission-e2e test 2>&1 | grep -c 'authority boundary lock'` >= 1 OR test passes silently with `node --test` reporter
    - **Phase 1 contract test still passes**: the existing `confirmed-intent-mint.contract.test.ts` is untouched and `_MintSurfacePinned` still resolves to `"promoteIntentDraft"`
    - `pnpm run verify:full` exits 0
  </acceptance_criteria>
  <done>Six per-brand contract tests + authority no-fs regression shipped; full Phase 2 brand surface pinned at type + runtime levels.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: End-to-end signed-intent verifier test</name>
  <files>
    packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts,
    packages/admission-e2e/package.json
  </files>
  <read_first>
    - packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts (test-builder usage pattern)
    - packages/authority/src/signature/sign.ts (buildSignatureEnvelope)
    - packages/authority/src/signature/verify.ts (verifyConfirmedIntentSignature shape)
    - packages/authority/src/stage-reader/factory.ts (after Plan 09 — verifyConfirmedIntent method)
    - apps/factory-cli/src/write-admission-decision.ts (after Plan 07 — writePolicySnapshot)
  </read_first>
  <behavior>
    - End-to-end test using the test-builders + an in-memory FsAdapter:
      1. Build a `ConfirmedIntent` via `buildConfirmedIntentForTest`
      2. Build a `PolicySnapshot` via `buildPolicySnapshot`
      3. Compute signature via `buildSignatureEnvelope`
      4. Mint a signed intent variant (via the path Plan 07 added to `promoteIntentDraft` — or equivalent test-only signing helper)
      5. Persist all artifacts in an in-memory FsAdapter representing a `runs/{id}/` directory
      6. Construct an `AuthorityStageReader` over the in-memory fs
      7. Call `reader.verifyConfirmedIntent()` → assert `ok: true`
      8. **Tamper case**: mutate the persisted `intent.json` (e.g. change a title), reconstruct reader, call `verifyConfirmedIntent()` → assert `ok: false`, `mismatch.field` is one of the 5 expected literals
      9. **Tamper-snapshot case**: mutate `policy-snapshot.json` byte → `ok: false`, `mismatch.field === "policySnapshotHash"`
      10. **Unknown canonicalForm tag**: persist a signature with `canonicalForm: "json-c14n@2.0"` → `ok: false`, `mismatch.field === "canonicalForm"`
    - Closes T-2-1 with end-to-end coverage
  </behavior>
  <action>
**`packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts`:**
```ts
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  createAuthorityStageReader,
  buildPolicySnapshot,
  buildSignatureEnvelope,
  hashPolicySnapshot,
  type FsAdapter,
} from "@protostar/authority";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

class InMemoryFs implements FsAdapter {
  constructor(public readonly files: Map<string, string>) {}
  async readFile(p: string) {
    const v = this.files.get(p);
    if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return v;
  }
  async exists(p: string) { return this.files.has(p); }
}

describe("Phase 2 — signed-intent end-to-end", () => {
  function setupHappyRun(): { fs: InMemoryFs; runDir: string } {
    const runDir = "/runs/run-test-1";
    const intent = buildConfirmedIntentForTest({ /* defaults */ });
    const snapshot = buildPolicySnapshot({
      policy: { archetype: "cosmetic-tweak" },
      resolvedEnvelope: intent.capabilityEnvelope,
    });
    const policySnapshotHash = hashPolicySnapshot(snapshot);
    const sig = buildSignatureEnvelope({
      intent: stripBrandAndSignature(intent),
      resolvedEnvelope: intent.capabilityEnvelope,
      policySnapshotHash,
    });
    const signed = { ...intent, signature: sig };

    const files = new Map<string, string>([
      [`${runDir}/intent.json`, JSON.stringify(signed, null, 2)],
      [`${runDir}/policy-snapshot.json`, JSON.stringify(snapshot, null, 2)],
      // omit precedence-decision.json — no-conflict run
    ]);
    return { fs: new InMemoryFs(files), runDir };
  }

  it("happy path: signed intent verifies ok", async () => {
    const { fs, runDir } = setupHappyRun();
    const reader = createAuthorityStageReader(runDir, fs);
    const result = await reader.verifyConfirmedIntent();
    assert.equal(result.ok, true);
  });

  it("tampered intent body: verify fails", async () => {
    const { fs, runDir } = setupHappyRun();
    const intentPath = `${runDir}/intent.json`;
    const intent = JSON.parse(fs.files.get(intentPath)!);
    intent.title = "MUTATED — should fail signature";
    fs.files.set(intentPath, JSON.stringify(intent));
    const reader = createAuthorityStageReader(runDir, fs);
    const result = await reader.verifyConfirmedIntent();
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(["intentBody", "resolvedEnvelope", "policySnapshotHash"].includes(result.mismatch.field));
  });

  it("tampered policy snapshot: verify fails with policySnapshotHash mismatch", async () => {
    const { fs, runDir } = setupHappyRun();
    const snapPath = `${runDir}/policy-snapshot.json`;
    const snap = JSON.parse(fs.files.get(snapPath)!);
    snap.capturedAt = "1970-01-01T00:00:00.000Z";   // mutate
    fs.files.set(snapPath, JSON.stringify(snap));
    const reader = createAuthorityStageReader(runDir, fs);
    const result = await reader.verifyConfirmedIntent();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.mismatch.field, "policySnapshotHash");
  });

  it("unknown canonicalForm tag: fail-closed", async () => {
    const { fs, runDir } = setupHappyRun();
    const intentPath = `${runDir}/intent.json`;
    const intent = JSON.parse(fs.files.get(intentPath)!);
    intent.signature.canonicalForm = "json-c14n@2.0";   // future tag
    // schemaVersion enum is ["1.0.0", "1.1.0"]; canonicalForm enum is ["json-c14n@1.0"] —
    // the schema validates at the reader; this might be rejected at parse time. If so,
    // catch the StageReaderError and assert it mentions canonicalForm.
    fs.files.set(intentPath, JSON.stringify(intent));
    const reader = createAuthorityStageReader(runDir, fs);
    try {
      const result = await reader.verifyConfirmedIntent();
      // If schema validation didn't catch it, the verifier did:
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.mismatch.field, "canonicalForm");
    } catch (err) {
      assert.ok(/canonicalForm/.test((err as Error).message));
    }
  });
});
```

For the `stripBrandAndSignature` helper used in test setup: this can be a local helper that does `const { signature: _, ...rest } = intent; return rest;` — narrows out the signature for the hash payload. (Same logic the verifier uses internally.)

For the test-builder import: `@protostar/intent/internal/test-builders` is a published subpath from Phase 1; `@protostar/authority/internal/test-builders` is the new subpath from Plans 02/04/06. Both must be reachable via `package.json` exports for this test to compile.

**Update `packages/admission-e2e/package.json`** dependencies — add `@protostar/authority` and confirm `@protostar/intent` and `@protostar/repo` are present.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test &amp;&amp; pnpm run verify:full</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/admission-e2e test` exits 0
    - File `packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts` exists
    - All 4 e2e cases (happy / tampered-intent / tampered-snapshot / unknown-canonicalForm) pass
    - `pnpm run verify:full` exits 0 — the FULL Phase 1 + Phase 2 suite is green
    - `grep -c 'verifyConfirmedIntent\\|verifyConfirmedIntentSignature' packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts` >= 1
  </acceptance_criteria>
  <done>End-to-end signed-intent test green; T-2-1 closed with full pipeline coverage; Phase 2 verification gate ready.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public-surface boundary | What ships from `@protostar/authority` to consumers — pinned by 6 contract tests + authority-no-fs regression |
| End-to-end signature boundary | Sign → persist → read → verify — exercised end-to-end via in-memory fs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-2 | Tampering / Elevation of Privilege | Capability envelope widening between admission and execution | mitigate (high severity, primary closure) | Six per-brand contract tests pin the SOLE PUBLIC PRODUCER for each AuthorizedOp brand; mints + test-builders barred from public barrels (type-level + runtime grep). Boundaries cannot accept anything but a brand obtained from the kernel. |
| T-2-1 | Tampering | Tampered ConfirmedIntent reaches execution | mitigate (high severity, e2e closure) | `signed-confirmed-intent.e2e.test.ts` covers the full pipeline: sign → persist → mutate → verify catches every mutation point (intent body, snapshot, canonicalForm tag). |
| T-2-7 | Tampering | Canonicalization ambiguity | mitigate (e2e coverage) | Unknown canonicalForm tag test verifies fail-closed end-to-end through the stage reader. |
| Authority-boundary structural lock | (cross-cutting) | `@protostar/authority` package | mitigate | `authority-no-fs.contract.test.ts` regression — fails the suite if any future change introduces `node:fs` import in the authority package. |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` exits 0 (all 7 new tests + Phase 1 contract test green)
- `pnpm run verify:full` exits 0 — entire Phase 1 + Phase 2 suite passes
- 6 brand contract tests cover all six new brands
- authority-no-fs regression passes (zero node:fs imports in @protostar/authority/src/)
- e2e signed-intent test covers happy + 3 tamper cases
- Phase 1 `promoteIntentDraft` sole-producer test still passes
</verification>

<success_criteria>
- Six per-brand three-layer contract tests pin every Phase 2 brand
- Authority boundary structurally enforced via regression test
- End-to-end sign-verify-tamper pipeline tested
- All requirements (GOV-02 / GOV-03 / GOV-06) backed by automated coverage
- Phase 2 ready for `/gsd-verify-work`
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-10-admission-e2e-contract-suite-SUMMARY.md`
</output>
