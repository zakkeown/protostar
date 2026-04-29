---
phase: 12-authority-boundary-stabilization
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - package.json
  - .github/workflows/verify.yml
  - .planning/REQUIREMENTS.md
autonomous: true
requirements: [AUTH-01, AUTH-16]
must_haves:
  truths:
    - "Local `pnpm run verify` runs the same script CI runs"
    - "`verify:full` is gone from package.json"
    - "REQUIREMENTS.md has an AUTH-01..AUTH-16 block tied to Phase 12"
  artifacts:
    - path: "package.json"
      provides: "Single unified `verify` script (typecheck + subpath check + recursive test + knip)"
      contains: "pnpm -r test"
    - path: ".github/workflows/verify.yml"
      provides: "CI invokes `pnpm run verify` (not `verify:full`)"
      contains: "pnpm run verify"
    - path: ".planning/REQUIREMENTS.md"
      provides: "AUTH-NN block + traceability rows"
      contains: "AUTH-01"
  key_links:
    - from: ".github/workflows/verify.yml:31"
      to: "package.json:verify"
      via: "pnpm run verify"
      pattern: "pnpm run verify"
---

<objective>
Collapse `verify` and `verify:full` into a single `verify` script (per D-01). Local devs run exactly what CI runs. Add the AUTH-01..AUTH-16 requirement block to REQUIREMENTS.md so every Phase 12 plan can reference real IDs.

Purpose: Mitigates T-12-05 (verify gate divergence). After this lands, every later plan in Phase 12 has a single CI gate to pin against.
Output: Modified `package.json`, modified `.github/workflows/verify.yml`, expanded `.planning/REQUIREMENTS.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md
@.planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Unify verify script</name>
  <files>package.json, .github/workflows/verify.yml</files>
  <read_first>
    - package.json (current `verify` and `verify:full` at lines 11-12)
    - .github/workflows/verify.yml (current `verify:full` invocation at lines 11, 31)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Verify Script Collapse (D-01) — exact diff" (lines 382-420)
    - .planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md §D-01
  </read_first>
  <action>
    In `package.json`:
    1. Replace line 11's `verify` value with EXACTLY: `"pnpm run typecheck && node --experimental-strip-types tools/check-subpath-exports.ts && pnpm -r test && pnpm knip --no-config-hints"`.
    2. Delete line 12 (the `"verify:full": "pnpm run typecheck && pnpm -r test"` entry) entirely. No replacement, no alias, no skip-list pattern (D-01 forbids tiered-verify).

    In `.github/workflows/verify.yml`:
    1. Line 11: replace `name: pnpm run verify:full` with `name: pnpm run verify`.
    2. Line 31: replace `- name: Run verify:full` with `- name: Run verify`.
    3. Line 32 (the `run:` line): replace `run: pnpm run verify:full` with `run: pnpm run verify`.

    Do NOT add any `--filter` flag, skip-list, or tiered alternative. Per D-01 (CONTEXT line 30): "Drop the tiered-verify pattern entirely; remove the per-package skip lists."

    **Do NOT run `pnpm run verify` as part of this task.** The unified script invokes `pnpm -r test`, which will trip the mechanical-checks no-net contract until 12-03 lands the `diff-name-only` relocation (RESEARCH §"Mechanical-checks no-net violation" line 429: *"After D-01 unifies verify, this WILL fail unless D-02 lands"*). The full unified verify is gated by the **Wave 0 end-of-wave check** described in Task 3 below — it runs after 12-02 and 12-03 also land.
  </action>
  <verify>
    <automated>grep -c '"verify:full"' package.json | grep -q '^0$' &amp;&amp; grep -q '"verify": "pnpm run typecheck &amp;&amp; node --experimental-strip-types tools/check-subpath-exports.ts &amp;&amp; pnpm -r test &amp;&amp; pnpm knip --no-config-hints"' package.json &amp;&amp; ! grep -q 'verify:full' .github/workflows/verify.yml &amp;&amp; pnpm run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"verify:full"' package.json` returns `0`.
    - `grep -F '"verify": "pnpm run typecheck && node --experimental-strip-types tools/check-subpath-exports.ts && pnpm -r test && pnpm knip --no-config-hints"' package.json` exits 0.
    - `grep -c 'verify:full' .github/workflows/verify.yml` returns `0`.
    - `pnpm run typecheck` exits 0 (sanity that `tsc -b` still works after no script changes to typecheck).
    - The unified `pnpm run verify` is intentionally NOT run yet — gated by Wave 0 end-of-wave check (Task 3).
  </acceptance_criteria>
  <done>Script text unified; CI workflow updated; full unified verify deferred to Wave 0 end-of-wave gate.</done>
