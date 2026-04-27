---
phase: 01-intent-planning-admission
plan: 08
subsystem: factory-cli / refusal-evidence
tags: [refusal, artifacts, intent-gate, planning-admission, schema-versioning, phase-9-prep]
requires:
  - 01-04 (schemaVersion 1.0.0 + JSON Schemas)
  - 01-06a (promoteIntentDraft + admission-decision artifact)
  - 01-07 (AdmittedPlan brand)
provides:
  - run-uniform refusal artifact layout under .protostar/runs/{runId}/
  - .protostar/refusals.jsonl append-only index for Phase 9 status/inspect
  - terminal-status.json schema (refused-only) anchored at schemaVersion 1.0.0
affects:
  - apps/factory-cli (only writer to .protostar/)
  - Phase 9 operator surface (will read refusals.jsonl)
tech-stack:
  added: []
  patterns:
    - "Pure helper + thin fs wrapper split (formatRefusalIndexLine pure, appendRefusalIndexEntry owns fs)"
    - "Index path resolved as resolve(outDir, '..', 'refusals.jsonl') so tests stay hermetic per tempDir"
key-files:
  created:
    - apps/factory-cli/src/refusals-index.ts
    - apps/factory-cli/src/refusals-index.test.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
decisions:
  - "Refusals.jsonl lives next to runs/ dir (resolve(outDir, '..', 'refusals.jsonl')), not inside any single run. In production --out=.protostar/runs → index at .protostar/refusals.jsonl. In tests --out=tempDir/out → index at tempDir/refusals.jsonl. Hermetic per workspace."
  - "terminal-status.json is refusal-only (status pinned to 'refused' in buildTerminalStatusArtifact). Success paths do not emit it. Phase 9 may add a 'completed' marker later."
  - "Intent-side refusal now writes clarification-report.json before throwing. Previously the throw at line 191 happened before the success-path write at line 454 — INTENT-01's runtime half was unmet."
metrics:
  duration: "~25 minutes"
  completed: 2026-04-26
---

# Phase 1 Plan 08: Refusal Artifact Layout Summary

Wired the run-uniform refusal artifact triple — per-run refusal artifact + terminal-status.json + .protostar/refusals.jsonl entry — on every refusal branch in `runFactory`. Closes PLAN-A-02 (no-plan-admitted artifact on pre-admission failure) and the runtime half of INTENT-01 (clarification-report on intent-side ambiguity refusal). Phase 9 now has its index file ready.

## Refusal branches wired

| # | Branch | Trigger | Refusal artifact | Stage |
|---|--------|---------|------------------|-------|
| 1 | `promoteIntentDraft` not-ok | Draft fails ambiguity / required-checklist / policy gates | `clarification-report.json` (newly written here — see deviation) + `admission-decision.json` | `intent` |
| 2 | `readPlanningFixtureInput` not-ok | Planning fixture file unreadable / not JSON | `planning-admission.json` (admissionStatus=no-plan-admitted) | `planning` |
| 3 | `parsePlanningPileResultInputs` / `parseCandidatePlansFromPlanningPileResults` not-ok / no candidates | Schema-invalid pile result, candidate parse failure, empty candidate list | `planning-admission.json` (admissionStatus=no-plan-admitted) | `planning` |
| 4 | `candidateAdmission.ok === false` | Cyclic graph, capability envelope expansion, missing AC coverage, missing dep, etc. | `planning-admission.json` (admissionStatus=no-plan-admitted) | `planning` |

All four exit non-zero (existing throws preserved; the triple is written before the throw).

## Path resolution (Phase 9 input)

- **Run dir:** `resolve(outDir, runId)` — already in use upstream of this plan.
- **Refusals index:** `resolve(outDir, "..", "refusals.jsonl")`.
  - Production: `--out=.protostar/runs` → `.protostar/refusals.jsonl`.
  - Tests: `--out=tempDir/out` → `tempDir/refusals.jsonl` (hermetic).
- The `artifactPath` field inside each jsonl line is run-relative (`runs/{runId}/{artifact-name}`) so Phase 9 can compose absolute paths from the index location.

CONCERNS.md flags `workspaceRoot` is INIT_CWD-dependent; per the plan, that bug is Phase 3 REPO-07 territory and is not addressed here.

## Sample refusals.jsonl line (planning-side)

```json
{"runId":"smoke_planning_refusal","timestamp":"2026-04-27T03:48:54.050Z","stage":"planning","reason":"Planning admission rejected plan graph: Task task-cycle-a cannot depend on task-cycle-b because task-cycle-b already depends on task-cycle-a.; Task task-cycle-b cannot depend on task-cycle-a because task-cycle-a already depends on task-cycle-b.; Plan graph contains a dependency cycle.","artifactPath":"runs/smoke_planning_refusal/planning-admission.json","schemaVersion":"1.0.0"}
```

