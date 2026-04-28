---
phase: 07-delivery
plan: 03
type: execute
wave: 0
depends_on: []
files_modified:
  - AGENTS.md
  - .env.example
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - packages/lmstudio-adapter/src/factory-config.ts
  - packages/intent/src/compute-delivery-allowed-hosts.ts
  - packages/intent/src/compute-delivery-allowed-hosts.test.ts
  - packages/intent/src/index.ts
autonomous: true
requirements: [DELIVER-01, DELIVER-04]
must_haves:
  truths:
    - "AGENTS.md declares network-permitted/fs-forbidden tier and lists @protostar/delivery-runtime alongside @protostar/dogpile-adapter"
    - ".env.example documents PROTOSTAR_GITHUB_TOKEN with required scope guidance for both classic and fine-grained PATs"
    - "factory-config schema accepts delivery.requiredChecks: string[] (default [])"
    - "computeDeliveryAllowedHosts(envelope.delivery) is a pure helper exported from @protostar/intent and returns ['api.github.com', 'github.com'] minimum"
  artifacts:
    - path: AGENTS.md
      contains: "@protostar/delivery-runtime"
    - path: .env.example
      contains: "PROTOSTAR_GITHUB_TOKEN"
    - path: packages/lmstudio-adapter/src/factory-config.schema.json
      contains: '"requiredChecks"'
    - path: packages/intent/src/compute-delivery-allowed-hosts.ts
      provides: "Pure host-list computation"
      exports: ["computeDeliveryAllowedHosts"]
  key_links:
    - from: packages/intent/src/index.ts
      to: packages/intent/src/compute-delivery-allowed-hosts.ts
      via: "Barrel re-export"
      pattern: "computeDeliveryAllowedHosts"
---

<objective>
Land the four small wiring artifacts that every downstream plan depends on but that don't fit any single later plan: (1) the AGENTS.md authority-tier update, (2) the `.env.example` `PROTOSTAR_GITHUB_TOKEN` documentation, (3) the `factory-config.schema.json` `delivery.requiredChecks` extension (Q-15), and (4) the pure `computeDeliveryAllowedHosts` helper in `@protostar/intent` (Q-05). These can run in parallel with 07-01 and 07-02; they have zero dependencies.

Purpose: Wave-0 wiring that unblocks Wave 1 (brands need the config schema) and Wave 5 (factory-cli needs the helper).
Output: Documentation + schema extension + pure helper, all green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/07-delivery/07-CONTEXT.md
@.planning/phases/07-delivery/07-RESEARCH.md
@.planning/phases/07-delivery/07-PATTERNS.md
@AGENTS.md
@.env.example
@packages/lmstudio-adapter/src/factory-config.schema.json
@packages/intent/src/index.ts

<interfaces>
<!-- factory-config schema addition (Q-15) — extend the existing top-level schema. -->

In packages/lmstudio-adapter/src/factory-config.schema.json, add a new top-level optional `delivery` object alongside existing `adapters` / `piles`:
```json
"delivery": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "requiredChecks": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "default": []
    }
  }
}
```

<!-- computeDeliveryAllowedHosts signature (Q-05 + RESEARCH note re: github.com for git transport). -->

```typescript
// packages/intent/src/compute-delivery-allowed-hosts.ts
export interface DeliveryEnvelope {
  readonly target: { readonly owner: string; readonly repo: string; readonly baseBranch: string };
}

export function computeDeliveryAllowedHosts(
  delivery: DeliveryEnvelope | undefined,
  options?: { readonly attachmentsEnabled?: boolean }
): readonly string[];
```

