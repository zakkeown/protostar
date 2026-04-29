---
phase: 12-authority-boundary-stabilization
plan: 07
type: execute
wave: 3
depends_on: [12-03]
files_modified:
  - packages/admission-e2e/src/tier-conformance.contract.test.ts
  - packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts
autonomous: true
requirements: [AUTH-11, AUTH-12, AUTH-13]
must_haves:
  truths:
    - "`tier-conformance.contract.test.ts` parses the AGENTS.md tier table and the `PACKAGE_RULES` keys in `authority-boundary.contract.test.ts`"
    - "Three-way assertion holds for every package: manifest tier == AGENTS.md tier == authority-boundary contract entry"
    - "`evaluation-runner` is `network` everywhere — manifest stays `network`; `authority-boundary.contract.test.ts:77` flips from PURE_PACKAGE_RULE to a network-shaped rule"
    - "`mechanical-checks` is `pure` everywhere (post-12-03 relocation; manifest unchanged)"
    - "AGENTS.md parser fails LOUD if a tier label appears that the parser doesn't recognize (Pitfall 6)"
  artifacts:
    - path: "packages/admission-e2e/src/tier-conformance.contract.test.ts"
      provides: "Three-way tier conformance (manifest + AGENTS.md + authority-boundary contract)"
      contains: "AGENTS.md"
    - path: "packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts"
      provides: "evaluation-runner reclassified as network"
      contains: "evaluation-runner"
  key_links:
    - from: "packages/admission-e2e/src/tier-conformance.contract.test.ts"
      to: "AGENTS.md"
      via: "regex parse of `## Authority Tiers` bullets"
      pattern: "AGENTS\\.md"
---

<objective>
Extend `tier-conformance.contract.test.ts` (Phase 10.1.7 output) to parse the AGENTS.md tier table AND the `PACKAGE_RULES` keys in `authority-boundary.contract.test.ts`, then assert manifest-tier == AGENTS.md-tier == authority-boundary-entry for every package (D-12). Flip `evaluation-runner` in `authority-boundary.contract.test.ts:77` from `PURE_PACKAGE_RULE` to a network-shaped rule (D-13). Fail LOUD on unrecognized AGENTS.md tier labels (Pitfall 6).

Purpose: Mitigates T-12-04 (tier classification drift). One source of truth = `package.json protostar.tier`; the other two derive/assert.
Output: Extended tier-conformance test + reclassified evaluation-runner authority-boundary entry.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@AGENTS.md
@.planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md
@.planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md
@packages/admission-e2e/src/tier-conformance.contract.test.ts
@packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts

<interfaces>
**AGENTS.md tier table format** (lines 23-27):
```
- **orchestration (`fs-permitted`, `network-permitted`):** `apps/factory-cli`
- **filesystem (`fs-permitted`, `network-forbidden`):** `packages/repo`, `@protostar/paths` (scope-ceiled carve-out)
- **domain network (`network-permitted`, `fs-forbidden`):** `@protostar/dogpile-adapter`, `@protostar/delivery-runtime`, `@protostar/evaluation-runner`, `@protostar/lmstudio-adapter`
- **pure (`fs-forbidden`, `network-forbidden`):** `@protostar/artifacts`, `@protostar/authority`, ...
- **test-only:** `@protostar/admission-e2e` may depend on any tier ...
```

**Tier label → manifest tier mapping:**
```typescript
const AGENTS_TIER_TO_MANIFEST: Readonly<Record<string, string>> = Object.freeze({
  "orchestration": "orchestration",
  "filesystem":    "fs",
  "domain network": "network",
  "pure":          "pure",
  "test-only":     "test-only"
});
const EXPECTED_AGENTS_TIER_LABELS = Object.freeze(Object.keys(AGENTS_TIER_TO_MANIFEST));
```

**Parsers:**
```typescript
const TIER_LINE_PATTERN = /^-\s+\*\*([^(*]+?)\b[^:]*:\*\*\s+(.+)$/gm;
const PKG_NAME_PATTERN = /(?:@protostar\/[\w\-]+|apps\/[\w\-]+|packages\/[\w\-]+)/g;
```

