# Phase 5: Review → Repair → Review Loop — Discussion Log

**Mode:** `--power` (offline answering via 05-QUESTIONS.html / 05-QUESTIONS.json)
**Date:** 2026-04-27
**Total questions:** 18 / 18 answered

This log is a human-reference audit trail. Downstream agents (researcher, planner, executor) consume `05-CONTEXT.md`, not this file.

## Loop Shape & Orchestration

### Q-01 — Where does the review→repair→review loop live?
- **Options presented:** (a) Keep inside `@protostar/review`; (b) New `@protostar/loop` package; (c) Drive from `apps/factory-cli`.
- **Selection:** (a) Keep inside `@protostar/review`.
- **Notes:** None.

### Q-02 — Mechanical → model serialization
- **Options presented:** (a) Strict serial (model only on mechanical-pass); (b) Always run both, mechanical gates; (c) Conditional with `warn` tier.
- **Selection:** (a) Strict serial.
- **Notes:** None.

### Q-03 — Re-execution scope on repair
- **Options presented:** (a) Failed task only; (b) Fresh-clone-per-iteration; (c) Failed task + dependents in same workspace.
- **Selection:** (c) Failed task + dependents in same workspace.
- **Notes:** None.

## RepairPlan Type & Authorship

### Q-04 — RepairPlan shape
- **Options presented:** (a) RepairTask refs with critiques; (b) Delta-shaped admitted plan; (c) Critique bundle, executor decides.
- **Selection:** (a) RepairTask refs with critiques.
- **Notes:** None.

### Q-05 — RepairPlan authorship
- **Options presented:** (a) Review package; (b) Separate `@protostar/repair`; (c) Loop orchestrator inline.
- **Selection:** (b) Separate `@protostar/repair` package.
- **Notes:** None.

### Q-06 — Critique propagation into adapter retry
- **Options presented:** (a) Structured `repairContext` on task input; (b) Pass via `ctx`; (c) Persist as evidence, adapter reads.
- **Selection:** (a) Structured `repairContext` on task input.
- **Notes:** None.

## Mechanical Review Surface

### Q-07 — Build + lint check execution
- **Options presented:** (a) Review invokes subprocess directly; (b) Execution stage as terminal tasks; (c) Hybrid `mechanical-checks` adapter.
- **Selection:** (c) Hybrid `mechanical-checks` adapter.
- **Notes:** None.

### Q-08 — `diff-touches-≤1-file` cosmetic enforcement
- **Options presented:** (a) Review-only run-level diff; (b) Per-task + run-level (both); (c) Admission-only.
- **Selection:** (b) Per-task + run-level (both).
- **Notes:** None.

### Q-09 — AC-presence definition
- **Options presented:** (a) Test-ref required per AC in run evidence; (b) Regex mention of AC id; (c) ACs declared + build passes.
- **Selection:** (a) Test-ref required per AC in run evidence.
- **Notes:** None.

## Model Review Seam (for Phase 8)

### Q-10 — Model-review interface in v0.1
- **Options presented:** (a) Typed interface + passthrough stub; (b) Minimal panel-of-one Qwen3-80B wired now; (c) Fixture-based stub.
- **Selection:** (b) Minimal panel-of-one Qwen3-80B wired now.
- **Notes:** None.

### Q-11 — Critique capture format
- **Options presented:** (a) Structured `JudgeCritique` with rubric scores + rationale; (b) Free-text + severity tag; (c) Discriminated union per critique kind.
- **Selection:** (a) Structured `JudgeCritique` with rubric scores + rationale.
- **Notes:** None.

## Budget & Exhaustion

### Q-12 — `maxRepairLoops` source-of-truth
- **Options presented:** (a) Capability envelope; (b) factory-config.json with envelope override; (c) Hardcoded with arg override.
- **Selection:** (a) Capability envelope `budget.maxRepairLoops` (default 3).
- **Notes:** None.

### Q-13 — Budget sharing semantics
- **Options presented:** (a) Single counter; (b) Two counters (mechanical / model); (c) Single counter with adapter retries nested.
- **Selection:** (c) Single counter with adapter retries nested.
- **Notes:** None.

### Q-14 — `block` verdict evidence shape
- **Options presented:** (a) Single `review-block.json` with full history; (b) JSONL + summary file; (c) Append to execution journal.
- **Selection:** (a) Single `review-block.json` with full history.
- **Notes:** None. (Q-17 keeps per-iteration files alongside; Q-14 is the roll-up summary on terminal block.)

## Final Gate & Delivery Contract

### Q-15 — ReviewDecision artifact shape
- **Options presented:** (a) Branded `DeliveryAuthorization` token; (b) JSON artifact only; (c) Both — artifact + brand.
- **Selection:** (c) Both — artifact + brand.
- **Notes:** Strict pass/pass at brand-mint; `'skipped'` reserved but not enabled in v0.1.

### Q-16 — Delivery refusal layer
- **Options presented:** (a) Type-level via `DeliveryAuthorization`; (b) Authority-kernel admission gate; (c) Runtime check inside delivery package.
- **Selection:** (a) Type-level via `DeliveryAuthorization`.
- **Notes:** None.

## Persistence & Lifecycle

### Q-17 — Review iteration storage layout
- **Options presented:** (a) Per-iteration directory `runs/{id}/review/iter-{N}/...`; (b) Flat with JSONL + sibling files; (c) Single `review-bundle.json`.
- **Selection:** (a) Per-iteration directory.
- **Notes:** None.

### Q-18 — Review lifecycle events
- **Options presented:** (a) Separate `ReviewLifecycleEvent` union + `review.jsonl`; (b) Reuse execution lifecycle events; (c) Defer (terminal events only).
- **Selection:** (a) Separate `ReviewLifecycleEvent` union + `review.jsonl`.
- **Notes:** None.

## Deferred Ideas Captured

(See `05-CONTEXT.md` `<deferred>` section.)

## Claude's Discretion Items

(See `05-CONTEXT.md` "Claude's Discretion" subsection inside `<decisions>`.)
