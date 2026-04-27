# Phase 1 — Intent + Planning Admission · Context

**Generated:** 2026-04-26
**Source:** `01-QUESTIONS.json` (13/13 answered, --power mode)
**Goal:** Seal the front door — every path that reaches execution went through the ambiguity gate (≤0.2) and planning admission. No fixture or test bypass exists.

---

<decisions>

## Verify gate (sealing `pnpm run verify`)

### Q-01 — Tiered verify (fast vs full)
**Decision:** Two scripts. `verify` runs typecheck + intent + factory-cli (fast feedback for local dev). `verify:full` runs `pnpm -r test` (every package, used by CI and pre-merge).
**Rationale:** Local iteration stays sub-30s; CI runs the full 11-package gate including the 4684-line `policy/src/admission-control.test.ts` that CONCERNS.md flagged as silently uncovered today. Adding a new package auto-joins `verify:full` via `-r`.
**Status:** Decided.

### Q-02 — Both meta-test parity + e2e admission test
**Decision:** Two layers. (1) A meta-test asserts every file under `examples/intents/**` and `examples/planning-results/**` is referenced by the manifest. (2) An e2e admission test loops the manifest and asserts each fixture produces its expected verdict end-to-end through `parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff` (or the intent-side equivalent).
**Rationale:** Belt-and-suspenders against both "fixture added but never tested" and "fixture tested but not exercised end-to-end."
**Status:** Decided.

## Bypass prevention (no test/CLI escape hatch)

### Q-03 — Brand + private mint + public-surface contract test for `ConfirmedIntent`
**Decision:** Combine (a) and a contract test. Make `ConfirmedIntent` a branded type whose constructor is module-private; only `promoteIntentDraft` produces the brand. Extend `public-split-exports.contract.test.ts` to assert the only mint path exposed publicly is `promoteIntentDraft` (no constructor, no factory shortcut).
**Rationale:** Compile-time guarantee plus a contract that locks the public surface — defeats both accidental and "I'll just export it for tests" regressions.
**Status:** Decided.

### Q-04 — Branded `AdmittedPlan`, execution accepts only the brand
**Decision:** Brand `AdmittedPlan`. `assertAdmittedPlanHandoff` is the sole producer. Execution package's public surface accepts only `AdmittedPlan` (the brand); raw `CandidatePlan` cannot satisfy the type.
**Rationale:** Mirrors Q-03 strategy for symmetry. Compile-time guard. No runtime crypto in Phase 1 (signing is Phase 2 GOV-06 territory — see Q-13).
**Status:** Decided.

## Fuzzed-bad fixtures (refusal coverage)

### Q-05 — Deterministic mutator + curated edge cases
**Decision:** Hybrid. (1) A snapshot-mutation generator programmatically corrupts the good `scaffold` fixture (drop required field, duplicate task id, inject unknown AC, mutate ambiguity score, etc.) and asserts each mutant rejects with the correct rule. (2) Hand-curated bad fixtures cover semantic edge cases (cyclic graph, missing AC coverage, capability envelope expansion) where mutation is too coarse.
**Rationale:** Mutator gives systematic schema coverage with no new dependency; curated fixtures express intent for cases that are about meaning, not syntax.
**Status:** Decided.

### Q-06 — Move bad fixtures to `bad/` subdirectories
**Decision:** Reorganize. `examples/intents/bad/*.json` and `examples/planning-results/bad/*.json`. Discovery-by-directory: every file under `bad/` MUST reject; every file outside `bad/` MUST pass. The "manifest" becomes the directory layout itself.
**Rationale:** Structural separation is self-documenting and harder to drift than a manifest. Pairs with Q-02's e2e test, which can derive expected verdict from path.
**Note for planner:** Existing `bad-*` prefixed fixtures (`bad-missing-capability.json`, `bad-cyclic-plan-graph.json`, etc.) need to be moved into `bad/` and the prefix stripped; tests and any path references must be updated.
**Status:** Decided.

## No-admission artifacts (refusal evidence)

### Q-07 — `schemaVersion: "1.0.0"` + JSON Schemas under `packages/*/schema/`
**Decision:** Every refusal artifact (`clarification-report.json`, `no-plan-admitted.json`, plus future Phase 2 governance artifacts) embeds a `schemaVersion: "1.0.0"` field. JSON Schema files ship under `packages/intent/schema/` and `packages/planning/schema/` and are validated against in tests.
**Rationale:** Pays the schema-versioning cost upfront so Phase 2 (which explicitly requires schema-versioned admission decisions) doesn't need to migrate existing artifacts. Aligns with Phase 9 operator surface (`inspect`).
**Status:** Decided.

