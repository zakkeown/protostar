# Phase 14: Pluggable Validation Reports — CONTEXT

**Status:** Decisions captured (21/21 from `/gsd-discuss-phase 14 --power`). Ready for `/gsd-plan-phase 14`.

## Phase Boundary

Introduce a **save-time validation** style alongside the existing fail-on-first admission gates. Given an intent / plan / capability envelope / repo policy / change-set, return a single **Report** that lists *all* findings (blockers, warnings, info, suggestions) anchored to specific nodes. Validators are pluggable, registered via `package.json` manifests, and run as capability-bounded subprocesses. Admission gates **derive** their admit/refuse decision from the report (`admitted = report.blockers.length === 0`) — single source of truth, default-DENY posture preserved, proven by contract test.

## Decisions

### Scope & Target Artifacts

- **Q-01 — Artifact coverage:** **All five** artifact types get report-style validation in v1: intent, plan, capability envelope, repo policy, and change-set. *Rationale:* maximum coverage; aligns with Phase 12's apply-change-set invariant work and Phase 13 replay-with-edit (every replayable artifact has a report).
- **Q-02 — Invocation surface:** **Both author-time and admission-time, single source of truth.** New `protostar-factory validate` CLI for author-time; admission gates wrap the same report internally so gate decision derives from `report.blockers.length === 0`. *Implication:* per-stage admission decision artifacts get refactored to consume the unified Report.
- **Q-03 — Migration posture:** **Unify.** Refactor existing `IntentAdmissionPolicyFinding`, `IntentAdmissionMissingFieldDetection`, `IntentAdmissionHardZeroReason`, `IntentAdmissionRequiredClarification`, and the capability `findings[]` shape into a single `Finding` type owned by the new validation package. *Largest blast radius accepted in exchange for the cleanest endgame.*

### Report Schema & Finding Shape

- **Q-04 — Anchor format:** **Hybrid.** JSON Pointer (RFC 6901) for in-document field anchors; domain anchors (typed discriminated union) for plans (`planId`) and files (`fileLine`). One pointer category per artifact type.
- **Q-05 — Multi-anchor:** Each finding carries an `anchors[]` array (1..N). Renderer picks a primary heuristically (first by default); cross-reference findings (e.g. plan-vs-plan conflicts) attach all relevant anchors to one finding.
- **Q-06 — Severity levels:** **Four levels** — `blocker | warning | info | suggestion`. Only `blocker` affects gate outcome by default. `suggestion` may carry a structured remediation hint (see Q-07).
- **Q-07 — Finding required fields:** Maximum schema — `code`, `severity`, `anchors`, `message`, `validatorId`, `validatorVersion`, `remediationHint?`, `docsUrl?`, `suggestedFix?` (structured patch). Enables auto-fix UX in conjunction with Phase 13 replay-with-edit.
- **Q-08 — Schema versioning:** Envelope `schemaVersion` **plus content hash of the registered validator set**. Replays detect validator drift; identical validator set + identical input ⇒ byte-identical report.

### Validator Plugin Contract

- **Q-09 — Validator runtime location:** **Subprocess plugins, capability-bounded.** Validators run as child processes through `@protostar/repo`'s subprocess runner (Phase 3 + Phase 12 hardening). *Implications:* this is the load-bearing decision of the phase — large scope, but unlocks third-party validators and isolates plugin failures from the factory process. Plan must scope a v1 subset; full plugin marketplace is 1.0+.
- **Q-10 — Registration mechanism:** **Manifest in `package.json`** under a `protostar.validators: [...]` key (mirrors the `protostar.tier` precedent from Phase 12). Workspace scan discovers and loads them; explicit allowlist in factory config gates which manifests are honored.
- **Q-11 — Validator interface:** Object shape — `{ id, version, target: SchemaName, validate: (parsed) => Finding[] }`. Registry pre-parses the artifact by `target` and dispatches the typed parsed value to each validator. Subprocess wire protocol carries the same shape over JSON-RPC (or equivalent — decide in research).
- **Q-12 — Ordering / dependencies:** **Two phases.** Structural validators run first; semantic validators are skipped (with a recorded "skipped: structural blockers present" finding) if any structural finding is a blocker. Mirrors existing intent admission staging (parse → ambiguity → policy).
- **Q-13 — Determinism contract:** **Pure + allowlisted read-only reference data.** Validators may read snapshot files (e.g. allowlists, config presets); each reference file is content-hashed and the hash is included in the report's validator-set hash (Q-08). No clock, no random, no network, no mutable I/O.

### Composition with Admission Gates

- **Q-14 — Gate ↔ report relationship:** **Gate decision derives from report.** `admitted = report.blockers.length === 0`. Per-stage decision artifacts are refactored to embed (or reference) the report. This is the single source of truth that Q-02 and Q-03 commit to.
- **Q-15 — Warning semantics:** **Per-validator `warningPolicy` field** — each validator declares whether its warnings are `advisory` (never block) or `strict-in-ci` (promoted to blockers when `--strict` is set). Validator knows its own domain best.
- **Q-16 — Default-DENY preservation contract test:** **Required.** New `gate-report-parity.contract.test.ts` in `@protostar/admission-e2e` asserts: empty validator set ⇒ gate still refuses (no implicit allow); composed with Phase 12 BOUNDARY-06 pattern.

### Persistence

- **Q-17 — Report location:** `.protostar/runs/<id>/validation/<artifact>.report.json` for gate-time reports inside a run bundle. Author-time `validate` outside a run **prints to stdout** with no persistence (lowest new persistence surface).
- **Q-18 — Immutability + indexing:** Append-only, **content-addressed by report hash, no per-run index**. Matches existing run-bundle posture; replay-with-edit (Phase 13) diffs by hash.

