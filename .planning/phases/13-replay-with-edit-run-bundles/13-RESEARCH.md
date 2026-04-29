# Phase 13: Replay-with-Edit for Run Bundles — Research

**Researched:** 2026-04-29
**Domain:** Counterfactual replay over content-addressed run bundles; deterministic re-execution of dependency closures
**Confidence:** HIGH for layout/seams (verified against code); MEDIUM for determinism contract (depends on STRESS-07); LOW for nothing.

## Summary

Phase 13 adds a `factory-cli replay` verb that takes one recorded pile artifact, validates the edit, computes the dependency closure of stages that read it, re-executes that suffix, and stores the result as a sibling overlay bundle at `.protostar/runs/<runId>/replays/<replayId>/`. Every other stage's output is reused by hash-pinned reference via `overlay.json`.

The phase touches three layers:

1. **New `@protostar/replay` workspace (pure tier)** — owns EditSet schema, edit-address parser, schema registry, allowlist enforcement, dependency-closure resolver, overlay manifest types, hash-chain harness types. Zero filesystem I/O.
2. **Read-set instrumentation in producer packages** (`packages/execution`, `packages/review`, `packages/evaluation`) — emits a per-stage `pathsRead` record alongside the existing trace/journal artifacts. Recommend a uniform `<stage>/pathsRead.json` sidecar over schema-bumping every existing artifact (see Architecture Patterns).
3. **CLI wiring** — `apps/factory-cli/src/commands/replay.ts` is the fs-tier seam; `inspect.ts` extends to resolve overlay pointers; `prune.ts` extends to skip `replays/`.

**Primary recommendation:** Land read-set instrumentation as a uniform `pathsRead.json` sidecar at every stage boundary (Wave 0), then build `@protostar/replay` against that contract. This avoids cross-cutting schema bumps on existing artifacts (`trace.json`, `journal.jsonl`, `mechanical-result.json`, `model-result.json`, `evaluation-report.json`).

**Critical dependency:** D-06 per-stage hash-chain byte-equality on the *cascaded suffix* requires a deterministic backend. STRESS-07 (deterministic mock backend) is `Pending` in REQUIREMENTS.md. The Phase 13 regression fixture in `packages/admission-e2e/src/replay/` MUST run under that backend; if STRESS-07 doesn't land first, the hash-chain test can only verify the *unchanged prefix*, not the cascaded suffix.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Edit Surface & Artifact Addressing**

- **D-01 (Q-01) — Single edit in v1, EditSet schema designed for multi.** The `replay` CLI accepts exactly one `--edit` in v1, but the on-disk EditSet schema is shaped to carry N edits so v2 can unlock multi-artifact patch sets without a breaking change.
- **D-02 (Q-02) — Pile outputs only.** Editable allowlist for v1 is `piles/<kind>/iter-<N>/{result.json,trace.json}` (judge, reviewer, planning, etc.). Anything outside this allowlist is refused at the replay CLI.
- **D-03 (Q-03) — Path + JSON Pointer for sub-records.** Edits are addressed by `<bundle-relative-path>#<json-pointer>` (e.g. `piles/review/iter-2/result.json#/findings/3`). Whole-artifact edits use the path with no fragment.
- **D-04 (Q-04) — Validate at replay-CLI entry, refuse on schema fail.** The edited artifact must validate against the same schema the original run used. Schema failure produces a refusal artifact in the same shape as admission refusals; no `--force` bypass in v1.

**Determinism Contract & Downstream Replay**

- **D-05 (Q-05) — Re-run any stage that read the edited artifact; replay everything else.** Compute dependency closure from recorded read-set. Cascaded stages re-execute live. All other stages serve recorded outputs unchanged.
- **D-06 (Q-06) — Per-stage hash chain.** Each stage hashes its inputs (read-set artifacts) and outputs into the trace; contract test asserts byte-equality of every per-stage `(inputsHash, outputsHash)` pair against a recorded fixture for the unchanged prefix and against expected post-edit values for the cascaded suffix.
- **D-07 (Q-07) — Record a read-set during the original run.** Phase 4/5 instrumentation extended so each stage emits `pathsRead: [...]` (bundle-relative, optionally with JSON Pointer fragments). **Cross-phase implication:** small additive change in Phases 4/5/8 instrumentation, packaged inside Phase 13's plan set.

**Replay Bundle Storage Layout**

- **D-08 (Q-08) — Hybrid: sibling bundle for new artifacts, overlay manifest pinning unchanged ones by hash.** Replay bundle lives at `.protostar/runs/<runId>/replays/<replayId>/` with (a) freshly produced artifacts for cascaded stages, (b) `overlay.json` listing `{ path → originalSha256 }` for unchanged artifacts. `inspect` learns to resolve overlay pointers. Original bundle is never mutated.
- **D-09 (Q-09) — Replays are never auto-pruned in v1.** OP-08 prune skips them entirely.

**Operator CLI / UX**

- **D-10 (Q-10) — New top-level verb: `factory-cli replay`.** Mirrors `inspect` / `deliver` / `prune`. Composes with OP-07 JSON-stable output contract. Shape: `factory-cli replay --run <id> [--replay-id <id>] --edit <path[#ptr]>=<file> [--edit-set <manifest.json>] [...]`.
- **D-11 (Q-11) — Both `--edit` and `--edit-set`.** Per D-01, v1 still enforces a single edit total across both inputs.

**Authority Boundary & Delivery**

- **D-12 (Q-12) — Two-key opt-in for delivery from replay.** Defaults to no delivery. Both required: (1) `factory-config.json` has `replay.allowDelivery: true`, AND (2) per-invocation `--allow-delivery`. Every delivery-from-replay event writes an audit entry to `admission-decisions.jsonl` with `editSetHash`, `parentRunId`, `replayId`. Mirrors Phase 2's two-key launch posture.
- **D-13 (Q-13) — Replay re-runs admission gates against any edited admission-input artifact.** Currently unreachable in v1 (D-02 forbids edits outside pile outputs); contract pinned now so v2 expansion is safe-by-default.

**Evaluation Integration (Phase 8)**

- **D-14 (Q-14) — In-scope: replay produces an eval-counterfactual artifact consumed by Phase 8.** Each replay writes `replays/<replayId>/evaluation/counterfactual.json` capturing the eval delta vs the parent run. Phase 8's evolution-runner extended to read counterfactuals when present and treat them as evolution signals.

### Claude's Discretion

- Specific schema-registry key shape (path glob → schema id).
- Exact serialization of read-set sidecar (`pathsRead.json` recommended; planner may choose alternate per Architecture Patterns).
- Whether dependency-closure resolver lives entirely in `@protostar/replay` or splits resolver-logic vs. fs-side bundle-walker.
- EditSet on-disk schema exact field names (proposal in Code Examples).
- Naming of replay-specific brands (e.g., `EditSetHash`, `OverlayManifest`, `CounterfactualReport`).

### Deferred Ideas (OUT OF SCOPE)

