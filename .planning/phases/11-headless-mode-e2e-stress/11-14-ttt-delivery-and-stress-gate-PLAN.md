---
phase: 11-headless-mode-e2e-stress
plan: 14
type: execute
wave: 7
depends_on:
  - 11-02
  - 11-03
  - 11-04
  - 11-09
  - 11-10
  - 11-11
  - 11-12
  - 11-13
  - 11-15
files_modified:
  - apps/factory-cli/src/stress/phase-11-gate.ts
  - apps/factory-cli/src/stress/phase-11-gate.test.ts
  - apps/factory-cli/src/ttt-delivery-gate.ts
  - apps/factory-cli/src/ttt-delivery-gate.test.ts
  - .planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md
  - .planning/phases/11-headless-mode-e2e-stress/11-VERIFICATION.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
autonomous: false
requirements:
  - STRESS-04
  - STRESS-10
  - STRESS-12
  - STRESS-13
  - STRESS-14
must_haves:
  truths:
    - "Phase 11 closes only when `(ttt-delivered AND stress-clean)` is true."
    - "TTT delivery evidence includes PR URL, CI green, Playwright E2E, property test, and Tauri debug build evidence."
    - "Stress-clean means sustained-load, concurrency, and fault-injection reports are all terminal and no wedge fired."
    - "Fault-injection clean evidence covers network-drop, llm-timeout, disk-full, and abort-signal."
    - "Final TTT delivery consumes a materialized draft and signed confirmed-intent generated from the TTT seed before factory run."
    - "TTT delivery obeys Q-03 caps: 50 attempts or 14 days by default, resolved CLI > config > defaults, and writes `phase-11-cap-breach.json` on breach."
    - "The final gate never modifies toy repo immutable verification files and never merges PRs."
  artifacts:
    - path: "apps/factory-cli/src/stress/phase-11-gate.ts"
      provides: "stress-clean Boolean evaluator"
      contains: "stress-clean"
    - path: "apps/factory-cli/src/ttt-delivery-gate.ts"
      provides: "TTT delivery evidence evaluator"
      contains: "ttt-delivered"
    - path: ".planning/phases/11-headless-mode-e2e-stress/11-VERIFICATION.md"
      provides: "final Phase 11 evidence checklist"
      contains: "ttt-delivered AND stress-clean"
    - path: "apps/factory-cli/src/stress/phase-11-gate.ts"
      provides: "TTT cap breach gate integration"
      contains: "ttt-delivery"
  key_links:
    - from: "apps/factory-cli/src/ttt-delivery-gate.ts"
      to: "apps/factory-cli/src/toy-verification-preflight.ts"
      via: "required immutable verification preflight"
      pattern: "toy-verification-missing"
    - from: "apps/factory-cli/src/stress/phase-11-gate.ts"
      to: "packages/artifacts/src/stress-report.schema.ts"
      via: "parse stress reports for all shapes"
      pattern: "parseStressReport"
    - from: "apps/factory-cli/src/commands/__stress-step.ts"
      to: "apps/factory-cli/src/ttt-delivery-gate.ts"
      via: "materialized/signed TTT run inputs recorded in verification evidence"
      pattern: "confirmed-intent.json"
    - from: "apps/factory-cli/src/stress/phase-11-gate.ts"
      to: "apps/factory-cli/src/stress/stress-caps.ts"
      via: "TTT delivery cap resolution and breach evidence"
      pattern: "resolveStressCaps"
---

<objective>
Add the final TTT delivery and stress-clean phase gate.