### Q-08 — Same `.protostar/runs/{id}/` dir + top-level `.protostar/refusals.jsonl` index
**Decision:** Refusals share the run-directory layout — `.protostar/runs/{id}/clarification-report.json` or `.protostar/runs/{id}/no-plan-admitted.json` plus a `terminal-status.json` marker. Append a one-line entry to `.protostar/refusals.jsonl` for fast scans.
**Rationale:** Operator surface (Phase 9) lists all runs uniformly regardless of outcome; full evidence stays inside the run dir; the `.jsonl` index gives `status` / `inspect` cheap cross-run queries without scanning hundreds of dirs.
**Note:** Reuses the existing `.protostar/runs/` location flagged in CONCERNS.md (208 dirs accumulated 2026-04-26) — Phase 9 owns retention/prune.
**Status:** Decided.

## Acceptance criteria normalization E2E

### Q-09 — New `packages/admission-e2e/` test-only package
**Decision:** Create a new test-only workspace package, `packages/admission-e2e/`. It depends on `@protostar/intent`, `@protostar/policy`, `@protostar/planning`, and `@protostar/execution` (and later `@protostar/review`, `@protostar/repo`). It owns cross-cutting contract tests that no single package can host.
**Rationale:** Future phases (Phase 2 capability handoff, Phase 3 repo-scope handoff, Phase 5 review handoff) will accumulate similar cross-package contracts. Establishing this home now prevents `factory-cli` tests from becoming the integration catch-all.
**Status:** Decided.

### Q-10 — Deep-equal on the normalized `AcceptanceCriterion[]`
**Decision:** The cross-package test asserts deep equality on the entire `AcceptanceCriterion[]` array after normalization. Any divergence (ordering, casing, extra field, missing field) fails.
**Rationale:** Strongest end-to-end guarantee. Phase 2 will layer a content-hash on top for signing (GOV-06); Phase 1 establishes that the underlying data is byte-identical so the hash work in Phase 2 is uncomplicated.
**Status:** Decided.

## Fixture coverage and CI surface

### Q-11 — Single parameterized admission test driven by `bad/` directory layout
**Decision:** One parameterized test in `packages/admission-e2e` (or `factory-cli` if simpler — planner to choose) loops `examples/intents/**/*.json` and `examples/planning-results/**/*.json`. Files under `bad/` must reject; files elsewhere must pass. Greenfield/brownfield distinction is handled by per-fixture metadata in the file itself, not by separate test files.
**Rationale:** Single source of truth, mirrors Q-06's directory-as-manifest decision. Existing `greenfield-ambiguity-fixtures.test.ts` / `brownfield-ambiguity-fixtures.test.ts` keep their narrower role (testing ambiguity scoring specifically) and the new e2e test adds the integration sweep.
**Status:** Decided.

### Q-12 — Add `.github/workflows/verify.yml` running `pnpm install && pnpm run verify:full`
**Decision:** Phase 1 ships a minimal GitHub Actions workflow at `.github/workflows/verify.yml` that runs `pnpm install --frozen-lockfile && pnpm run verify:full` on PR and push to `main`. Required check on `main`. (Note: the `@dogpile/sdk` link risk from CONCERNS.md will affect this — see canonical_refs.)
**Rationale:** "in CI" is in the literal Phase 1 success criterion. Defer Phase 10 hardening (matrix builds, security scanning, dogfood) but the gate must exist now.
**Status:** Decided.

## Phase 1 scope boundary

### Q-13 — `ConfirmedIntent` reserves `signature: null`; signing logic is Phase 2
**Decision:** Phase 1 adds a `signature: SignatureEnvelope | null` field on `ConfirmedIntent`, always emitted as `null` in Phase 1. Phase 2 (GOV-06) fills it. Downstream consumers in Phase 1 can already pattern-match on the field's presence.
**Rationale:** Schema-stable from the start so Phase 2 doesn't introduce a breaking shape change. Zero crypto in Phase 1.
**Status:** Decided.

</decisions>

<deferred_ideas>
- Property-based fuzzing with `fast-check` (Q-05 option a) — not chosen for Phase 1, but a candidate for Phase 8 (Evaluation + Evolution) if mutator coverage proves insufficient.
- Lint rule `no-restricted-imports` for `ConfirmedIntent` constructor (Q-03 option b) — covered by branded type + contract test; could be added later if a regression slips.
- Architecture grep test for forbidden constructions (Q-03 option c, Q-04 option c) — superseded by branded types.
- Runtime signature on `AdmittedPlan` handoff (Q-04 option b) — explicitly deferred to Phase 2 GOV-06.
- Phase 1 emits a content-hash today (Q-13 option c) — deferred; field is reserved as `null` instead.
</deferred_ideas>