**`authority-boundary.contract.test.ts:77`** currently classifies `evaluation-runner` as `PURE_PACKAGE_RULE`. The `dogpile-adapter` rule shape at lines 71-74 is the network template to mirror.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Flip evaluation-runner to network in authority-boundary contract</name>
  <files>packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts</files>
  <read_first>
    - packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts (lines 62-106 — PACKAGE_RULES; line 77 — evaluation-runner; lines 71-74 — dogpile-adapter network template)
    - packages/evaluation-runner/package.json (line 38 — manifest declares `tier: "network"`)
    - packages/evaluation-runner/src/run-evaluation-stages.ts (imports — confirm zero direct net imports; transitive net via dogpile-adapter)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"evaluation-runner tier reconciliation (D-13)" (lines 856-889)
  </read_first>
  <action>
    In `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts`:

    Find the `PACKAGE_RULES` block. Locate the `evaluation-runner` entry (currently `evaluation-runner: PURE_PACKAGE_RULE`) at line 77 (per RESEARCH).

    REPLACE the rule shape with a network-tier rule mirroring `dogpile-adapter` at lines 71-74. The network rule should:
    - Permit `@dogpile/sdk`, `@protostar/dogpile-types` imports.
    - Permit `@protostar/intent`, `@protostar/planning`, `@protostar/review`, `@protostar/evaluation` (existing imports per RESEARCH lines 861-867).
    - Forbid `node:fs`, `node:fs/promises`, `node:path` direct imports (matches the `no-fs.contract.test.ts` already in tree at `packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts`).
    - Permit `@protostar/dogpile-adapter` (the actual network-tier dep).

    Read lines 71-74's `dogpile-adapter` rule shape exactly and mirror it for evaluation-runner — do not invent a new rule shape. If `dogpile-adapter`'s rule has a `permitImports` array, copy it and adjust to the evaluation-runner imports listed above.

    Confirm by running `pnpm --filter @protostar/admission-e2e test --test-name-pattern authority-boundary`. The `evaluation-runner` package's actual src/ imports (zero direct net, but transitive via dogpile-adapter) should now match the network-shaped rule.

    Add a comment at the changed line: `// D-13 (Phase 12 AUTH-13): reclassified from PURE_PACKAGE_RULE — manifest tier is network; transitive net via @protostar/dogpile-adapter.`
  </action>
  <verify>
    <automated>! grep -E 'evaluation-runner.*PURE_PACKAGE_RULE|PURE_PACKAGE_RULE.*evaluation-runner' packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts &amp;&amp; grep -q 'D-13' packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - The string `evaluation-runner` no longer appears on the same line as `PURE_PACKAGE_RULE` in `authority-boundary.contract.test.ts`.
    - A comment containing `D-13` is present near the changed rule.
    - `pnpm --filter @protostar/admission-e2e test` passes (the new rule must hold against actual evaluation-runner src/ imports).
  </acceptance_criteria>
  <done>evaluation-runner classified as network in authority-boundary contract; agrees with manifest.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Three-way tier conformance — extend with AGENTS.md + authority-boundary parsers</name>
  <files>packages/admission-e2e/src/tier-conformance.contract.test.ts</files>
  <read_first>
    - packages/admission-e2e/src/tier-conformance.contract.test.ts (entire file — current manifest read at lines 187-201; package list logic; existing assertions at 31-38, 40-47, 91-115, 117-128, 130-141, 143-151, 153-161)
    - AGENTS.md lines 23-31 (tier table — exact format to parse)
    - packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts (post-Task 1 — PACKAGE_RULES + the rule-shape → tier mapping)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Boundary truth source (D-11 + D-12 + D-13)" lines 806-855 + Pitfall 6 lines 1019-1022
  </read_first>
  <behavior>
    - **Test A:** Parse AGENTS.md tier-table bullets between the `## Authority Tiers` heading and the next `##` heading. Each bullet matches `/^-\s+\*\*([^(*]+?)\b[^:]*:\*\*\s+(.+)$/`. The captured tier label MUST be in `EXPECTED_AGENTS_TIER_LABELS` ELSE the test fails LOUD with the unknown label.
    - **Test B:** For every package the manifest scan produces, look up its expected tier in the AGENTS.md parse. If the AGENTS.md mapping disagrees with the manifest tier, fail with the package name + both tiers.
    - **Test C:** For every package in `PACKAGE_RULES` (parsed from `authority-boundary.contract.test.ts`), derive a tier from the rule shape:
      - `PURE_PACKAGE_RULE` reference → `pure`
      - rule referencing `@protostar/repo` (i.e., the rule for repo itself) → `fs`
      - rule referencing `@protostar/paths` (carve-out) → `fs`
      - rule containing network/network-permitted markers (e.g., uses the dogpile-adapter / delivery-runtime / lmstudio-adapter / evaluation-runner shape) → `network`
      - special rule for `admission-e2e` (unrestricted) → `test-only`
      Then assert the derived tier == manifest tier for every package.
    - **Test D:** Sanity — `apps/factory-cli` is `orchestration` per manifest AND per AGENTS.md.
  </behavior>
  <action>
    Extend `packages/admission-e2e/src/tier-conformance.contract.test.ts` with three new top-level `describe` blocks (or `it` cases inside the existing top-level describe):

    1. **AGENTS.md parser + recognition guard:**
       ```typescript
       const REPO_ROOT = resolve(__dirname, "..", "..", "..");

       const AGENTS_TIER_TO_MANIFEST: Readonly<Record<string, string>> = Object.freeze({
         "orchestration": "orchestration",
         "filesystem":    "fs",
         "domain network": "network",
         "pure":          "pure",
         "test-only":     "test-only"
       });
       const EXPECTED_AGENTS_TIER_LABELS = Object.freeze(Object.keys(AGENTS_TIER_TO_MANIFEST));

       const TIER_LINE_PATTERN = /^-\s+\*\*([^(*]+?)\b[^:]*:\*\*\s+(.+)$/gm;
       const PKG_NAME_PATTERN = /(?:@protostar\/[\w\-]+|apps\/[\w\-]+|packages\/[\w\-]+)/g;

       async function parseAgentsMdTiers(): Promise<Map<string, string>> {
         const content = await readFile(resolve(REPO_ROOT, "AGENTS.md"), "utf8");
         // Slice between `## Authority Tiers` and the next `##` heading
         const start = content.indexOf("## Authority Tiers");
         assert.notEqual(start, -1, "AGENTS.md missing `## Authority Tiers` heading");
         const remainder = content.slice(start);
         const nextHeading = remainder.slice(2).search(/^## /m);
         const section = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading + 2);

         const tierMap = new Map<string, string>();  // pkg name → manifest-tier label
         for (const match of section.matchAll(TIER_LINE_PATTERN)) {
           const label = match[1]!.trim().toLowerCase();
           if (!EXPECTED_AGENTS_TIER_LABELS.includes(label)) {
             throw new Error(`AGENTS.md unrecognized tier label: "${label}". Update EXPECTED_AGENTS_TIER_LABELS or fix AGENTS.md.`);
           }
           const manifestTier = AGENTS_TIER_TO_MANIFEST[label]!;
           const rest = match[2]!;
           for (const pkg of rest.matchAll(PKG_NAME_PATTERN)) {
             // Normalize "packages/repo" → "@protostar/repo"; "apps/factory-cli" stays
             const name = pkg[0].startsWith("packages/")
               ? `@protostar/${pkg[0].slice("packages/".length)}`
               : pkg[0];
             tierMap.set(name, manifestTier);
           }
         }
         return tierMap;
       }
       ```

    2. **Three-way conformance assertion:** add a test that:
       - Loads all packages via existing `loadPackages` / `readPackage` helper.
       - Calls `parseAgentsMdTiers()`.
       - For every package: assert manifest tier matches AGENTS.md tier.
       - Build an `EXPECTED_TIERS_FROM_AGENTS` set; assert it equals `EXPECTED_AGENTS_TIER_LABELS` (Pitfall 6 — fail loud on drift).

    3. **Authority-boundary cross-check:** parse `PACKAGE_RULES` from `authority-boundary.contract.test.ts`. The simplest approach — read the test file as text, use a regex to extract rule keys (`/^\s*"?(@protostar\/[\w\-]+)"?\s*:/gm` inside the PACKAGE_RULES literal), and a small heuristic to derive the tier from the rule body (look for `PURE_PACKAGE_RULE` in the same line/region → pure; look for the `dogpile-adapter`-style network shape → network; etc.).
       - For pragmatism: HARDCODE the per-package expected tier in a test-internal map (derived from RESEARCH §"`authority-boundary.contract.test.ts` PACKAGE_RULES keys" lines 847-855), then assert that map matches the manifest tier for every package. This sidesteps brittle text parsing while still catching drift (when the contract test changes a rule, the test author updates the expected-tier map alongside).
       - Comment that hardcoded map: `// Updated when authority-boundary.contract.test.ts rules change; mirrors PACKAGE_RULES tier derivation.`

    Test scaffolding note: use existing `loadPackages` / `readPackage` from this file at lines 187-201; do NOT duplicate the manifest-walk logic.
  </action>
  <verify>
    <automated>grep -q 'parseAgentsMdTiers\|AGENTS_TIER_TO_MANIFEST\|AGENTS.md' packages/admission-e2e/src/tier-conformance.contract.test.ts &amp;&amp; grep -q 'EXPECTED_AGENTS_TIER_LABELS' packages/admission-e2e/src/tier-conformance.contract.test.ts &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - Test file reads AGENTS.md and parses `## Authority Tiers` section.
    - Unknown tier labels cause LOUD failure (Pitfall 6).
    - Three-way assertion: manifest == AGENTS.md == authority-boundary-derived tier per package.
    - `evaluation-runner` agrees in all three sources (network).
    - `mechanical-checks` agrees in all three sources (pure — post 12-03).
    - `apps/factory-cli` agrees as orchestration in manifest and AGENTS.md.
    - `pnpm --filter @protostar/admission-e2e test` exits 0.
    - Full `pnpm run verify` exits 0.
  </acceptance_criteria>
  <done>tier-conformance test cross-asserts three sources; drift becomes a node:test failure; evaluation-runner reconciled.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| code authoring → tier classification | Three sources can drift independently; one canonical (manifest) + two assertions makes drift detectable |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-04 | Repudiation / Tampering | `tier-conformance.contract.test.ts` extension + AGENTS.md parser + authority-boundary rule reclassification | mitigate | manifest is canonical (D-11); AGENTS.md + authority-boundary derive/assert; unknown labels fail loud (Pitfall 6); evaluation-runner drift resolved (D-13) |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` passes — tier-conformance + authority-boundary contract tests both green.
- Full `pnpm run verify` green.
</verification>

<success_criteria>
- AUTH-11 satisfied: package.json protostar.tier remains canonical (already enforced; no changes to manifests in this plan).
- AUTH-12 satisfied: three-way assertion holds per package.
- AUTH-13 satisfied: evaluation-runner is `network` in all three sources.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-07-SUMMARY.md`
</output>