</task>

<task type="auto">
  <name>Task 2: Add AUTH-01..AUTH-16 block to REQUIREMENTS.md</name>
  <files>.planning/REQUIREMENTS.md</files>
  <read_first>
    - .planning/REQUIREMENTS.md (existing structure — Phase 10.1 BOUNDARY block at lines 134-148; Traceability table at lines 191-277)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Phase Requirements" (the AUTH-NN table at lines 76-95)
    - .planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md §"Implementation Decisions" (D-01..D-16)
  </read_first>
  <action>
    Append a new section to `.planning/REQUIREMENTS.md` AFTER the existing Phase 10.1 BOUNDARY block (after line 148), BEFORE the `## Deferred (post-v1)` heading:

    ```markdown
    ### Phase 12 — Authority Boundary Stabilization (inserted)

    Re-seal the authority boundary after the v1 dogfood pass. Verify-gate parity, mechanical command authority, env scrubbing, applyChangeSet path/op/diff invariant, three-way tier truth source.

    - [ ] **AUTH-01**: Unified `verify` script — local and CI run the same command (D-01)
    - [ ] **AUTH-02**: `@protostar/mechanical-checks` no-net contract holds in production — `diff-name-only` relocates to `@protostar/repo`; mechanical-checks consumes injected diff names (D-02)
    - [ ] **AUTH-03**: Mechanical commands run through `@protostar/repo`'s allowlist + per-command schema; raw `spawn` removed from `apps/factory-cli/src/main.ts` (D-03)
    - [ ] **AUTH-04**: `confirmedIntent` schema 1.5.0 → 1.6.0 with `capabilityEnvelope.mechanical.allowed[]` (closed enum); full fixture cascade re-signed (D-04)
    - [ ] **AUTH-05**: Mechanical command cwd is the cloned target-repo workspaceRoot (status-quo, contract-pinned) (D-05)
    - [ ] **AUTH-06**: `subprocess-runner.ts` defaults child env to POSIX baseline (`PATH`, `HOME`, `LANG`, `USER`) + per-call `inheritEnv` allowlist; allowlist logged in evidence (D-06)
    - [ ] **AUTH-07**: `PROTOSTAR_GITHUB_TOKEN` cannot cross the subprocess boundary; pinned by static contract test against `inheritEnv: [...]` literals (D-07)
    - [ ] **AUTH-08**: Token-shape redaction filter on persisted/evidence reads (lifted shared `TOKEN_PATTERNS` constant in `@protostar/delivery/redact.ts`) (D-08)
    - [ ] **AUTH-09**: `PatchRequest` becomes a brand whose `mintPatchRequest` constructor refuses path/op/diff disagreement; `applyChangeSet` re-asserts at entry (D-09)
    - [ ] **AUTH-10**: Equality is exact-string after canonicalization through one shared `canonicalizeRelativePath` helper (D-10)
    - [ ] **AUTH-11**: `package.json` `protostar.tier` is canonical; AGENTS.md table and `authority-boundary.contract.test.ts` derive from / assert against it (D-11)
    - [ ] **AUTH-12**: `tier-conformance.contract.test.ts` cross-asserts manifest tier == AGENTS.md tier == authority-boundary contract entry, per package (D-12)
    - [ ] **AUTH-13**: `evaluation-runner` tier reconciled — manifest stays `network`; `authority-boundary.contract.test.ts:77` flips from `PURE_PACKAGE_RULE` to a network-shaped rule (D-13)
    - [ ] **AUTH-14**: `apps/factory-cli/src/wiring/{command-execution,delivery}.ts` extracted from `main.ts`; `wiring/review-loop.ts` `configuredMechanicalCommands` rewritten (D-14)
    - [ ] **AUTH-15**: Done-criteria — all new contract tests green; `verify` green; Phase 10 dogfood loop re-runs end-to-end on `protostar-toy-ttt`; secret-leak attack test passes (D-15)
    - [ ] **AUTH-16**: Phase 12 runs after Phase 11 (no test artifact — pre-phase orchestrator check) (D-16)
    ```

    Then in the Traceability table (search for the row `| BOUNDARY-12 | Phase 10.1 | Complete |`), append AFTER it:

    ```markdown
    | AUTH-01 | Phase 12 | Pending |
    | AUTH-02 | Phase 12 | Pending |
    | AUTH-03 | Phase 12 | Pending |
    | AUTH-04 | Phase 12 | Pending |
    | AUTH-05 | Phase 12 | Pending |
    | AUTH-06 | Phase 12 | Pending |
    | AUTH-07 | Phase 12 | Pending |
    | AUTH-08 | Phase 12 | Pending |
    | AUTH-09 | Phase 12 | Pending |
    | AUTH-10 | Phase 12 | Pending |
    | AUTH-11 | Phase 12 | Pending |
    | AUTH-12 | Phase 12 | Pending |
    | AUTH-13 | Phase 12 | Pending |
    | AUTH-14 | Phase 12 | Pending |
    | AUTH-15 | Phase 12 | Pending |
    | AUTH-16 | Phase 12 | Pending (no test artifact) |
    ```

    Update the Coverage block (currently lines 278-281): change `v1 requirements: 65 total + 12 Phase 10.1` to `v1 requirements: 65 total + 12 Phase 10.1 + 16 Phase 12`. Update `Mapped to phases: 77` to `Mapped to phases: 93`.
  </action>
  <verify>
    <automated>grep -c '^- \[ \] \*\*AUTH-' .planning/REQUIREMENTS.md | grep -q '^16$' &amp;&amp; grep -c '| AUTH-[0-9]\+ | Phase 12 |' .planning/REQUIREMENTS.md | grep -q '^16$' &amp;&amp; grep -q 'Mapped to phases: 93' .planning/REQUIREMENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - 16 AUTH-NN bullet entries present in the new Phase 12 block.
    - 16 traceability rows of the form `| AUTH-XX | Phase 12 | Pending |` present.
    - Coverage block updated to `Mapped to phases: 93`.
  </acceptance_criteria>
  <done>REQUIREMENTS.md has the AUTH block; every Phase 12 plan can now reference AUTH-NN IDs.</done>