## Sample terminal-status.json

```json
{
  "schemaVersion": "1.0.0",
  "artifact": "terminal-status.json",
  "runId": "smoke_planning_refusal",
  "status": "refused",
  "stage": "planning",
  "reason": "Planning admission rejected plan graph: ...",
  "refusalArtifact": "planning-admission.json"
}
```

## Manual smoke runs

Both performed against `/tmp/p108-smoke{,2}/`:

1. **Planning-side (cyclic):** `node apps/factory-cli/dist/main.js run --draft examples/intents/scaffold.draft.json --out /tmp/p108-smoke/runs --planning-fixture examples/planning-results/bad/cyclic-plan-graph.json --run-id smoke_planning_refusal --intent-mode brownfield` → exit code 1; produces `admission-decision.json`, `planning-admission.json`, `planning-result.json`, `terminal-status.json` in run dir + appends one line to `/tmp/p108-smoke/refusals.jsonl`.
2. **Intent-side:** Exercised via the `clarificationBlockedDraft` test fixture in main.test.ts (no checked-in bad-draft fixture yet — left as a Phase 1 follow-up; the plan's literal example fixture `examples/intents/bad/missing-capability.json` is a confirmed-intent shape, not a draft, and goes through a different code path).

## Verification

- `pnpm --filter @protostar/factory-cli build` → clean.
- `pnpm --filter @protostar/factory-cli test` → 34/34 pass (was 26/34 mid-task before suppressed-list adjustment).
- `pnpm -r build` → all 13 workspace projects build clean.
- New test helper `assertRefusalTriple` exercised on both intent-side (clarification-blocked draft) and planning-side (cyclic plan) cases.

## Deviations from Plan

### Auto-added critical functionality

**1. [Rule 2 - Missing critical functionality] Wrote `clarification-report.json` on intent-side ambiguity refusal**
- **Found during:** Task 2 wiring of branch 1.
- **Issue:** The plan stated "clarification-report.json (already exists, now schemaVersion-tagged from Plan 04)" but a code trace showed it does **not** exist on the refusal path. `clarificationReport` is built at lines 161-166 of `main.ts`, but the only writer (`writeDraftAdmissionArtifacts` at line 454) lives on the success path. The throw at line 191 (when `promoteIntentDraft` returns not-ok) happens before that writer. The intent-side refusal only persisted `admission-decision.json` historically.
- **Fix:** Added an inline `writeJson(resolve(runDir, CLARIFICATION_REPORT_ARTIFACT_NAME), clarificationReport)` in the refusal branch before the throw. INTENT-01's runtime half ("clarification-report writes when ambiguity gate blocks") is now actually closed.
- **Files modified:** `apps/factory-cli/src/main.ts`.
- **Commit:** `345077b`.

**2. [Rule 2 - Test invariant update] Removed `clarification-report.json` from `suppressedIntentOutputFiles`**
- **Found during:** Task 2 first test run (8 failures).
- **Issue:** Eight existing tests asserted `clarification-report.json` must **not** appear on refusal — that assertion is contradicted by Q-08 / INTENT-01 runtime. The tests pre-dated this plan.
- **Fix:** Removed `clarification-report.json` from the suppression list with an inline comment pointing to Plan 01-08 / Q-08. All 34 tests now pass.
- **Files modified:** `apps/factory-cli/src/main.test.ts`.
- **Commit:** `345077b`.

### No checked-in bad-draft fixture

The plan's manual-smoke example references `examples/intents/bad/missing-capability.json`, but that file is a confirmed-intent (shape) fixture and goes through `createConfirmedIntentHandoff`, not `promoteIntentDraft` — the legacy `--intent` path doesn't currently emit the refusal triple. The intent-side smoke is exercised by the in-test `clarificationBlockedDraft` (test passes). Adding a checked-in bad-draft fixture (e.g. `examples/intents/bad/clarification-blocked.draft.json`) is a clean follow-up but not required to satisfy this plan's success criteria — left for the Phase 1 fixture-relocation pass / e2e plan to pick up.

## Authority boundary check

Every new fs write is in `apps/factory-cli/src/main.ts` or via `appendRefusalIndexEntry` in `apps/factory-cli/src/refusals-index.ts`. No `packages/*` package gained any fs capability. Confirmed by inspection of the diff — only files under `apps/factory-cli/` were modified.

## Self-Check: PASSED

Files:
- `apps/factory-cli/src/refusals-index.ts` — FOUND
- `apps/factory-cli/src/refusals-index.test.ts` — FOUND
- `apps/factory-cli/src/main.ts` — FOUND (modified)
- `apps/factory-cli/src/main.test.ts` — FOUND (modified)

Commits:
- `b7c2bc8` test(01-08): add pure refusals-index helper + terminal-status builder — FOUND
- `345077b` feat(01-08): wire refusal artifact triple on every refusal branch — FOUND