- **Multi-edit replay** — schema accommodates it (D-01); CLI enforcement and combined-edit determinism contract land in a follow-up phase.
- **Editing journal entries and raw LLM completions** — out of scope for v1 per D-02; reconsider once pile-only replay is dogfooded.
- **Sub-record edits at points other than pile artifacts** — D-03 reserves the JSON Pointer surface; expansion is a v2 question.
- **`--force-invalid` schema-bypass for malformed-input debugging** — explicitly rejected for v1 (D-04).
- **Auto-prune of replay bundles** — deferred per D-09.
- **Replay-from-replay (chained counterfactuals)** — not addressed; v2 design question.
</user_constraints>

<phase_requirements>
## Phase Requirements

Proposed REPLAY-NN IDs derived from D-01..D-14. Planner should commit these to `.planning/REQUIREMENTS.md` as the first plan in Phase 13 (mirrors Phase 12 plan 12-01's REQUIREMENTS.md update).

| ID | Description | Source | Research Support |
|----|-------------|--------|------------------|
| REPLAY-01 | EditSet schema (N-edit shape, single-edit v1 enforcement) and `editSetHash` brand | D-01 | `@protostar/replay` package; zod schema; sha256 via `node:crypto` |
| REPLAY-02 | Editable-allowlist enforcement (pile outputs only: `piles/<kind>/iter-<N>/{result.json,trace.json}`) | D-02 | Pile layout pinned at `apps/factory-cli/src/pile-persistence.ts:7-12`; pure-tier predicate |
| REPLAY-03 | Edit-address parser: `<bundle-relative-path>[#<json-pointer>]` per RFC 6901 | D-03 | Hand-roll RFC 6901 in `@protostar/replay/src/json-pointer.ts` (~30 LOC, no new dep) |
| REPLAY-04 | Schema-validate-on-entry; refusal artifact in admission shape on failure | D-04 | Schema registry keyed by path glob; reuse `packages/intent` JSON Schema infra |
| REPLAY-05 | Read-set instrumentation in execution/review/evaluation producers | D-07 | Recommend `<stage>/pathsRead.json` sidecar (option c) — see Architecture Patterns |
| REPLAY-06 | Dependency-closure resolver from recorded read-sets | D-05 | Pure-tier graph walk; transitive closure over `pathsRead` |
| REPLAY-07 | Per-stage hash-chain harness (assertions on `(inputsHash, outputsHash)` per stage) | D-06 | sha256 over canonical-JSON via `sortJsonValue` from `@protostar/artifacts` |
| REPLAY-08 | Overlay manifest writer + sibling bundle layout `replays/<replayId>/` | D-08 | New brand `OverlayManifest`; atomic tmp+rename like Phase 6 Q-07 |
| REPLAY-09 | `inspect` overlay-aware resolution | D-08 | Extend `apps/factory-cli/src/commands/inspect.ts:64-78` artifact specs with `replays/<replayId>/` allowlist |
| REPLAY-10 | `prune` carve-out: replays excluded entirely in v1 | D-09 | Extend `apps/factory-cli/src/commands/prune.ts` skip predicate |
| REPLAY-11 | `factory-cli replay` CLI verb registered in main dispatcher | D-10 | New `apps/factory-cli/src/commands/replay.ts` matching command pattern (Phase 9 Q-01) |
| REPLAY-12 | `--edit <path[#ptr]>=<file>` and `--edit-set <manifest.json>` inputs; v1 single-edit ceiling | D-11 | commander `@commander-js/extra-typings` (already a dep) |
| REPLAY-13 | Two-key delivery: `replay.allowDelivery: true` + `--allow-delivery` flag; audit entry to `admission-decisions.jsonl` | D-12 | Compose with `apps/factory-cli/src/two-key-launch.ts` pattern; reuse `apps/factory-cli/src/admission-decisions-index.ts` |
| REPLAY-14 | Admission re-fire contract for edited admission-input artifacts (unreachable in v1; pinned for v2) | D-13 | Contract test in `packages/admission-e2e/src/replay/` |
| REPLAY-15 | `replays/<replayId>/evaluation/counterfactual.json` + Phase 8 evolution-runner hookup | D-14 | Hook point: `packages/evaluation-runner/src/run-evaluation-stages.ts:337` (`decideEvolution` call site) |
| REPLAY-16 | admission-e2e regression fixture: edit→replay→pass and edit→replay→still-fail paths under D-06 hash chain | CONTEXT specifics | New `packages/admission-e2e/src/replay/` |
| REPLAY-17 | `manifest.json` replay extensions: `parentRunId`, `replayId`, `editSetHash`, `allowDelivery: false`, `pathsCascaded: [...]` | CONTEXT specifics | Schema bump; cascade through `@protostar/artifacts` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| EditSet schema, edit-address parsing, JSON Pointer eval | `@protostar/replay` (pure) | — | No I/O; pure transforms. Authority lock: only `apps/factory-cli` and `packages/repo` touch fs. |
| Schema-validate-on-entry registry | `@protostar/replay` (pure) | `packages/intent` (pure) | Reuses existing JSON-Schema infra; extends registry to pile-result/trace shapes. |
| Dependency-closure resolver | `@protostar/replay` (pure) | — | Graph walk over recorded read-sets; pure function `(editPaths, readSet) → cascadedStages`. |
| Read-set instrumentation hook | `packages/execution` (pure) | `apps/factory-cli` (fs writes sidecar) | Each stage emits structured pathsRead records consumed at fs boundary; same pattern as Phase 4 journal events. |
| Read-set instrumentation hook | `packages/review` (pure) | `apps/factory-cli` (fs writes sidecar) | Mirror execution path. |
| Read-set instrumentation hook | `packages/evaluation` (pure) | `packages/evaluation-runner` (network) → `apps/factory-cli` (fs) | Evaluation stages live across pure→network→fs; sidecar write happens in factory-cli. |
| Overlay manifest writer | `apps/factory-cli` (fs) | `@protostar/replay` (pure types/builder) | Authority lock: only `apps/factory-cli` and `packages/repo` write fs. |
| `inspect` overlay-aware resolution | `apps/factory-cli` (fs) | `@protostar/replay` (pure resolver) | Extends existing `commands/inspect.ts`. |
| `prune` replay carve-out | `apps/factory-cli` (fs) | — | Extends existing `commands/prune.ts`. |
| Per-stage hash-chain assertion harness | `packages/admission-e2e` (test-only) | `@protostar/replay` (pure helpers) | Test code; uses `node:crypto` + `sortJsonValue`. |
| Two-key delivery enforcement | `apps/factory-cli` (fs) | `@protostar/review` (pure validator) | Composes `replay.allowDelivery` config + `--allow-delivery` flag with existing `reAuthorizeFromPayload` in `@protostar/review`. |
| `admission-decisions.jsonl` audit append | `apps/factory-cli` (fs) | `@protostar/authority` (pure types) | Reuses `apps/factory-cli/src/admission-decisions-index.ts:21-29`. |
| Counterfactual eval delta + evolution signal | `packages/evaluation` (pure) → `packages/evaluation-runner` (network) | `apps/factory-cli` (fs writes counterfactual.json) | Pure delta computation; runner consumes; factory-cli persists. |

## Standard Stack

### Core (existing — verify before plan)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.25.76 | EditSet, OverlayManifest, CounterfactualReport runtime validation | Already a dep on `apps/factory-cli` per Phase 10 Plan 08 lock; extend to `@protostar/replay`. [VERIFIED: apps/factory-cli/package.json:64] |
| node:crypto | (Node 22) | sha256 for editSetHash, overlay hashes, hash-chain | Built-in; established by Phase 2 GOV-06 (Q-15 SHA-256 lock). [VERIFIED: packages/authority/src/signature/] |
| @commander-js/extra-typings | ^14 | `replay` subcommand DSL | Already a dep on `apps/factory-cli`; Phase 9 Q-02 lock. [VERIFIED: apps/factory-cli/src/commands/inspect.ts:5] |
| node:test | (Node 22) | Test runner | Project lock. [CITED: PROJECT.md] |

### Hand-rolled (no new dep)

| Capability | Implementation | Why Not a Library |
|------------|---------------|-------------------|
| RFC 6901 JSON Pointer | New `@protostar/replay/src/json-pointer.ts` (~30 LOC: parse, resolve, set) | Spec is small and stable. PROJECT.md "minimal external runtime deps" posture. No `json-pointer` / `jsonpointer` dep currently in repo. [VERIFIED: grep returned no matches] |
| Canonical JSON for hashing | Reuse `sortJsonValue` from `@protostar/artifacts` | Already in repo. [VERIFIED: packages/artifacts/src/canonical-json.ts] |
| Schema registry | Map<pathGlob, zodSchema> in `@protostar/replay` | Trivial; avoids ajv dep. [ASSUMED] no ajv currently in repo. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Verdict |
|------------|-----------|----------|---------|
| Hand-rolled RFC 6901 | `json-pointer@0.6.x` | +1 dep, ~5kb, well-trodden | **Hand-roll** — spec is small, dep posture is tight |
| zod schema registry | `ajv` + JSON Schema files | More mature for JSON Schema; adds new dep family | **zod** — already in repo, project pattern |
| Sibling bundle only | Overlay-only (rewrite manifest) | Simpler at write time | **Hybrid (locked D-08)** — already decided |

**Installation:** No new dependencies required if hand-rolling JSON Pointer. If planner chooses dep-route: `pnpm add json-pointer@^0.6` to `@protostar/replay`.

**Version verification:** Before pinning, run `npm view zod version` to confirm `^3.25.76` is still current (training-data caveat). [ASSUMED] zod 3.x line is still active; v4 may have shipped.

## Architecture Patterns

### System Architecture Diagram

```
                    factory-cli replay --run <id> --edit <path#ptr>=<file>
                                          │
                                          ▼
                ┌─────────────────────────────────────────────────────┐
                │  apps/factory-cli/src/commands/replay.ts (fs tier)  │
                └─────────────────────────────────────────────────────┘
                                          │
                ┌─────────────────────────┼──────────────────────────┐
                │                         ▼                          │
                │     ┌─────────────────────────────────┐            │
                │     │   @protostar/replay (pure tier) │            │
                │     │   1. parse edit address         │            │
                │     │   2. enforce allowlist (D-02)   │            │
                │     │   3. validate edit vs schema   │            │
                │     │   4. build EditSet + hash       │            │
                │     │   5. resolve dep closure       │            │
                │     │      (read-set + edit paths)   │            │
                │     └─────────────────────────────────┘            │
                │                         │                          │
                │   ┌─────────────────────┼──────────────────┐       │
                │   ▼                     ▼                  ▼       │
                │ replay <  pile re-invoke   (cascaded)    overlay   │
                │ refused   via existing     stage         writer    │
                │ (refusal  pile-persistence executor      copies    │
                │  artifact)+ adapter        (live LLM)    pathsRead │
                │                            …            │          │
                │                            ▼            │          │
                │              freshly produced artifacts │          │
                │                            │            │          │
                │   ┌────────────────────────┴────────────┘          │
                │   ▼                                                │
                │ replays/<replayId>/{manifest.json, overlay.json,   │
                │   <cascaded>/result.json, <cascaded>/trace.json,   │
                │   evaluation/counterfactual.json}                  │
                └─────────────────────────────────────────────────────┘
                                          │
                       ┌──────────────────┼──────────────────┐
                       ▼                  ▼                  ▼
                inspect (overlay-      prune skips     admission-
                  aware resolver)     replays/         decisions.jsonl
                                                       (D-12 audit)
                                                              │
                                                              ▼
                                       packages/evaluation-runner
                                       reads counterfactual →
                                       decideEvolution signal (D-14)
```

### Recommended Project Structure

```
packages/replay/                              # NEW workspace, tier=pure
├── package.json
├── src/
│   ├── index.ts
│   ├── edit-set/
│   │   ├── schema.ts                         # zod schema (REPLAY-01)
│   │   ├── parse-address.ts                  # path[#json-pointer] (REPLAY-03)
│   │   ├── allowlist.ts                      # pile-output predicate (REPLAY-02)
│   │   └── hash.ts                           # editSetHash brand (sha256 via node:crypto)
│   ├── json-pointer.ts                       # RFC 6901 hand-rolled (~30 LOC)
│   ├── schema-registry/
│   │   ├── index.ts                          # path-glob → zod schema map
│   │   └── pile-result.ts, trace.ts, ...
│   ├── dependency-closure/
│   │   └── resolve.ts                        # pure (editPaths, readSet) → cascadedStages
│   ├── overlay-manifest/
│   │   ├── schema.ts                         # OverlayManifest brand
│   │   └── builder.ts                        # pure builder; writer is in factory-cli
│   ├── hash-chain/
│   │   └── assertions.ts                     # per-stage (inputsHash, outputsHash)
│   ├── counterfactual/
│   │   └── delta.ts                          # eval delta against parent
│   └── no-fs.contract.test.ts                # tier-conformance gate

packages/admission-e2e/src/replay/            # REPLAY-16 fixture
├── parent-bundle/                            # committed run bundle (cosmetic-tweak)
├── edit-set-pass.json
├── edit-set-still-fail.json
├── replay-pass.contract.test.ts
└── replay-still-fail.contract.test.ts

apps/factory-cli/src/
├── commands/
│   ├── replay.ts                             # NEW (REPLAY-11)
│   ├── replay.test.ts
│   ├── inspect.ts                            # MODIFY (REPLAY-09): overlay-aware
│   └── prune.ts                              # MODIFY (REPLAY-10): skip replays/
├── replay-overlay-writer.ts                  # NEW (atomic tmp+rename like pile-persistence.ts)
├── replay-paths-read-writer.ts               # NEW (sidecar at stage boundaries)
└── main.ts                                   # MODIFY: register replay verb

# Read-set instrumentation (D-07) — additive callers, no schema bump
packages/execution/src/                       # MODIFY: emit pathsRead from runRealExecution
packages/review/src/                          # MODIFY: emit pathsRead per iter
packages/evaluation/src/                      # MODIFY: emit pathsRead per stage

# D-14 evolution signal hookup
packages/evaluation-runner/src/run-evaluation-stages.ts:337   # MODIFY: optionally consume counterfactual
```

### Pattern 1: Read-Set Sidecar (D-07 Instrumentation)

**What:** Each stage writes a uniform `<stage>/pathsRead.json` sidecar listing every recorded artifact it consumed. Replay's dependency-closure resolver reads these and builds a graph.

**Why sidecar over schema-bumping existing artifacts:** Existing artifacts have heterogeneous shapes — `journal.jsonl` is per-event, `trace.json` is one-shot per pile, `mechanical-result.json`/`model-result.json` are per-iter. A sidecar is additive (no schemaVersion cascade), uniform, and lives at one writable site per stage.

**Sidecar schema (proposal):**

```ts
// packages/replay/src/paths-read-record.ts
export interface PathsReadRecord {
  readonly schemaVersion: "1.0.0";
  readonly stage: "execution" | "review" | "evaluation" | "planning-pile" | "review-pile" | "exec-coord-pile";
  readonly stageInstance: string;     // e.g. "execution", "review/iter-2", "evaluation/semantic"
  readonly runId: string;
  readonly recordedAt: string;        // ISO
  readonly pathsRead: ReadonlyArray<{
    readonly path: string;            // bundle-relative
    readonly jsonPointer?: string;    // RFC 6901, optional
    readonly sha256: string;          // hash of artifact at read time (input hash)
  }>;
  readonly outputsHash: string;       // hash of what this stage produced (D-06 chain)
}
```

**Locations on disk (planner picks; recommend):**
- `runs/<id>/execution/pathsRead.json`
- `runs/<id>/review/iter-<N>/pathsRead.json`
- `runs/<id>/piles/<kind>/iter-<N>/pathsRead.json`
- `runs/<id>/evaluation/<stage>/pathsRead.json`

**Hook points (file:line — VERIFIED against current code):**

| Stage | Producer Package | Hook Point | Sidecar Written By |
|-------|-----------------|------------|-------------------|
| Execution | `packages/execution` | `runRealExecution` returns; collected in `apps/factory-cli/src/run-real-execution.ts:end` | factory-cli post-call |
| Review iter | `packages/review/src/persist-iteration.ts:13-23` (`writeIterationDir`) | Extend persistence interface with `appendPathsRead(iter, record)` | factory-cli persistence implementor |
| Pile (planning/review/exec-coord) | `apps/factory-cli/src/pile-persistence.ts:69` (`writePileArtifacts`) | Add 3rd file alongside result.json + trace.json | factory-cli (already fs-tier) |
| Evaluation | `packages/evaluation-runner/src/run-evaluation-stages.ts` | Stage entry/exit boundary; runner returns record | factory-cli post-call |

**Alternative options the planner may choose instead:**
- (a) Add `pathsRead` to existing `trace.json` for piles + new `execution/trace.json` aggregate — less uniform, smaller blast radius for piles, larger for execution.
- (b) Add `pathsRead?: string[]` to `task-succeeded` journal events (schemaVersion 1.0.0 → 1.1.0) + extend pile trace — schema cascade through `packages/admission-e2e/src/contracts/`.
- (c) **RECOMMENDED** uniform sidecar `pathsRead.json` at every stage boundary — additive, no schema bump on existing artifacts.

### Pattern 2: Dependency Closure Resolver

**Pure function:**
```
resolveCascade(
  editPaths: ReadonlyArray<string>,        // bundle-relative paths edited
  readSets: ReadonlyArray<PathsReadRecord> // every stage's recorded read-set
): {
  cascadedStages: ReadonlyArray<string>;   // ordered: re-execute these
  preservedStages: ReadonlyArray<string>;  // overlay these (unchanged)
}
```

Algorithm: build directed graph stage→stage by joining `pathsRead[].path` against any other stage's outputs (use `runs/<id>/<stagePath>/...` convention). Compute transitive closure of stages whose read-set contains any edited path or any output of an already-cascaded stage. Order topologically by stage type (planning-pile → execution → review → evaluation).

### Pattern 3: Overlay Manifest

**Schema:**
```ts
export interface OverlayManifest {
  readonly schemaVersion: "1.0.0";
  readonly parentRunId: string;
  readonly replayId: string;
  readonly entries: ReadonlyArray<{
    readonly path: string;          // bundle-relative
    readonly originalSha256: string;
    readonly originalBytes: number;
  }>;
}
```

**Resolution rule for `inspect`:** when reading from `replays/<replayId>/`, for any artifact path P:
1. If P exists under `replays/<replayId>/P` → use that (cascaded output).
2. Else if `overlay.json` lists P → resolve to `runs/<parentRunId>/P`, verify `originalSha256`, return.
3. Else → not found.

### Pattern 4: Per-Stage Hash Chain (D-06)

For every stage emitting a `pathsRead.json`:

```
inputsHash  = sha256(canonical(sortJsonValue([{path, sha256} for path in pathsRead])))
outputsHash = sha256(canonical(sortJsonValue(stage's primary output JSON)))
```

Contract test asserts byte-equality of every `(stageInstance, inputsHash, outputsHash)` pair against a recorded fixture for the prefix, and against expected post-edit values for the cascaded suffix.

### Anti-Patterns to Avoid

- **Re-deriving brand from disk file as trust shortcut.** Phase 9 Q-21 lock: `delivery/authorization.json` is *input* to validator, never the brand itself. Replay's two-key delivery MUST follow the same pattern — `replay.allowDelivery` config + `--allow-delivery` flag are inputs to the existing `reAuthorizeFromPayload` validator at `packages/review/src/index.ts:17`, not bypasses.
- **Schema-bumping every existing artifact for read-set.** Triggers cascading version bumps and test fixture re-signing. Sidecar is additive.
- **Mutating original bundle.** D-08 lock — replays are sibling. No write under `runs/<parentRunId>/` outside `replays/`.
- **Hand-rolling canonical JSON.** Use existing `sortJsonValue` from `@protostar/artifacts`.
- **Inlining trace.json contents.** Phase 9 Q-11 lock — inspect references by path; replay overlay also references by path+hash.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canonical JSON serialization | Custom sort | `sortJsonValue` from `@protostar/artifacts` | Already in repo, contract-tested. [VERIFIED: packages/artifacts/src/canonical-json.ts] |
| sha256 hashing | Custom hash | `createHash("sha256")` from `node:crypto` | Built-in; established Phase 2 pattern. |
| Atomic file writes (tmp+rename) | New helper | Same pattern as `pile-persistence.ts:131-145` | Pinned Phase 6 Q-07 pattern; reuse `writeAtomicJson`. |
| Brand pattern (`EditSetHash`, `OverlayManifest`, `CounterfactualReport`) | New mechanism | Phase 1/2 brand pattern: module-private mint via `unique symbol`, internal test-builder subpath, three-layer contract guard | [VERIFIED: packages/delivery/src/delivery-contract.ts:4 `DeliveryAuthorizationContractBrand`] |
| Admission-decision audit log | New format | Reuse `apps/factory-cli/src/admission-decisions-index.ts:formatAdmissionDecisionIndexLine` and `appendAdmissionDecisionIndexEntry` | Phase 2 GOV-05 pattern; `editSetHash`, `parentRunId`, `replayId` fit the existing `AdmissionDecisionIndexEntry` shape with a `replay-delivery` gate name. |
| RunId validation | New regex | `RUN_ID_REGEX` + `parseRunId` + `assertRunIdConfined` from `apps/factory-cli/src/run-id.ts` | Phase 9 Q-19 lock; defense-in-depth path-confinement. |
| Two-key launch posture | New flow | Compose with `apps/factory-cli/src/two-key-launch.ts` (`validateTwoKeyLaunch`, `verifyTrustedLaunchConfirmedIntent`) | Phase 2 Q-11/Q-12 pattern; `--allow-delivery` is the second key, mirroring `--confirmed-intent`. |
| Re-mint delivery authorization | Bypass validator | `reAuthorizeFromPayload` from `@protostar/review` (`packages/review/src/index.ts:17`) | Phase 9 Q-21 lock — validator is the security boundary. [VERIFIED: apps/factory-cli/src/commands/deliver.ts:23] |
| commander subcommand DSL | New parser | `@commander-js/extra-typings` Command class | Phase 9 Q-02 lock. [VERIFIED: apps/factory-cli/src/commands/inspect.ts:99-114] |

**Key insight:** Phase 13 is overwhelmingly *composition* of Phase 1-12 primitives. Almost every novel surface has a precedent — the planner's job is finding the precedent, not inventing alternatives.

## Runtime State Inventory

> Phase 13 is greenfield (additive workspace + additive instrumentation + new CLI verb). Not a rename/refactor/migration. **Section omitted** per template guidance: "Include this section for rename/refactor/migration phases only."

## Common Pitfalls

### Pitfall 1: LLM Nondeterminism on the Cascaded Suffix

**What goes wrong:** D-06 hash-chain asserts byte-equality on `(inputsHash, outputsHash)` for the cascaded suffix. But the cascaded suffix re-executes live (D-05 — "real LLM calls, real subprocesses"). LM Studio temperature, sampling, prompt-cache state, and clock-derived prompt fields make `outputsHash` non-deterministic by default.
**Why it happens:** Real-mode LLM responses include token-level sampling. Even temperature=0 isn't fully deterministic across runtime sessions in many local backends.
**How to avoid:** The Phase 13 regression fixture in `packages/admission-e2e/src/replay/` MUST run under STRESS-07's deterministic mock backend (`Pending` in REQUIREMENTS.md as of 2026-04-26). If STRESS-07 doesn't land first, scope the hash-chain test to the *unchanged prefix* only and document the cascaded suffix as "behavioral assertion (verdict pass/fail) without byte-equality."
**Warning signs:** Fixture passes locally on first run, fails on second run with hash-mismatch on a cascaded stage.

### Pitfall 2: Clock / Env / RNG Drift Across Replays

**What goes wrong:** Stage outputs include timestamps (`createdAt`, `recordedAt`, `mintedAt`) and env-derived fields (workspace path absolutes). Even under deterministic LLM, these drift between original and replay.
**Why it happens:** `new Date().toISOString()` and `process.env` reads inside producer code.
**How to avoid:** Producers must accept injected `nowIso` and `env` (already true for `runRealExecution.nowIso` per `apps/factory-cli/src/run-real-execution.ts:73`). Replay supplies the recorded original timestamps for the unchanged prefix and synthetic deterministic timestamps for the cascaded suffix. For the hash chain, define a *normalized* outputsHash that excludes drift fields (or pin them at replay time).
**Warning signs:** Replays differ only in timestamp fields when diffing artifacts.

### Pitfall 3: Editing Outside the Allowlist Bypassed via JSON Pointer

**What goes wrong:** Operator addresses an edit at `piles/review/iter-2/result.json#/secret_field` where `secret_field` is read by the validator but not part of the documented edit surface.
**Why it happens:** Allowlist enforced on path, but JSON Pointer can target any sub-record.
**How to avoid:** Allowlist enforcement happens after path validation but before JSON Pointer apply. Pile-output validation re-runs after the pointer-edited document is reconstituted (D-04 schema-validate-on-entry catches this — schema must constrain field domains).
**Warning signs:** Edit accepted; replay produces "impossible" downstream verdicts.

### Pitfall 4: Overlay Tampering / Drift in Parent Bundle

**What goes wrong:** Operator edits a file in `runs/<parentRunId>/...` after the replay was created. Overlay manifest's `originalSha256` no longer matches; `inspect` either returns stale or refuses.
**Why it happens:** Original bundle is filesystem-mutable.
**How to avoid:** `inspect` overlay-aware resolver MUST verify `originalSha256` on every overlay-redirected read. Mismatch produces a refusal artifact in the same shape as admission refusals (D-04 pattern).
**Warning signs:** Overlay-mediated `inspect` calls intermittently fail with hash-mismatch.

### Pitfall 5: admission-decisions.jsonl Audit Shape Mismatch (D-12)

**What goes wrong:** D-12 says "audit entry to `admission-decisions.jsonl` with editSetHash, parentRunId, replayId." But existing `AdmissionDecisionIndexEntry` has fixed fields (`gate`, `outcome`, `artifactPath`, `precedenceStatus`).
**Why it happens:** Replay invents a new event shape for a file with a pinned schema.
**How to avoid:** Land replay-delivery audit as a new gate name (`gate: "replay-delivery"`) with replay-specific evidence carried in a per-decision detail file (`replay-delivery-admission-decision.json`) per Phase 2 Q-13 (per-gate filenames, shared base + extension). The `editSetHash`/`parentRunId`/`replayId` go in the detail file; the JSONL line carries `artifactPath` pointing to it.
**Warning signs:** schema test in `packages/authority/src/admission-decision/` fails after wiring.

### Pitfall 6: Phase 12 Wiring Drift

**What goes wrong:** Phase 12 (currently in flight) decomposes `apps/factory-cli/src/main.ts` into `wiring/{command-execution,delivery}.ts`. Phase 13's read-set instrumentation lands write sites in factory-cli; conflicts ensue if Phase 13 plans land before Phase 12 plans.
**Why it happens:** Phase 13 depends on Phase 12 (per ROADMAP.md). main.ts at HEAD has unfinished decomposition.
**How to avoid:** Phase 13 planner MUST verify Phase 12 plans 12-04 through 12-06 are merged before Phase 13 plan-1 starts. Sidecar writes go in the *new* wiring modules where the corresponding stage is invoked.
**Warning signs:** main.ts merge conflicts during Phase 13 execution waves.

## Code Examples

### EditSet Schema (REPLAY-01)

```ts
// packages/replay/src/edit-set/schema.ts
// Source: pattern from packages/intent/src/confirmed-intent.ts; zod from existing Phase 10 lock
import { z } from "zod";

export const EditSchema = z.object({
  // Bundle-relative path; v1 must match the editable allowlist (D-02)
  path: z.string().regex(/^piles\/(planning|review|execution-coordination)\/iter-\d+\/(result|trace)\.json$/),
  jsonPointer: z.string().regex(/^(\/[^/~]*(~[01][^/~]*)*)*$/).optional(),  // RFC 6901
  // Path to the replacement file on disk (resolved relative to operator cwd)
  replacementFile: z.string()
});

export const EditSetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  parentRunId: z.string(),
  edits: z.array(EditSchema).min(1)  // schema allows N; CLI enforces 1 in v1 per D-01
});

export type EditSet = z.infer<typeof EditSetSchema>;
```

### Overlay Manifest (REPLAY-08)

```ts
// packages/replay/src/overlay-manifest/schema.ts
import { z } from "zod";

export const OverlayManifestSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  parentRunId: z.string(),
  replayId: z.string(),
  editSetHash: z.string().regex(/^[0-9a-f]{64}$/),
  entries: z.array(z.object({
    path: z.string(),
    originalSha256: z.string().regex(/^[0-9a-f]{64}$/),
    originalBytes: z.number().int().nonnegative()
  }))
});
export type OverlayManifest = z.infer<typeof OverlayManifestSchema>;
```

### PathsRead Sidecar (REPLAY-05)

```ts
// packages/replay/src/paths-read-record.ts
import { z } from "zod";

export const PathsReadRecordSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  stage: z.enum(["execution", "review", "evaluation", "planning-pile", "review-pile", "exec-coord-pile"]),
  stageInstance: z.string(),
  runId: z.string(),
  recordedAt: z.string().datetime(),
  pathsRead: z.array(z.object({
    path: z.string(),
    jsonPointer: z.string().optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/)
  })),
  inputsHash: z.string().regex(/^[0-9a-f]{64}$/),
  outputsHash: z.string().regex(/^[0-9a-f]{64}$/)
});
export type PathsReadRecord = z.infer<typeof PathsReadRecordSchema>;
```

### manifest.json Replay Extensions (REPLAY-17)

```ts
// Cascade through @protostar/artifacts FactoryRunManifest type
export interface FactoryRunManifestReplayExtensions {
  readonly parentRunId?: string;       // present only in replay manifests
  readonly replayId?: string;
  readonly editSetHash?: string;
  readonly allowDelivery?: boolean;    // default false; D-12
  readonly pathsCascaded?: ReadonlyArray<string>;  // dependency closure (D-05)
}
```

### Counterfactual Report (REPLAY-15)

```ts
// packages/replay/src/counterfactual/schema.ts
import { z } from "zod";

export const CounterfactualReportSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  parentRunId: z.string(),
  replayId: z.string(),
  parentEvaluation: z.object({
    verdict: z.enum(["pass", "fail"]),
    score: z.number()
  }),
  replayEvaluation: z.object({
    verdict: z.enum(["pass", "fail"]),
    score: z.number()
  }),
  delta: z.object({
    verdictChanged: z.boolean(),
    scoreDelta: z.number(),
    cascadedStages: z.array(z.string())
  }),
  evolutionSignal: z.object({
    // consumed by decideEvolution at packages/evaluation-runner/src/run-evaluation-stages.ts:337
    hint: z.enum(["judge-bottleneck", "reviewer-bottleneck", "planning-bottleneck", "no-signal"]),
    confidence: z.number().min(0).max(1)
  })
});
export type CounterfactualReport = z.infer<typeof CounterfactualReportSchema>;
```

### CLI Surface (REPLAY-11/12)

```ts
// apps/factory-cli/src/commands/replay.ts (sketch — mirrors inspect.ts:99-114 pattern)
import { Command } from "@commander-js/extra-typings";
import { ExitCode } from "../exit-codes.js";

export function buildReplayCommand(): Command {
  const command = new Command("replay")
    .description("Replay a recorded run with one or more pile artifacts edited")
    .requiredOption("--run <id>", "parent run id to replay from")
    .option("--replay-id <id>", "explicit replay id (default: auto-generated)")
    .option("--edit <addr=file>", "edit address (path[#json-pointer]=replacement-file); repeatable", collect, [])
    .option("--edit-set <path>", "EditSet manifest file path")
    .option("--allow-delivery", "allow delivery from this replay (requires factory-config replay.allowDelivery=true)")
    .option("--json", "emit JSON output (default)")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (opts) => {
      process.exitCode = await executeReplay(opts);
    });
  return command as unknown as Command;
}
```

### Hook Point: Evolution Counterfactual Ingestion (REPLAY-15)

```ts
// packages/evaluation-runner/src/run-evaluation-stages.ts:337 (existing)
// MODIFY: optionally accept a counterfactual report
// Source: VERIFIED at packages/evaluation-runner/src/run-evaluation-stages.ts:337
return decideEvolution({
  // existing inputs...
  counterfactual: input.counterfactual  // NEW (optional); replay path supplies it
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-read bundle JSON to reason about failed runs | `factory-cli replay` counterfactual | Phase 13 (this) | One-command experiment; eval delta as evolution signal |
| Schema-bumping every artifact for instrumentation | Sidecar `<stage>/pathsRead.json` | Phase 13 (recommended) | Additive; no fixture re-sign cascade |

**Deprecated/outdated:** None — this is greenfield.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | STRESS-07 deterministic mock backend will land before Phase 13 fixture (REPLAY-16) commits, OR fixture scoped to prefix-only hash chain | Common Pitfalls #1 | D-06 hash-chain on cascaded suffix unverifiable; fixture flakes |
| A2 | `decideEvolution` at `packages/evaluation-runner/src/run-evaluation-stages.ts:337` is the right ingestion point for D-14 counterfactual signal | Code Examples / Architectural Map | Wrong hook → counterfactual artifact written but never consumed |
| A3 | Hand-rolled RFC 6901 JSON Pointer is acceptable to operator vs. adding a `json-pointer` dep | Standard Stack | If operator wants the dep route, +1 runtime-dep lock-revision needed in PROJECT.md |
| A4 | Sidecar `<stage>/pathsRead.json` (option c) is the planner's chosen read-set surface | Architecture Patterns | Planner may choose option (a) or (b); if so, schema cascade needed for existing artifacts |
| A5 | `replay-delivery` is an acceptable new `gate` value for `admission-decisions.jsonl` per Phase 2 Q-13's open-ended gate-name policy | Common Pitfalls #5 | If gate enum is closed, schema bump on `AdmissionDecisionIndexEntry` |
| A6 | Phase 12 wiring decomposition (`wiring/{command-execution,delivery}.ts`) lands before Phase 13 plan-1 | Common Pitfalls #6 | Merge conflicts in `apps/factory-cli/src/main.ts` |
| A7 | zod ^3.25.76 is still current per `apps/factory-cli/package.json:64`; no v4 migration needed | Standard Stack | Version skew at install time |
| A8 | No existing `ajv` / `jsonschema` / `json-pointer` deps in repo (verified by grep returning empty) | Standard Stack | Hand-roll instead of dep — already verified |

## Open Questions

1. **Which read-set surface does the planner commit to (sidecar vs schema-bump)?**
   - What we know: three options enumerated; (c) sidecar recommended.
   - What's unclear: whether the operator/planner has appetite for the schema-bump cascade of (a) or (b).
   - Recommendation: planner picks (c) and documents the choice in plan-01 ADR.

2. **Should counterfactual ingestion in `decideEvolution` be a hard signal or soft hint in v1?**
   - What we know: D-14 says "treat as evolution signals (e.g. 'this judge was the bottleneck')."
   - What's unclear: numerical weight; whether a single counterfactual can flip the evolution decision.
   - Recommendation: ship as soft hint with `confidence` field; tune empirically post-Phase-13 dogfood (mirror Phase 8 EVOL-03 calibration pattern).

3. **For the regression fixture (REPLAY-16), does STRESS-07 land first or do we ship prefix-only hash assertions?**
   - What we know: STRESS-07 is `Pending` per REQUIREMENTS.md.
   - What's unclear: STRESS-07 ordering vs Phase 13.
   - Recommendation: if STRESS-07 lands first, full hash chain. Otherwise, prefix-only with documented gap.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Build/test workflow | ✓ | (workspace) | — |
| Node >=22 | All packages | ✓ | (project lock) | — |
| zod ^3.25.76 | EditSet/Overlay/PathsRead/Counterfactual schemas | ✓ | ^3.25.76 [VERIFIED: apps/factory-cli/package.json:64] | — |
| node:crypto | sha256 | ✓ | built-in | — |
| @commander-js/extra-typings | replay subcommand | ✓ | ^14 [VERIFIED: existing inspect.ts uses it] | — |
| LM Studio backend | Cascaded suffix re-execution | [ASSUMED] available | — | Use STRESS-07 deterministic mock for fixture |
| STRESS-07 deterministic mock | Phase 13 regression fixture hash-chain | ✗ (Pending per REQUIREMENTS.md) | — | Scope fixture to prefix-only hash assertions |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:** STRESS-07 deterministic mock — fixture can ship with prefix-only hash chain if STRESS-07 doesn't land first.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` against compiled `dist/*.test.js` (project lock per PROJECT.md) |
| Config file | none — `tsc -b` produces `dist/` per package; test runner takes `dist/*.test.js` glob |
| Quick run command | `pnpm --filter @protostar/replay test` |
| Full suite command | `pnpm run verify` (Phase 12 D-01 unifies local + CI) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REPLAY-01 | EditSet schema parses valid sets, rejects invalid | unit | `pnpm --filter @protostar/replay test` | ❌ Wave 0 |
| REPLAY-02 | Allowlist refuses non-pile paths | unit | `pnpm --filter @protostar/replay test` | ❌ Wave 0 |
| REPLAY-03 | Edit address parser handles `path` and `path#/json/pointer` | unit | `pnpm --filter @protostar/replay test` | ❌ Wave 0 |
| REPLAY-04 | Schema-validate-on-entry refusal artifact shape | contract | `pnpm --filter @protostar/admission-e2e test` (replay/refusal-artifact) | ❌ Wave 0 |
| REPLAY-05 | Each producer emits `pathsRead.json` with correct shape | unit | `pnpm --filter @protostar/{execution,review,evaluation} test` | ❌ Wave 0 |
| REPLAY-06 | Dependency-closure resolver: edit → expected cascade set | unit | `pnpm --filter @protostar/replay test` | ❌ Wave 0 |
| REPLAY-07 | Per-stage hash-chain harness: byte-equal prefix, expected suffix | contract | `pnpm --filter @protostar/admission-e2e test` (replay/hash-chain) | ❌ Wave 0 |
| REPLAY-08 | Overlay manifest write atomic, schema-valid, hash-correct | unit | `pnpm --filter @protostar/factory-cli test` (replay-overlay-writer) | ❌ Wave 0 |
| REPLAY-09 | `inspect` resolves overlay pointers; mismatch produces refusal | contract | `pnpm --filter @protostar/admission-e2e test` (inspect-schema extension) | partial (inspect-schema.contract.test.ts exists) |
| REPLAY-10 | `prune` skips `replays/` even when `--older-than` would match | contract | `pnpm --filter @protostar/factory-cli test` (prune.test) | partial (prune.test.ts exists) |
| REPLAY-11 | `factory-cli replay` registered; `--help` snapshot stable | contract | `pnpm --filter @protostar/admission-e2e test` (cli-help-snapshot-drift) | partial (exists) |
| REPLAY-12 | `--edit` and `--edit-set` parse correctly; multi-edit refused in v1 | unit | `pnpm --filter @protostar/factory-cli test` (replay.test) | ❌ Wave 0 |
| REPLAY-13 | Two-key delivery: both keys → allowed; either missing → refused; audit appended | contract | `pnpm --filter @protostar/admission-e2e test` (replay/two-key-delivery) | ❌ Wave 0 |
| REPLAY-14 | Admission re-fire contract for v2 expansion (test pinned but unreachable in v1) | contract | `pnpm --filter @protostar/admission-e2e test` (replay/admission-re-fire) | ❌ Wave 0 |
| REPLAY-15 | counterfactual.json schema valid; `decideEvolution` consumes it | contract + unit | `pnpm --filter @protostar/{evaluation-runner,replay} test` | ❌ Wave 0 |
| REPLAY-16 | edit→replay→pass and edit→replay→still-fail fixtures hash-stable | regression | `pnpm --filter @protostar/admission-e2e test` (replay/regression-fixture) | ❌ Wave 0 |
| REPLAY-17 | manifest.json replay extensions schema | contract | `pnpm --filter @protostar/admission-e2e test` (manifest-replay-extensions) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @protostar/replay test` (replay package only — fastest signal)
- **Per wave merge:** `pnpm --filter @protostar/{replay,admission-e2e,factory-cli,execution,review,evaluation,evaluation-runner} test`
- **Phase gate:** `pnpm run verify` (full suite per Phase 12 D-01) green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/replay/` — entire workspace scaffold + tier=pure manifest + no-fs.contract.test.ts + tsconfig refs
- [ ] `packages/replay/src/{edit-set,json-pointer,schema-registry,dependency-closure,overlay-manifest,hash-chain,counterfactual,paths-read-record}/*.ts`
- [ ] `packages/admission-e2e/src/replay/` — fixture parent bundle + edit-set fixtures + 2 contract tests (REPLAY-16)
- [ ] `apps/factory-cli/src/commands/replay.{ts,test.ts}` — new command module (REPLAY-11/12)
- [ ] `apps/factory-cli/src/replay-overlay-writer.{ts,test.ts}` — atomic writer (REPLAY-08)
- [ ] `apps/factory-cli/src/replay-paths-read-writer.{ts,test.ts}` — sidecar writer (REPLAY-05)
- [ ] Read-set instrumentation in `packages/{execution,review,evaluation}/src/` — additive call sites (REPLAY-05)
- [ ] `packages/evaluation-runner/src/run-evaluation-stages.ts:337` modification for D-14 ingestion (REPLAY-15)
- [ ] `apps/factory-cli/src/main.ts` register `buildReplayCommand()` on dispatcher
- [ ] PROJECT.md Constraints lock revision: new workspace `@protostar/replay` (no new runtime deps)
- [ ] tier-conformance contract test extension to assert `@protostar/replay` is `pure`

## Security Domain

> `security_enforcement` is enabled by default per template. Phase 13 introduces an operator-supplied edit surface; this is a non-trivial trust boundary.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (delivery audit, parent run binding) | sha256 `editSetHash` + parentRunId in `admission-decisions.jsonl` (D-12) |
| V3 Session Management | no | — |
| V4 Access Control | yes (D-12 two-key delivery) | `replay.allowDelivery` config + `--allow-delivery` flag both required; mirrors Phase 2 Q-11 two-key launch |
| V5 Input Validation | **yes (load-bearing)** | zod schemas (EditSet, Overlay, PathsRead, Counterfactual); RFC 6901 JSON Pointer regex; D-04 schema-validate-on-entry; existing `RUN_ID_REGEX` + `assertRunIdConfined` for runId path-confinement |
| V6 Cryptography | yes (hash chain, editSetHash, overlay hashes) | `node:crypto` sha256; canonical JSON via existing `sortJsonValue`; never hand-roll |

### Known Threat Patterns for Phase 13

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Edit-address path traversal (e.g., `../../../etc/passwd`) | Tampering | RFC 6901 grammar regex on JSON Pointer; allowlist regex on bundle-relative path; `path.resolve` confinement against `runs/<id>/` (mirror Phase 9 Q-19 `assertRunIdConfined` pattern) |
| Schema-bypass via JSON Pointer | Tampering | D-04 schema-validate-on-entry runs after pointer-edited document is reconstituted; refuse on schema fail (no `--force` per CONTEXT deferred) |
| Overlay tampering / parent bundle drift | Tampering | sha256 verification on every overlay-redirected read; refusal artifact on mismatch |
| Replay used to deliver a malicious edit | Elevation of Privilege | D-12 two-key gate: config + flag; admission-decisions.jsonl audit with editSetHash; `reAuthorizeFromPayload` validator (Phase 9 Q-21) is still the security boundary |
| Operator slips delivery via env-var to bypass `--allow-delivery` flag | EoP | Flag is required *literally* on argv, not via env (commander DSL — no `env: true` option); contract test pins absence of env-var fallback |
| Hash-chain false-positive (collision) | Tampering / Repudiation | sha256 collision-resistance is sufficient (Phase 2 Q-15 lock); not in attacker model |
| Replay re-runs admission gates against an edited admission-input artifact in v2 | Tampering | D-13 contract pinned now; gates re-fire and refusal artifacts emitted; v1 unreachable since D-02 forbids editing admission-input artifacts |
| Information disclosure via replay's overlay-resolved reads to non-allowlisted paths | Information Disclosure | inspect's overlay resolver respects same allowlist as the original inspect; no new disclosure surface |

## Sources

### Primary (HIGH confidence — verified in code this session)

- `apps/factory-cli/src/commands/inspect.ts:64-78, 99-114, 158-190` — pattern for new `replay.ts` command + artifact spec table extension
- `apps/factory-cli/src/commands/prune.ts:51-58, 211-243` — active-status guard pattern + skip predicate site
- `apps/factory-cli/src/pile-persistence.ts:7-12, 69-99, 131-145` — pile artifact write site + atomic tmp+rename pattern (sidecar writes co-locate here)
- `apps/factory-cli/src/admission-decisions-index.ts:9-29` — admission audit log shape
- `apps/factory-cli/src/two-key-launch.ts:12-45` — two-key launch pattern for D-12
- `apps/factory-cli/src/run-id.ts` — `RUN_ID_REGEX`, `assertRunIdConfined` pattern (Phase 9 Q-19)
- `apps/factory-cli/src/run-real-execution.ts:31-73` — execution stage hook for D-07 read-set
- `apps/factory-cli/src/commands/deliver.ts:23, 121` — `reAuthorizeFromPayload` seam composition
- `packages/review/src/index.ts:17` — `reAuthorizeFromPayload` export confirmed
- `packages/review/src/persist-iteration.ts:13-23` — review iter hook for D-07 read-set
- `packages/execution/src/journal-types.ts:14-41` — journal event shape (option (b) for read-set)
- `packages/evaluation-runner/src/run-evaluation-stages.ts:21, 337` — `decideEvolution` ingestion point for D-14
- `packages/artifacts/src/canonical-json.ts` + `index.ts:3` — `sortJsonValue` confirmed
- `packages/delivery/src/authorization-payload.ts:1-44` — payload-as-validator-input pattern
- `packages/delivery/src/delivery-contract.ts:4` — brand pattern (`unique symbol`)

### Secondary (MEDIUM confidence — pattern carried forward from prior phase contexts)

- `.planning/phases/09-operator-surface-resumability/09-CONTEXT.md` Q-07/Q-08/Q-10/Q-11/Q-21 — bundle layout, atomic writes, inspect path-indexed shape, brand-mint validator pattern
- `.planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md` D-14 — wiring decomposition target (Phase 13 must follow new wiring/ structure)
- `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` Q-11/Q-13/Q-14 — two-key launch, per-gate admission-decision shape, JSONL index
- `.planning/PROJECT.md` Constraints — minimal runtime deps; ESM-only; node:test
- `apps/factory-cli/package.json:64` — zod ^3.25.76 verified

### Tertiary (LOW confidence — flagged for validation in Assumptions Log)

- STRESS-07 deterministic mock backend ordering vs Phase 13 (per REQUIREMENTS.md `Pending`)
- Whether `decideEvolution` is the right hook for D-14 vs a sibling helper in `@protostar/evaluation`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every recommended library/version verified against package.json or grep
- Architecture (sidecar pattern): MEDIUM — three options enumerated; (c) recommended but planner picks
- Pitfalls: HIGH — STRESS-07 dep, Phase 12 wiring drift, audit shape mismatch all verified against code/docs
- Security domain: HIGH — every threat maps to existing project pattern

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days for stable; revisit if Phase 12 finishes mid-window)