<specifics>
- **Tiered verify naming:** `verify` (fast) and `verify:full` (CI). Planner: confirm exact script names while wiring `package.json:11`.
- **Bad-fixture migration:** Existing `bad-*.json` files in `examples/intents/` and `examples/planning-results/` must be moved into `bad/` subdirs and the `bad-` prefix stripped. Tests and any path-string references need updating in lockstep.
- **`@dogpile/sdk` link risk for CI:** CONCERNS.md flags `packages/dogpile-adapter/package.json:21` declares `"@dogpile/sdk": "link:../../../dogpile"` — a sibling-repo file link. CI will fail `pnpm install` without that sibling. Planner: must be addressed before Q-12's workflow can be green. Options include vendoring a `packages/dogpile-types` shim or pinning a published version. This may pull scope into Phase 1 or block its CI criterion until addressed.
- **`packages/admission-e2e` shape:** Test-only workspace package with a `test` script following the `pnpm run build && node --test dist/*.test.js` pattern used everywhere else. Add to root `tsconfig.json` references.
- **`schemaVersion: "1.0.0"` covers:** `clarification-report.json`, `no-plan-admitted.json`, plus a forward-compatible field on `ConfirmedIntent`. JSON Schema files live under `packages/intent/schema/` and `packages/planning/schema/`.
- **`.protostar/refusals.jsonl` schema:** one JSON object per line, fields: `runId`, `timestamp`, `stage` (`intent` | `planning`), `reason`, `artifactPath`. Phase 9 may extend.
</specifics>

<code_context>
**Already built — wire, don't rewrite:**
- `packages/intent/src/ambiguity-scoring.ts` — ambiguity gate logic exists; Phase 1 makes its enforcement uncircumventable.
- `packages/intent/src/clarification-report/` + `clarification-report-schema.test.ts` — refusal artifact schema test exists; extend with `schemaVersion`.
- `packages/intent/src/confirmed-intent/` + `confirmed-intent-readonly.contract.ts`, `confirmed-intent-immutability.test.ts` — turn the readonly contract into a brand + private constructor.
- `packages/intent/src/acceptance-criteria-normalization.contract.ts` + `acceptance-criteria-normalization.test.ts` — single-package contract today; the new `admission-e2e` package extends to cross-package deep-equal.
- `packages/intent/src/public-split-exports.contract.test.ts` — extend to assert `promoteIntentDraft` is the only public mint for `ConfirmedIntent`.
- `packages/policy/src/admission.ts`, `admission-control.test.ts` (4684 lines), `admission-paths.ts` — admission core; verify gate must run this.
- `packages/planning/src/candidate-admitted-plan-boundary.contract.ts` + `admitted-plan-handoff.test.ts` + `parsePlanningPileResult` / `admitCandidatePlans` / `assertAdmittedPlanHandoff` — plan admission flow exists; brand `AdmittedPlan`.
- `packages/intent/src/greenfield-ambiguity-fixtures.test.ts`, `brownfield-ambiguity-fixtures.test.ts` — keep narrow role (ambiguity scoring); new e2e covers the integration sweep.
- `examples/intents/*.json`, `examples/planning-results/*.json` — fixture set to be reorganized under `bad/` subdirs.
- Root `package.json` `verify` script — currently filters to two packages (CONCERNS.md). Replace with tiered.
- `node:test` is the universal runner; no new test framework needed.
- `apps/factory-cli/src/main.ts:218-228` (`readPlanningFixtureInput`) — Phase 1's planning admission still operates on fixture inputs (planning piles are out of scope until Phase 6). The fixture path stays.
</code_context>

<canonical_refs>
- `.planning/ROADMAP.md` — Phase 1 entry, Requirements list (INTENT-01..03, PLAN-A-01..03), success criteria.
- `.planning/REQUIREMENTS.md` — full requirement text and ownership mapping.
- `.planning/STATE.md` — current phase status; Phase 1 is the start of v1.
- `.planning/PROJECT.md` — vision, ordering principle, dark-factory locks.
- `.planning/codebase/CONCERNS.md` — `verify` gap, `@dogpile/sdk` link risk, `packages/repo` empty (deferred to Phase 3), stubbed evaluation (deferred to Phase 8).
- `.planning/codebase/STACK.md` — runtime + test-runner inventory.
- `.planning/codebase/STRUCTURE.md` — package layout used by every decision above.
- `.planning/codebase/CONVENTIONS.md` — code conventions for new packages (`packages/admission-e2e`).
- `.planning/codebase/TESTING.md` — `node:test` pattern (`pnpm run build && node --test dist/*.test.js`).
- Memory: `project_v1_phase_ordering.md` (2026-04-26) — locks 10-phase ordering and Phase 1's "front door" framing.
- Memory: `project_v0_0_1_locks.md` (2026-04-24) — pnpm + Turbo monorepo, LM Studio model split, Octokit PR plumbing (Phase 7).
</canonical_refs>

---

## Next steps

- Run `/gsd-plan-phase 1` to produce `01-PLAN.md` from these decisions.
- Planner must address the `@dogpile/sdk` link risk before the GH Actions workflow (Q-12) can be green — flag it as a blocking task or defer the workflow until the link is resolved.
- Bad-fixture relocation (Q-06) is a discrete prep task that should land before the new e2e admission test (Q-02, Q-11).