</task>

<task type="auto">
  <name>Task 3: Wave 0 end-of-wave verify gate (5x flake check — Pitfall 7)</name>
  <files>(no file modifications — gate task)</files>
  <read_first>
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Pitfall 7: Full unified verify exposes flake from Phase 6 Plan 06-09" (lines 1023-1027)
    - .planning/STATE.md §"Pending Issues" (Plan 06-09 flake mention if present)
  </read_first>
  <action>
    **This task runs ONLY AFTER 12-02 (schema cascade) and 12-03 (diff-name-only relocate) have both landed.** Both are Wave 0 plans. The unified `pnpm run verify` is now safe to run end-to-end.

    Run `pnpm run verify` 5 times consecutively from a clean repo state:
    ```bash
    for i in 1 2 3 4 5; do
      echo "=== verify run $i/5 ==="
      pnpm run verify || exit 1
    done
    ```

    All 5 runs MUST exit 0. If any single run fails:
    - If the failure is the historical `apps/factory-cli/src/run-real-execution.test.ts` flake (Plan 06-09 — STATE.md "Pending"), STOP and surface to operator. Do NOT work around. Fold Plan 06-09 diagnosis into the phase if needed (see Pitfall 7 mitigation).
    - If the failure is a new regression introduced by 12-01/12-02/12-03, fix the underlying cause; do not re-run blindly.

    On success, write a brief note to `.planning/phases/12-authority-boundary-stabilization/12-01-WAVE0-VERIFY-EVIDENCE.md` recording:
    - Date.
    - Commit SHA.
    - 5/5 green confirmation.
    - Wall-clock duration of each run.
  </action>
  <verify>
    <automated>for i in 1 2 3 4 5; do pnpm run verify || exit 1; done</automated>
  </verify>
  <acceptance_criteria>
    - 5 consecutive `pnpm run verify` runs exit 0.
    - `.planning/phases/12-authority-boundary-stabilization/12-01-WAVE0-VERIFY-EVIDENCE.md` exists with 5/5 confirmation.
  </acceptance_criteria>
  <done>Wave 0 verify gate confirmed stable (no Plan 06-09 flake); foundation for Wave 1+.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local-dev → CI | Divergence between scripts hides regressions until merge |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-05 | Repudiation | `package.json` verify script + `.github/workflows/verify.yml` | mitigate | Single unified `verify` script — drop `verify:full`; CI invokes the same command local devs run |
</threat_model>

<verification>
- `pnpm run verify` is green locally (5 reruns to surface any Plan 06-09 flake).
- CI's verify.yml line 32 contains `pnpm run verify` (not `verify:full`).
- REQUIREMENTS.md has the AUTH block.
</verification>

<success_criteria>
- T-12-05 mitigated: zero `verify:full` references in repo (excluding historical SUMMARYs).
- AUTH-01 satisfied: unified script.
- AUTH-16 acknowledged: row present with `(no test artifact)` annotation.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-01-SUMMARY.md`
</output>