Purpose: Phase 11 is not complete unless a real TTT PR is green and all three stress shapes produce clean, durable evidence.
Output: gate evaluators, tests, live TTT/stress evidence, verification artifact, and STATE/ROADMAP updates only after evidence is present.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md
@packages/fixtures/src/seeds/feature-add/ttt-game.json
@packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts
@apps/factory-cli/src/toy-verification-preflight.ts
@.planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md
@packages/artifacts/src/stress-report.schema.ts
@scripts/stress.sh
@apps/factory-cli/src/scripts/stress.ts
@apps/factory-cli/src/stress/stress-caps.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin final gate Boolean logic</name>
  <read_first>
    - packages/artifacts/src/stress-report.schema.ts
    - apps/factory-cli/src/toy-verification-preflight.ts
    - packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
  </read_first>
  <files>apps/factory-cli/src/stress/phase-11-gate.test.ts, apps/factory-cli/src/ttt-delivery-gate.test.ts</files>
  <action>
    Add tests for `evaluateStressClean(reports, faultObservationEvents)` requiring exactly one terminal report for each shape: `sustained-load`, `concurrency`, and `fault-injection`. Reports with `wedgeEvent`, missing `finishedAt`, cap breach, or nonterminal per-run outcomes make `stressClean: false`.
    Add locked fault coverage tests requiring observed fault evidence for all four scenarios: `network-drop`, `llm-timeout`, `disk-full`, and `abort-signal`. Labels in `perRun[].faultInjected` are not sufficient. The evaluator must require `fault-observed` event payloads or equivalent parsed evidence with `{ scenario, observed: true, mechanism }`.
    Require the mechanism mapping exactly: `network-drop -> adapter-network-refusal`, `llm-timeout -> llm-abort-timeout`, `disk-full -> disk-write-enospc`, and `abort-signal -> external-abort-signal`. Missing evidence must block with `missing-fault-observation:<scenario>`; wrong mechanism must block with `wrong-fault-mechanism:<scenario>`.
    Add tests for `evaluateTttDelivered(evidence)` requiring `prUrl`, `ciVerdict: "pass"`, `playwrightE2e: "pass"`, `propertyTest: "pass"`, `tauriDebugBuild: "pass"`, and immutable preflight `ok: true`.
    Add tests that TTT evidence includes `draftPath`, `confirmedIntentPath`, and `seedId: "ttt-game"` so the final delivery cannot be marked complete from an unmaterialized or unsigned input.
    Add tests for `evaluateTttDeliveryCaps` or the TTT branch of `evaluatePhase11Gate`: defaults are `maxAttempts: 50` and `maxWallClockDays: 14`; CLI override wins over `factory.stress.caps.tttDelivery`; config wins over defaults; a 51st attempt or elapsed time greater than 14 days blocks and requires `phase-11-cap-breach.json` evidence.
    Add conjunction tests: final phase gate passes only when both `tttDelivered` and `stressClean` are true; either false blocks with code `phase-11-gate-not-met`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test -- --test-name-pattern "phase 11 gate|ttt delivery"</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before gate evaluators exist.
    - Tests include literal `ttt-delivered AND stress-clean`, `phase-11-gate-not-met`, `missing-fault-observation`, `wrong-fault-mechanism`, `ttt-delivery`, `phase-11-cap-breach.json`, all four fault scenario names, and all four mechanism names.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement gate evaluators and evidence schema</name>
  <read_first>
    - apps/factory-cli/src/stress/phase-11-gate.test.ts
    - apps/factory-cli/src/ttt-delivery-gate.test.ts
    - apps/factory-cli/src/toy-verification-preflight.ts
    - packages/artifacts/src/stress-report.schema.ts
  </read_first>
  <files>apps/factory-cli/src/stress/phase-11-gate.ts, apps/factory-cli/src/ttt-delivery-gate.ts</files>
  <action>
    Implement `evaluateStressClean` and `evaluatePhase11Gate` in `apps/factory-cli/src/stress/phase-11-gate.ts`.
    Implement `TttDeliveryEvidence` and `evaluateTttDelivered` in `apps/factory-cli/src/ttt-delivery-gate.ts`.
    Required TTT evidence fields: `seedId`, `draftPath`, `confirmedIntentPath`, `prUrl`, `ciVerdict`, `playwrightE2e`, `propertyTest`, `tauriDebugBuild`, `immutablePreflight`, and `checkedAt`. Valid pass literals are `"pass"` only; anything else blocks. `seedId` must equal `"ttt-game"` and `draftPath`/`confirmedIntentPath` must be non-empty paths under `.protostar/stress/<sessionId>/inputs/<runId>/`.
    Import or consume Plan 11-09 `resolveStressCaps`/cap breach types for the TTT delivery path. TTT cap state must track attempt count and wall-clock start. On breach, write or require `.protostar/stress/<sessionId>/phase-11-cap-breach.json` with `shape: "ttt-delivery"`, `kind: "run-count" | "wall-clock"`, value, limit, and cap source. A breached TTT cap blocks Phase 11 completion even if a later report label says delivered.
    `evaluateStressClean` must collect observed fault evidence from `fault-observed` event payloads or equivalent parsed evidence associated with the fault-injection reports. It passes only when the observed set contains all four required pairs: `network-drop/adapter-network-refusal`, `llm-timeout/llm-abort-timeout`, `disk-full/disk-write-enospc`, and `abort-signal/external-abort-signal`. Do not treat `perRun[].faultInjected` labels as sufficient evidence.
    Gate output shape is `{ ok: true, tttDelivered: true, stressClean: true } | { ok: false, code: "phase-11-gate-not-met", tttDelivered, stressClean, blockers }`.
    Do not add merge, auto-merge, update-branch, or toy verification file writes.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test -- --test-name-pattern "phase 11 gate|ttt delivery" && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "phase-11-gate-not-met|missing-fault-observation|wrong-fault-mechanism|fault-observed|adapter-network-refusal|llm-abort-timeout|disk-write-enospc|external-abort-signal|network-drop|llm-timeout|disk-full|abort-signal|tttDelivered|stressClean|ttt-delivery|phase-11-cap-breach.json|tauriDebugBuild|confirmedIntentPath" apps/factory-cli/src` finds implementation and tests.
    - `rg -n "gh pr merge|git merge --|pulls.updateBranch|enableAutoMerge" apps/factory-cli/src packages` has no production matches outside existing no-merge contract fixtures/comments.
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Run final TTT delivery and all stress evidence gates</name>
  <read_first>
    - .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md
    - .planning/phases/11-headless-mode-e2e-stress/11-TOY-VERIFICATION-GATE.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
  </read_first>
  <files>.planning/phases/11-headless-mode-e2e-stress/11-VERIFICATION.md, .planning/STATE.md, .planning/ROADMAP.md</files>
  <action>
    Before running delivery, verify `11-TOY-VERIFICATION-GATE.md` records operator-authored `../protostar-toy-ttt/e2e/ttt.spec.ts` and `../protostar-toy-ttt/tests/ttt-state.property.test.ts`. If the gate artifact is missing or says either file is absent/failing, stop and do not run factory delivery.
    Create `11-VERIFICATION.md` and then run the actual final evidence commands, recording command, timestamp, exit code, artifact path, and result for each item.
    Prepare TTT run inputs through the same executable stress-step path used by stress drivers:
    `node apps/factory-cli/dist/main.js __stress-step --session phase11_ttt --action begin --total 1 --json`;
    `node apps/factory-cli/dist/main.js __stress-step --session phase11_ttt --action next-seed --seed-id ttt-game --seed-archetypes feature-add --run-index 0 --json`;
    `node apps/factory-cli/dist/main.js __stress-step --session phase11_ttt --action materialize-draft --seed-id ttt-game --run-id phase11-ttt --json`;
    `node apps/factory-cli/dist/main.js __stress-step --session phase11_ttt --action sign-intent --run-id phase11-ttt --draft .protostar/stress/phase11_ttt/inputs/phase11-ttt/intent.draft.json --json`.
    Then run the TTT delivery command with exact factory flags:
    `protostar-factory run --draft .protostar/stress/phase11_ttt/inputs/phase11-ttt/intent.draft.json --confirmed-intent .protostar/stress/phase11_ttt/inputs/phase11-ttt/confirmed-intent.json --out .protostar/runs --executor real --planning-mode live --review-mode live --delivery-mode auto --trust trusted --run-id phase11-ttt --intent-mode brownfield --llm-backend hosted-openai-compatible --headless-mode local-daemon --non-interactive`.
    In this repository's uninstalled smoke path, execute `node apps/factory-cli/dist/main.js run` followed by the identical flags.
    Before each TTT attempt, resolve TTT caps from CLI/config/defaults and record cap state in `11-VERIFICATION.md`. If attempts exceed 50 or elapsed wall-clock exceeds 14 days by default (or the resolved override), run `node apps/factory-cli/dist/main.js __stress-step --session phase11_ttt --action cap-breach --shape ttt-delivery --cap-kind run-count|wall-clock --cap-value <value> --cap-limit <limit> --cap-source cli|config|default --json`, record the resulting `phase-11-cap-breach.json`, and stop with Phase 11 incomplete.
    The command must run against the delivery target encoded in the TTT seed capability envelope (`../protostar-toy-ttt` / `zkeown/protostar-toy-ttt`); it must not modify `e2e/ttt.spec.ts` or `tests/ttt-state.property.test.ts`; it must open a PR and leave merge as an operator action outside the factory.
    Record TTT evidence: seed id, draft path, confirmed-intent path, PR URL, CI green/check names, Playwright E2E pass, property test pass, Tauri debug build pass, immutable preflight ok, and toy repo HEAD/branch.
    Run the three stress commands exactly:
    `bash scripts/stress.sh --shape sustained-load --runs 100 --llm-backend mock --headless-mode local-daemon`;
    `node apps/factory-cli/dist/scripts/stress.js --shape concurrency --sessions 4 --concurrency 4 --llm-backend mock`;
    `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario network-drop --runs 1 --llm-backend mock`;
    `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario llm-timeout --runs 1 --llm-backend mock`;
    `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario disk-full --runs 1 --llm-backend mock`;
    `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario abort-signal --runs 1 --llm-backend mock`.
    Record sustained-load, concurrency, and all four fault-injection report paths plus their `events.jsonl` paths. Confirm every report is terminal, has no wedge evidence, has no cap breach, and that observed fault evidence covers `network-drop/adapter-network-refusal`, `llm-timeout/llm-abort-timeout`, `disk-full/disk-write-enospc`, and `abort-signal/external-abort-signal`. A report containing only `perRun[].faultInjected` labels must be recorded as blocked, not clean. Record security gates: no-prompt, no-dashboard, hosted secret redaction, `pnpm add` allowlist, no-merge contract, `pnpm run verify`, and `pnpm run verify:full`.
    Update `.planning/STATE.md` and `.planning/ROADMAP.md` to mark Phase 11 complete only after `11-VERIFICATION.md` has checked evidence for TTT delivery plus all three stress shapes. If any evidence is missing, leave Phase 11 not complete and list blockers in `11-VERIFICATION.md`.
  </action>
  <verify>
    <automated>rg -n "\\[x\\] TTT delivered|\\[x\\] Sustained-load stress clean|\\[x\\] Concurrency stress clean|\\[x\\] Fault-injection stress clean|network-drop.*adapter-network-refusal|llm-timeout.*llm-abort-timeout|disk-full.*disk-write-enospc|abort-signal.*external-abort-signal|fault-observed|ttt-delivery cap|phase-11-cap-breach.json|PR URL|CI green|Playwright E2E|property test|Tauri debug build|draft path|confirmed-intent path|ttt-delivered AND stress-clean" .planning/phases/11-headless-mode-e2e-stress/11-VERIFICATION.md && rg -n "Phase 11.*complete|11-headless-mode-e2e-stress.*Complete" .planning/STATE.md .planning/ROADMAP.md</automated>
  </verify>
  <what-built>Gate evaluator code exists, toy verification preflight exists, stress drivers exist, and selector/backend wiring exists.</what-built>
  <how-to-verify>
    1. Confirm `11-TOY-VERIFICATION-GATE.md` shows both immutable toy verification files are operator-authored and passing.
    2. Resolve and record TTT caps, use `__stress-step` to select `ttt-game`, materialize `intent.draft.json`, sign `confirmed-intent.json`, then run the exact `protostar-factory run` flag set against `../protostar-toy-ttt` and record PR/CI/Playwright/property/Tauri evidence. If the TTT cap fires, record `phase-11-cap-breach.json` and stop.
    3. Run sustained-load, concurrency, and all four fault-injection stress commands (`network-drop`, `llm-timeout`, `disk-full`, `abort-signal`) and record clean report paths plus `fault-observed` evidence showing each expected mechanism.
    4. Run `pnpm run verify` and `pnpm run verify:full`.
    5. Only after all evidence is checked, update STATE/ROADMAP to Phase 11 complete.
  </how-to-verify>
  <resume-signal>Type "approved" after `11-VERIFICATION.md` contains checked TTT and stress evidence, or describe the missing evidence/blocker.</resume-signal>
  <acceptance_criteria>
    - `11-VERIFICATION.md` contains checked evidence for TTT delivery, sustained-load, concurrency, all four fault-injection scenarios with observed mechanisms, and security gates.
    - `11-VERIFICATION.md` contains the resolved TTT cap values and either no cap breach or the blocking `phase-11-cap-breach.json` path.
    - `.planning/STATE.md` and `.planning/ROADMAP.md` mark Phase 11 complete only after live evidence is filled.
    - No merge/update-branch command is run; PR merge remains an operator action outside the factory.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stress reports -> phase completion | Generated evidence decides whether stress-clean is true. |
| GitHub/toy CI -> TTT completion | External PR and CI evidence decides whether ttt-delivered is true. |
| final gate -> roadmap state | Completion state can misrepresent evidence if gate is weak. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-54 | Spoofing | TTT PR/CI evidence | mitigate | Gate requires structured fields and immutable preflight ok; live verification records PR URL/check names. |
| T-11-55 | Tampering | stress-clean reports | mitigate | Parse canonical stress reports and fault-observed evidence; reject wedge/cap/nonterminal reports and scenario labels without observed mechanisms. |
| T-11-56 | Repudiation | Phase 11 completion | mitigate | `11-VERIFICATION.md` records exact artifact paths and commands before STATE marks completion. |
| T-11-57 | Tampering | accidental merge/update-branch | mitigate | Gate never calls merge/update-branch; Plan 11-13 contract scans for forbidden authority. |
| T-11-58 | Denial of Service | missing toy verification files | mitigate | Gate consumes Plan 11-04 preflight and blocks with `toy-verification-missing`. |
| T-11-67 | Denial of Service | TTT delivery attempts | mitigate | TTT delivery enforces Q-03 cap defaults via Plan 11-09 cap resolver and writes `phase-11-cap-breach.json` on breach. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "phase 11 gate|ttt delivery"`, `pnpm --filter @protostar/admission-e2e test`, `pnpm run verify`, and `pnpm run verify:full`.
Live phase evidence additionally requires the toy verification gate, one real TTT delivery run, and all three stress commands recorded as checked evidence in `11-VERIFICATION.md`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
The final Phase 11 gate is explicit, tested, non-autonomous, and evidence-backed: Phase 11 cannot close unless TTT delivery and all three stress shapes are clean.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-14-SUMMARY.md`.
</output>