### CLI / Operator UX

- **Q-19 — CLI surface:** `protostar-factory validate <type> <path>` (e.g. `validate intent ./draft.json`). Explicit type argument; no schemaVersion auto-detection. Predictable refusal messages for the wrong type.
- **Q-20 — Output formats:** **JSON (default) + human renderer (`--format human`) + SARIF (`--format sarif`)**. Human renderer grouping decided in plan (likely severity-first then anchor); SARIF unlocks GitHub code-scanning UI integration.
- **Q-21 — Exit codes:** Granular — `0 = clean` (no blockers, no warnings), `1 = warnings only`, `2 = blockers`, `3 = validator runtime error`. CI authors can pick the threshold they care about.

## Specifics & Notes

- **Subprocess validator runtime is the dominant risk** — Q-09 chose the most capable but most complex option. Plan must enforce a contract test that no validator subprocess can exceed its declared capability envelope (workspace, no-net, time/memory caps). Reuses Phase 12's hardened subprocess runner; do not introduce a parallel runner.
- **Determinism contract is load-bearing for Phase 13.** The validator-set hash (Q-08) + reference-data hash (Q-13) together guarantee that replaying an edited artifact produces a byte-identical report when validators are unchanged. Any divergence is a Phase 13-visible bug.
- **Migration sequencing.** Q-03 (unify) + Q-14 (gate derives from report) means existing admission decision artifacts change shape. Plan must include schema-version bumps, contract tests for each refactored stage, and a `verify:full`-green gate before any caller is migrated. Suggest staging: define types → adapter for each stage → contract-test parity → flip gate to derive-from-report → delete legacy code paths.
- **Schema bumps in scope:** at minimum `protostar.intent.admission-decision.v1 → v2` (or new `protostar.validation.report.v1` superseding it), capability/policy/plan/change-set decision artifacts, and the run-bundle layout for `validation/`.
- **SARIF output (Q-20):** GitHub code-scanning compatibility implies anchor format must be losslessly mappable to SARIF locations — confirm during research that JSON Pointer + fileLine round-trip cleanly through SARIF `physicalLocation` / `logicalLocation`.

## Deferred Ideas

- **Plugin marketplace / discovery beyond workspace scan** — out of scope; v1 is workspace-local manifests only.
- **In-IDE validator integration (LSP-style)** — out of scope; CLI + JSON contract is the v1 surface, IDE wrappers are downstream.
- **Auto-fix application from `suggestedFix`** — schema field in scope (Q-07), but applying fixes automatically is out of scope; that's a Phase 13 + future replay-with-edit feature.
- **Cross-artifact validators** (e.g. "intent says X, plan does Y") — out of scope for v1; each validator targets a single artifact type. Cross-artifact checks remain in admission helpers.

## Reusable Code Context

- `packages/intent/src/admission-decision.ts` — existing `AdmissionDecisionArtifactDetails`, `IntentAdmissionPolicyFinding`, `IntentAdmissionMissingFieldDetection`, `IntentAdmissionHardZeroReason`, `IntentAdmissionRequiredClarification` — these are the source-of-truth types to **unify**.
- `packages/intent/src/capability-admission.ts` — `findings[]` with `severity: 'block' | 'ambiguity'`, `code`, `fieldPath`, `message`, `overridden` — closest existing analog to the new Finding shape.
- `packages/policy/src/admission.ts`, `packages/policy/src/admission-contracts.ts` — re-export surface that downstream packages consume; must remain stable through migration or coordinated bump.
- `packages/policy/src/no-net.contract.test.ts`, `packages/artifacts/src/no-net.contract.test.ts` — existing tier-conformance contract test pattern to mirror for `gate-report-parity.contract.test.ts`.
- `packages/repo/src/subprocess-runner.ts` (Phase 3, Phase 12 hardening) — required substrate for Q-09 subprocess validators; default-empty env, allowlisted argv.
- `packages/admission-e2e/src/` — home for `gate-report-parity.contract.test.ts` (Q-16) and per-stage report parity contract tests.
- `apps/factory-cli/src/main.ts` (commander subcommand registration, Phase 9) — pattern for `validate` subcommand.
- `.protostar/runs/<id>/` layout (Phase 9 OP-08 prune work) — append-only, content-addressed; reports slot under `validation/`.
- `packages/artifacts/src/canonical-json.ts` — canonical JSON serialization; required for content-hash determinism (Q-08).

## Canonical References

- `.planning/PROJECT.md` — authority boundary, runtime-dep posture, dark-factory autonomy line
- `.planning/ROADMAP.md` — Phase 14 entry + Phase 12/13 dependencies
- `.planning/REQUIREMENTS.md` — admission requirement IDs (INTENT-*, PLAN-A-*, GOV-*, REPO-*, LOOP-*) that Phase 14 unifies
- `.planning/STATE.md` — Phase 2/12 locks and key decisions still in force
- `.planning/phases/12-authority-boundary-stabilization/12-SEED.md` — subprocess-runner hardening that Q-09 depends on
- `.planning/phases/13-replay-with-edit-run-bundles/13-CONTEXT.md` — determinism/replay contract that Q-08 + Q-13 must satisfy
- `AGENTS.md` — domain-first packaging, no catch-all packages rule (applies to new `@protostar/validation`)

---
*CONTEXT.md generated 2026-04-29 from `/gsd-discuss-phase 14 --power` (21/21 questions answered).*