<!-- AGENTS.md tier table (new section after Package Boundaries). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update AGENTS.md to declare the network-permitted / fs-forbidden tier</name>
  <read_first>
    - AGENTS.md (current "Package Boundaries" section + "@protostar/paths Carve-Out" carve-out for tier-table style)
    - .planning/phases/07-delivery/07-CONTEXT.md §"Authority list expansion" specific (`Specific Ideas` section)
  </read_first>
  <files>AGENTS.md</files>
  <action>
    1. After the existing "## Package Boundaries" section, add a new section "## Authority Tiers" (or append a Note inside the existing section if more appropriate) that names three tiers:
       - **fs-permitted, network-permitted (orchestration tier):** `apps/factory-cli`
       - **fs-permitted, network-forbidden (filesystem tier):** `packages/repo`, `@protostar/paths` (carve-out, scope-ceiled)
       - **network-permitted, fs-forbidden (domain network tier):** `@protostar/dogpile-adapter` (Phase 6), `@protostar/delivery-runtime` (Phase 7)
       - **pure (everything else):** all other packages — no fs, no network
    2. Document the rule: "fs is always factory-cli + repo; network may live in domain packages with explicit no-fs contract tests." Each network-permitted package MUST contain a static `no-fs.contract.test.ts` that scans its `src/` for `node:fs` / `node:fs/promises` / `node:path` / `path` imports and asserts zero matches.
    3. Add a sentence: "Phase 7 also requires `delivery-runtime` to ship a `no-merge.contract.test.ts` enforcing zero `pulls.merge` / `pullRequests.merge` / `enableAutoMerge` / `merge_method` / `pulls.updateBranch` / `gh pr merge` / `git merge --` references in source. This is the strongest invariant in the phase (DELIVER-07)."
    4. Do NOT remove or weaken the existing carve-out language for `@protostar/paths`; that section stays unchanged.
  </action>
  <verify>
    <automated>grep -c '@protostar/delivery-runtime' AGENTS.md | awk '{ if ($1 < 1) { print "FAIL: delivery-runtime not in AGENTS.md"; exit 1 } else print "ok" }'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '@protostar/delivery-runtime' AGENTS.md` ≥ 1
    - `grep -c 'no-merge.contract.test.ts' AGENTS.md` ≥ 1
    - `grep -c 'network-permitted' AGENTS.md` ≥ 1
    - `grep -c '@protostar/dogpile-adapter' AGENTS.md` ≥ 1 (still present in tier table)
  </acceptance_criteria>
  <done>AGENTS.md declares the 3-tier model and lists delivery-runtime in the network tier.</done>
</task>

<task type="auto">
  <name>Task 2: Document PROTOSTAR_GITHUB_TOKEN in .env.example with scope guidance</name>
  <read_first>
    - .env.example (current — the existing entries inform format conventions)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-04 (env var name) + .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 2" (token format regex including fine-grained PATs)
  </read_first>
  <files>.env.example</files>
  <action>
    1. Append (or replace any existing `GITHUB_PAT=` entry with) the following block:
       ```
       # GitHub PAT for Phase 7 delivery. Required at delivery boundary.
       # Required scopes (minimum):
       #   Classic PAT:         `public_repo` (public repos) OR `repo` (private repos)
       #   Fine-grained PAT:    Contents R/W, Pull requests R/W, Metadata R
       # Forbidden scopes (preflight refuses these): `admin:org`, `admin:repo_hook`, `admin:public_key`, `delete_repo`, `site_admin`
       # Token format (preflight fast-check):
       #   Classic:      ^gh[pousr]_[A-Za-z0-9]{36}$
       #   Fine-grained: ^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}$
       # Never logged, never persisted in run artifacts (Pitfall 4 secret-leak contract test enforces).
       PROTOSTAR_GITHUB_TOKEN=
       ```
    2. If the file currently has a `GITHUB_PAT=` line, remove it (it's superseded by `PROTOSTAR_GITHUB_TOKEN` per Q-04 namespacing).
    3. Do NOT add a real token. The trailing `=` (empty value) is the convention.
  </action>
  <verify>
    <automated>grep -c 'PROTOSTAR_GITHUB_TOKEN' .env.example | awk '{ if ($1 < 1) { print "FAIL"; exit 1 } else print "ok" }'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'PROTOSTAR_GITHUB_TOKEN' .env.example` ≥ 1
    - `grep -c 'github_pat_' .env.example` ≥ 1 (fine-grained format documented)
    - `grep -c 'admin:org' .env.example` ≥ 1 (forbidden scopes documented)
    - `grep -c '^GITHUB_PAT=' .env.example` = 0 (legacy var name removed if it was present)
    - No real-looking PAT pattern present: `grep -E 'PROTOSTAR_GITHUB_TOKEN=gh[pousr]_[A-Za-z0-9]{36}' .env.example` returns zero matches.
  </acceptance_criteria>
  <done>.env.example documents the PAT env var with both PAT formats and forbidden scopes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend factory-config schema with delivery.requiredChecks (Q-15)</name>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.schema.json (current schema; existing top-level `adapters` and `piles` blocks are the analogous sibling)
    - packages/lmstudio-adapter/src/factory-config.ts (TypeScript types + validation logic that reads the schema)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-15 — verbatim
  </read_first>
  <behavior>
    - Schema accepts an optional top-level `delivery: { requiredChecks: string[] }` object.
    - When `delivery` is omitted, default behavior matches `requiredChecks: []` (empty allowlist → CI verdict 'no-checks-configured').
    - When `delivery.requiredChecks` is present, every item is a non-empty string; `additionalProperties: false` rejects unknown sibling keys.
    - TypeScript type `FactoryConfig.delivery?.requiredChecks: readonly string[]` exposed.
    - Test 1: parse a config with `delivery: { requiredChecks: ["build", "test"] }` → succeeds, returns `requiredChecks` as readonly array.
    - Test 2: parse a config with `delivery: { requiredChecks: [""] }` → rejected (empty string fails minLength).
    - Test 3: parse a config with no `delivery` field → succeeds with `delivery` undefined.
    - Test 4: parse a config with `delivery: { unknownKey: 1 }` → rejected (additionalProperties: false).
  </behavior>
  <files>packages/lmstudio-adapter/src/factory-config.schema.json, packages/lmstudio-adapter/src/factory-config.ts</files>
  <action>
    1. **RED:** Add 4 test cases (per `<behavior>`) to the existing factory-config test file (e.g., `packages/lmstudio-adapter/src/factory-config.test.ts`) — should fail because the schema doesn't accept `delivery` yet.
    2. **GREEN:** In `factory-config.schema.json`, add the `delivery` block as a sibling of existing `adapters`/`piles` (alphabetical order; place after `adapters` but before `piles` if alphabetical, otherwise wherever fits the existing convention):
       ```json
       "delivery": {
         "type": "object",
         "additionalProperties": false,
         "properties": {
           "requiredChecks": {
             "type": "array",
             "items": { "type": "string", "minLength": 1 },
             "default": []
           }
         }
       }
       ```
    3. In `factory-config.ts`, extend the TypeScript type:
       ```typescript
       export interface FactoryConfig {
         // existing fields...
         readonly delivery?: { readonly requiredChecks: readonly string[] };
       }
       ```
       Update the parser to read `delivery.requiredChecks` (default empty array if `delivery` is undefined or `requiredChecks` is omitted).
    4. **REFACTOR:** Document in a comment on the `delivery` block: `// Phase 7 Q-15: operator-named CI check allowlist; empty/absent → 'no-checks-configured' verdict.`
    5. The existing top-level `additionalProperties: false` (if present) must be relaxed only enough to accept `delivery` — do NOT widen it to allow arbitrary extra keys.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/lmstudio-adapter test --run factory-config && grep -c '"requiredChecks"' packages/lmstudio-adapter/src/factory-config.schema.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"requiredChecks"' packages/lmstudio-adapter/src/factory-config.schema.json` ≥ 1
    - `grep -c '"delivery"' packages/lmstudio-adapter/src/factory-config.schema.json` ≥ 1
    - `pnpm --filter @protostar/lmstudio-adapter test` passes (4 new test cases green)
    - `grep -c 'delivery?: {' packages/lmstudio-adapter/src/factory-config.ts` ≥ 1 (or equivalent type extension)
  </acceptance_criteria>
  <done>Schema + types + parser accept delivery.requiredChecks with `[]` default; 4 new test cases green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Pure helper computeDeliveryAllowedHosts in @protostar/intent</name>
  <read_first>
    - packages/intent/src/index.ts (current barrel — the new helper is re-exported here)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-05 + .planning/phases/07-delivery/07-RESEARCH.md §"`computeDeliveryAllowedHosts` helper" (note re: 'github.com' for git transport)
    - .planning/phases/07-delivery/07-RESEARCH.md Open Question 2 (host list verification)
  </read_first>
  <behavior>
    - `computeDeliveryAllowedHosts(undefined)` → `[]` (no delivery configured)
    - `computeDeliveryAllowedHosts({ target: {...} })` → `['api.github.com', 'github.com']` (Octokit + git push transport — `github.com` MUST be present per RESEARCH note)
    - `computeDeliveryAllowedHosts({ target: {...} }, { attachmentsEnabled: true })` → `['api.github.com', 'github.com', 'uploads.github.com']`
    - Result is `Object.freeze(...)` (caller cannot mutate)
    - Function is pure: no I/O, no Date, no random; deterministic over input
  </behavior>
  <files>packages/intent/src/compute-delivery-allowed-hosts.ts, packages/intent/src/compute-delivery-allowed-hosts.test.ts, packages/intent/src/index.ts</files>
  <action>
    1. **RED:** Write `compute-delivery-allowed-hosts.test.ts` with 4 test cases covering the behaviors above, using `node:test` + `node:assert/strict` to match repo conventions. Run; tests fail (file doesn't exist).
    2. **GREEN:** Create `compute-delivery-allowed-hosts.ts`:
       ```typescript
       export interface DeliveryEnvelope {
         readonly target: {
           readonly owner: string;
           readonly repo: string;
           readonly baseBranch: string;
         };
       }

       export function computeDeliveryAllowedHosts(
         delivery: DeliveryEnvelope | undefined,
         options?: { readonly attachmentsEnabled?: boolean }
       ): readonly string[] {
         if (delivery === undefined) return Object.freeze([] as string[]);
         const hosts: string[] = ["api.github.com", "github.com"];
         if (options?.attachmentsEnabled === true) hosts.push("uploads.github.com");
         return Object.freeze(hosts);
       }
       ```
    3. Re-export from `packages/intent/src/index.ts`:
       ```typescript
       export { computeDeliveryAllowedHosts, type DeliveryEnvelope } from "./compute-delivery-allowed-hosts.js";
       ```
    4. **REFACTOR:** Add a comment header citing Q-05 and the rationale that `github.com` is REQUIRED for `isomorphic-git push` (transport URL is `https://github.com/{owner}/{repo}.git`, not `api.github.com`). This resolves RESEARCH Open Question 2.
    5. Run tests — all 4 green.
    6. The helper deliberately does NOT depend on `target.owner` / `target.repo` values to compute hosts — host list is operator-controlled by which features are enabled (attachments), not by the target identity.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test --run compute-delivery-allowed-hosts</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/intent/src/compute-delivery-allowed-hosts.ts` exists.
    - `grep -c 'export function computeDeliveryAllowedHosts' packages/intent/src/compute-delivery-allowed-hosts.ts` ≥ 1
    - `grep -c "github.com" packages/intent/src/compute-delivery-allowed-hosts.ts` ≥ 2 (api.github.com AND github.com both present in default array)
    - `grep -c 'computeDeliveryAllowedHosts' packages/intent/src/index.ts` ≥ 1 (re-exported from barrel)
    - All 4 test cases green: undefined → [], target → 2 hosts, target+attachments → 3 hosts, frozen result.
  </acceptance_criteria>
  <done>Pure helper exported from @protostar/intent; 4 test cases green; both api.github.com and github.com in default host list.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator → factory-config.json | Operator-supplied JSON is parsed by schema; bad shape rejected. |
| envelope → allowed-hosts | Envelope `delivery.target` does not influence host list (host list is feature-driven). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-03-01 | Tampering | factory-config.schema.json | mitigate | `additionalProperties: false` on `delivery` rejects unknown keys; `minLength: 1` rejects empty check names. |
| T-07-03-02 | Tampering | computeDeliveryAllowedHosts | mitigate | `Object.freeze` prevents callers from mutating returned array. |
| T-07-03-03 | Information Disclosure | .env.example | accept | Only the var name is documented; no real PAT included; trailing `=` (empty) per convention. |
</threat_model>

<verification>
- `pnpm --filter @protostar/intent test`
- `pnpm --filter @protostar/lmstudio-adapter test`
- AGENTS.md grep checks
- .env.example grep checks
</verification>

<success_criteria>
- AGENTS.md tier table includes delivery-runtime
- .env.example documents PROTOSTAR_GITHUB_TOKEN with both PAT formats + forbidden scopes
- factory-config schema accepts delivery.requiredChecks; tests cover defaults + rejections
- computeDeliveryAllowedHosts pure helper exported, returns api.github.com + github.com
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-03-SUMMARY.md` documenting the four artifacts and any deviations from CONTEXT (e.g., the explicit addition of `github.com` for git transport per RESEARCH note).
</output>
