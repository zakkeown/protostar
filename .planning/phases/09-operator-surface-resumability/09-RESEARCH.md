# Phase 9: Operator Surface + Resumability — Research

**Researched:** 2026-04-28
**Domain:** CLI operator surface, subcommand dispatch, resumable execution, JSON-stable IO
**Confidence:** HIGH (CONTEXT is exhaustive; primary research is verifying code surfaces the planner will touch)

## Summary

Phase 9 is mostly settled by `09-CONTEXT.md` — 22 power-mode locks covering router refactor, library choice (`commander`), exit-code taxonomy, stdout discipline, status/inspect schemas, resume semantics, cancel mechanism, manifest enum bump, and prune safety. Research scope is therefore narrowly empirical: confirm the existing code surfaces match CONTEXT's assumptions, identify discrepancies the planner must reconcile, and pin library versions.

Two findings warrant the planner's attention before plan-1: **(1)** `mintDeliveryAuthorization` lives in `@protostar/review`, not `@protostar/delivery`, and is currently an INTERNAL stamp `{runId, decisionPath} → DeliveryAuthorization` — NOT a heavyweight validator over `ReviewGate` as the CONTEXT prose suggests. Q-21's "re-mint via the validator" is a re-validation pattern the planner must design, not just a re-call of an existing function. **(2)** main.ts is 3,126 LoC with `parseArgs` at line 2836, `setFactoryRunStatus` import at line 10 with the load-bearing call at line 1295, the `'ready-to-release'` literal returned at line 1528 (`statusForReviewVerdict`), and `installCancelWiring` at line 755. This concentrated surface is what plan-1 (no-op router refactor) extracts.

**Primary recommendation:** Plan-1 is a behavior-preserving extraction of `parseArgs` + `runFactory` body into `commands/run.ts` behind a `commander` root program in `main.ts`; ALL Phase 9 contract additions (exit codes, io.ts, run-id.ts, FactoryRunStatus enum bump, sortJsonValue lift) ship as small precursor plans before any new subcommand lands.

## User Constraints (from CONTEXT.md)

### Locked Decisions

All 22 questions in `09-QUESTIONS.json` are answered in `--power` mode. Verbatim from `09-CONTEXT.md`:

- **Q-01 Router:** Per-command modules under `apps/factory-cli/src/commands/`. Each exports `parse(rest) → ParsedArgs` and `execute(opts) → Promise<ExitCode>`. main.ts is a thin dispatcher.
- **Q-02 Parser library:** `commander@^14` + `@commander-js/extra-typings@^14`. Amend PROJECT.md Constraints with runtime-dep lock entry.
- **Q-03 Exit codes:** Curated taxonomy in `apps/factory-cli/src/exit-codes.ts` as a `const` object: `0 success | 1 generic-error | 2 usage-or-arg-error | 3 not-found | 4 conflict | 5 cancelled-by-operator | 6 not-resumable`. Locked via snapshot test.
- **Q-04 stdout vs stderr:** Strict — stdout is data only (single JSON value or empty); stderr is everything else. New `apps/factory-cli/src/io.ts` exports `writeStdoutJson` + `writeStderr`.
- **Q-05 status default:** Human table by default; `--json` opt-in. Both shapes are public contracts.
- **Q-06 status default N:** 25. `--all` and `--since <duration>` flags. `parseDuration` shared with prune lives in `apps/factory-cli/src/duration.ts`.
- **Q-07 Status row schema:** Tiered. `StatusRowMinimal = {runId, archetype, verdict, durationMs}`; `StatusRowFull = {runId, archetype, status, reviewVerdict, evaluationVerdict, lineageId, generation, prUrl?, durationMs, createdAt}`. Both locked via snapshot.
- **Q-08 Run discovery:** Directory scan via readdir+stat sorted by mtime; no top-level index. `apps/factory-cli/src/run-discovery.ts` exports `listRuns({limit, since, all})`.
- **Q-09 Liveness:** Compute from journal-append recency + sentinel. New `apps/factory-cli/src/run-liveness.ts` exports `computeRunLiveness`. Default threshold 60_000 ms via `factory-config.json operator.livenessThresholdMs`.
- **Q-10 Inspect default:** Manifest + path-indexed artifacts array `{stage, kind, path, sha256?}` plus `summary` string. Bounded output.
- **Q-11 Trace inclusion:** Always reference, never inline. sha256 emitted; no `--include-traces` flag.
- **Q-12 Canonicalization:** Lift `sortJsonValue` from `packages/execution/src/snapshot.ts` to a shared util. Suggested location: `packages/artifacts/src/canonical-json.ts`. Re-export from execution for back-compat. All Phase 9 stdout JSON canonicalizes keys.
- **Q-13 Resume stages:** Stage-aware. Mid-execution → `replayOrphanedTasks`. Mid-pile → re-invoke pile from `iter-(N+1)`. Non-resumable manifest state → exit 6.
- **Q-14 Re-execution:** Replay orphaned tasks only via Phase 4 helper. No `--from <taskId>` in v0.1.
- **Q-15 Sentinel on resume:** `manifest.status === 'cancelled'` → exit 4. Transient sentinel + non-cancelled status → auto-unlink via `unlinkSentinelOnResume` and proceed.
- **Q-16 Cancel mechanism:** Sentinel + manifest mark. Atomic-write manifest to `'cancelling'`, then touch `runs/<id>/CANCEL`. Run loop's existing sentinel check transitions to `'cancelled'`.
- **Q-17 Cancel-already-finished:** Refuse with exit 4. JSON payload `{runId, error: 'already-terminal', terminalStatus}` to stdout.
- **Q-18 FactoryRunStatus enum:** Add `'cancelling'`, `'cancelled'`, `'orphaned'`. Full set: `'created' | 'running' | 'cancelling' | 'cancelled' | 'orphaned' | 'blocked' | 'repairing' | 'ready-to-release' | 'completed'`.
- **Q-19 runId validation:** Both regex `^[a-zA-Z0-9_-]{1,128}$` (parse, exit 2) AND path-confinement check (execute, exit 2). Branded `RunId` type. New `apps/factory-cli/src/run-id.ts`.
- **Q-20 Deliver scope:** Both gated mode (`factory-config.json delivery.mode: 'auto' | 'gated'`, default `'auto'`) and idempotent retry. CLI override `--delivery-mode <auto|gated>`.
- **Q-21 Authority loading for deliver:** Persist `runs/<id>/delivery/authorization.json` (validator INPUTS, not the brand) at `'ready-to-release'`. `deliver` re-reads and re-mints via the Phase 5 brand-mint validator. New `packages/delivery/src/authorization-payload.ts` for the payload schema.
- **Q-22 Prune surface:** Full subcommand `prune --older-than <duration> [--dry-run] [--archetype X] [--confirm]`. Default `--dry-run`. Active-status guard refuses non-terminal runs. Workspace-level append-only files (`.protostar/refusals.jsonl`, `.protostar/evolution/{lineageId}.jsonl`) are NEVER touched.

### Claude's Discretion

CONTEXT delegated NO decisions to discretion — all 22 are locked. Planner's discretion is limited to:
- Plan ordering within the constraints already documented in CONTEXT's "Note for planner" sections.
- Test naming and per-command unit-test fixture shape.
- Internal helper factoring within each `commands/<name>.ts` module.

### Deferred Ideas (OUT OF SCOPE)

- `.protostar/runs.jsonl` index (revisit Phase 10 if scan latency degrades).
- `--from <taskId>` resume escape hatch (Phase 10+).
- Manifest writer for `running → orphaned` background transition (v1.0).
- `trace` subcommand (Phase 10 / v1.0).
- TUI / `status --watch` (v1.0+).
- Cross-host PID-file cancel (deferred forever unless multi-host lands).
- Empirical `livenessThresholdMs` calibration (Phase 10 dogfood).
- Composite/full `--include-artifacts` inspect (v1.0).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OP-01 | `protostar-factory run` from draft or confirmed intent | Existing `runFactory` in main.ts (line 233) is the body; plan-1 extracts to `commands/run.ts` behind `commander`. |
| OP-02 | `protostar-factory status [--run <runId>]`, last N runs with verdict + archetype + duration | `listRuns` (Q-08) + tiered schema (Q-07) + `computeRunLiveness` (Q-09). |
| OP-03 | `protostar-factory resume <runId>` from last journal entry | Phase 4 surface confirmed: `replayOrphanedTasks` (orphan-replay.ts:13) + `reduceJournalToSnapshot` + `serializeSnapshot` (snapshot.ts:10,14) all live in `packages/execution` and are exported from index.ts. Pile resume increments `iter-<N>`. |
| OP-04 | `protostar-factory cancel <runId>` cooperative cancel | `cancel.ts` exports `installCancelWiring` returning `{rootController, checkSentinelBetweenTasks, unlinkSentinelOnResume}` — confirmed exact shape. Cancel command writes sentinel + manifest mark from a separate process; run loop's existing wiring detects sentinel. |
| OP-05 | `protostar-factory inspect <runId>` JSON | New `commands/inspect.ts`; walks run dir with allowlist of artifact kinds. Trace files sha256-hashed but never inlined. |
| OP-06 | `protostar-factory deliver <runId>` explicit trigger | Two modes (gated + retry). Re-mints DeliveryAuthorization via Phase 5 brand stamp. ⚠ See Pitfall 1 below — current mint signature is simpler than CONTEXT prose suggests. |
| OP-07 | Status/inspect output is JSON-stable + pipeable | `sortJsonValue` lift (Q-12) + `writeStdoutJson` discipline (Q-04) + admission-e2e snapshot tests for every public schema. |
| OP-08 | Documented prune recipe OR `prune` subcommand | Q-22 ships the subcommand. Active-status guard + dry-run default + workspace-level JSONL preservation. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Argv parsing / dispatch | apps/factory-cli (orchestration) | — | Operator surface is fs+net authority tier; `commander` lives here. |
| stdout JSON discipline | apps/factory-cli | packages/artifacts (canonical-json) | IO is at the orchestration tier; canonicalization is pure → lifted into artifacts. |
| Run discovery (readdir/stat) | apps/factory-cli | — | Filesystem authority lives here per AGENTS.md. |
| Liveness compute | apps/factory-cli | — | Reads journal + sentinel; same authority. |
| runId validation (regex+confinement) | apps/factory-cli | — | Defense-in-depth at parse + execute layers; both inside factory-cli. |
| Manifest enum bump | packages/artifacts | — | `FactoryRunStatus` is a public schema in artifacts. |
| Resume stage dispatch | apps/factory-cli | packages/execution (replay helpers) | Composition lives at orchestration; primitives are pure. |
| Cancel sentinel write | apps/factory-cli | — | New process writing into a run dir; same fs authority. |
| Cancel sentinel detection | apps/factory-cli (existing cancel.ts) | — | Already correctly placed. |
| DeliveryAuthorization re-mint | apps/factory-cli (caller) | packages/review (brand mint), packages/delivery (payload type) | Mint stays in review; payload schema in delivery; orchestration in factory-cli. |
| Delivery network call | packages/delivery-runtime | — | Network-only tier per AGENTS.md. |
| Prune fs deletion | apps/factory-cli | — | fs authority lives here. |
| Active-status guard for prune | apps/factory-cli | packages/artifacts (status enum source) | Guard logic in cli; enum imported from artifacts. |

## Standard Stack

### Core (verified)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | `14.0.3` (latest as of 2026-04-28) `[VERIFIED: npm view commander version → 14.0.3]` | Subcommand DSL, `--help` generation, exit-on-error suppression | De facto Node CLI standard; mature; `--help` output is auditable as a public contract. |
| `@commander-js/extra-typings` | `14.0.0` `[VERIFIED: npm view @commander-js/extra-typings version → 14.0.0]` | Inferred TS types for command options/args | Removes hand-written option-shape types; locked alongside commander. |

**Format note:** Both packages are CommonJS-typed in package.json (`"type": "commonjs"`) `[VERIFIED: npm view commander@14 type]` but ship dual exports usable from ESM. `import { Command } from "commander"` works in factory-cli's ESM build. `[ASSUMED: dual-export based on Commander 12+ pattern; planner should verify by running build]`.

### Supporting (in-tree)

| Asset | Location | Purpose | When to Use |
|-------|----------|---------|-------------|
| `replayOrphanedTasks` | `packages/execution/src/orphan-replay.ts:13` | Compute orphan task set from journal snapshot | Q-14 mid-execution resume. `[VERIFIED: grep]` |
| `reduceJournalToSnapshot` | `packages/execution/src/snapshot.ts:14` | Fold journal events to snapshot | Q-13/Q-14. Exported from `packages/execution/src/index.ts:14`. `[VERIFIED]` |
| `serializeSnapshot` | `packages/execution/src/snapshot.ts:10` | Canonical-stringify a snapshot | Reused as the precedent for canonical JSON. `[VERIFIED]` |
| `sortJsonValue` | `packages/execution/src/snapshot.ts:69` (currently `function`, not exported) | Recursive key-sort | **MUST be lifted to a shared package per Q-12. Currently NOT exported — confirmed via grep.** `[VERIFIED]` |
| `installCancelWiring` | `apps/factory-cli/src/cancel.ts:11` | Per-run cancel surface | Wraps SIGINT + sentinel detection; returns `{rootController, checkSentinelBetweenTasks, unlinkSentinelOnResume, dispose}`. `[VERIFIED]` |
| `mintDeliveryAuthorization` | `packages/review/src/delivery-authorization.ts:24` | Brand-stamp authorization | ⚠ Current signature is `(input: {runId, decisionPath}) → DeliveryAuthorization` — a thin brand stamp marked INTERNAL via comment ("only call from runReviewRepairLoop"). Q-21 will need to either expose a new validator entrypoint OR loosen the internal marker. `[VERIFIED]` |
| `setFactoryRunStatus` | `packages/artifacts/src/index.ts:80` | Mutate manifest status | Existing call site in main.ts:1295. Update for new enum values per Q-18. `[VERIFIED]` |
| `FactoryRunStatus` | `packages/artifacts/src/index.ts:4` | Public enum (current 6 values) | Phase 9 extends to 9 values per Q-18. `[VERIFIED]` |
| `executeDelivery` | `packages/delivery-runtime` | Octokit PR create + push | Phase 7 surface; deliver command invokes (no duplication). `[CITED: CONTEXT canonical_refs]` |

### Alternatives Considered (and rejected per CONTEXT)

| Instead of | Could Use | Why CONTEXT rejected |
|------------|-----------|----------|
| `commander` | `mri`, `arg`, hand-rolled | Bundle-size savings false economy; subcommand DSL is the load-bearing piece. (Q-02) |
| Sentinel + manifest mark | PID-file + SIGTERM | Stale PIDs, cross-host invalidation, signal-handler races — wrong tradeoff for v0.1. (Q-16) |
| TS `enum ExitCode` | `const ExitCode = {...}` | Avoid runtime enum baggage; const object idiom matches the codebase. (Q-03) |
| `runs.jsonl` index | Directory scan | Zero write-side coupling; v0.1 scale fits readdir+stat. (Q-08) |

**Installation (plan-1):**
```bash
pnpm --filter @protostar/factory-cli add commander@14.0.3 @commander-js/extra-typings@14.0.0
```
(Exact pin per PROJECT.md Constraints lock posture.)

## Architecture Patterns

### System Architecture Diagram

```
        argv ─────────────────────────────────────────────┐
                                                          ▼
                                            main.ts (thin dispatcher)
                                                          │
                                                          │ commander root.parseAsync
                                                          ▼
                ┌──────────┬──────────┬───────┬────────┬──────────┬─────────┬────────┐
                ▼          ▼          ▼       ▼        ▼          ▼         ▼        ▼
           commands/run  status   resume  cancel   inspect    deliver   prune    --help
                │          │        │       │        │          │         │        │
                │          │        │       │        │          │         │        ▼
                │          │        │       │        │          │         │   stderr (commander)
                │          │        │       │        │          │         │
                │          │        │       │        │          │         └─→ listRuns + active-guard + fs.rm
                │          │        │       │        │          │
                │          │        │       │        │          └─→ load authorization.json + re-mint via review + delivery-runtime.executeDelivery
                │          │        │       │        │
                │          │        │       │        └─→ readdir(runs/<id>/) + sha256(traces) + writeStdoutJson
                │          │        │       │
                │          │        │       └─→ atomic-write manifest 'cancelling' + touch CANCEL sentinel
                │          │        │
                │          │        └─→ read manifest + computeRunLiveness + replayOrphanedTasks OR pile iter+1
                │          │
                │          └─→ listRuns + per-row liveness + render (table OR JSON via writeStdoutJson)
                │
                └─→ existing runFactory body (NO BEHAVIOR CHANGE in plan-1)
                       │
                       └─→ existing run loop → installCancelWiring → setFactoryRunStatus(...)
                                                                              │
                                                                              ▼
                                                              packages/artifacts (FactoryRunStatus enum)
```

Every command's `execute` returns `ExitCode`. main.ts contains exactly ONE `process.exit(code)` call site at the dispatcher.

stdout flow: command builds value → `writeStdoutJson(value)` → `sortJsonValue` → `JSON.stringify` → single `process.stdout.write(...+"\n")`.
stderr flow: progress, banners, validator errors → `writeStderr(line)` → `process.stderr.write(line+"\n")`.

### Recommended File Structure (consistent with AGENTS.md domain-first)

```
apps/factory-cli/src/
├── main.ts                        # Thin: build root program, route, dispatch, exit
├── commands/
│   ├── run.ts                     # Plan-1 extraction (no behavior change)
│   ├── status.ts                  # Plan-N
│   ├── resume.ts
│   ├── cancel.ts                  # NEW command file (does NOT replace cancel.ts wiring)
│   ├── inspect.ts
│   ├── deliver.ts
│   └── prune.ts
├── exit-codes.ts                  # Q-03
├── io.ts                          # Q-04 / Q-12: writeStdoutJson, writeStderr
├── run-id.ts                      # Q-19: RUN_ID_REGEX, parseRunId, assertRunIdConfined, RunId brand
├── run-discovery.ts               # Q-08: listRuns
├── run-liveness.ts                # Q-09: computeRunLiveness
├── duration.ts                    # Q-06/Q-22: parseDuration
├── cancel.ts                      # EXISTING — installCancelWiring (in-process). Untouched.
└── (... existing files ...)

packages/artifacts/src/
├── index.ts                       # FactoryRunStatus enum bumped per Q-18
└── canonical-json.ts              # NEW: sortJsonValue (lifted from execution per Q-12)

packages/execution/src/
└── snapshot.ts                    # sortJsonValue removed; re-exported from canonical-json or replaced

packages/delivery/src/
└── authorization-payload.ts       # NEW (Q-21): pure types for the persisted validator inputs
```

⚠ Naming collision: there's already an `apps/factory-cli/src/cancel.ts` (the Phase 6 cancel-wiring file). The new cancel **command** lives in `apps/factory-cli/src/commands/cancel.ts`. The planner must call this out explicitly to avoid grep confusion.

### Pattern 1: commander v14 + extra-typings subcommand

```typescript
// Source: [CITED: commander docs https://github.com/tj/commander.js]
import { Command } from "@commander-js/extra-typings";

export function buildStatusCommand(): Command {
  return new Command("status")
    .description("Show recent runs or a single run")
    .option("--run <runId>", "show a single run")
    .option("--limit <n>", "limit row count", "25")
    .option("--all", "ignore --limit")
    .option("--since <duration>", "only runs newer than duration (e.g. 24h, 7d)")
    .option("--json", "emit JSON instead of human table")
    .option("--full", "include full row schema (lineage, evaluation, prUrl)")
    .exitOverride()      // critical: do NOT call process.exit on parse error
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),       // --help to stderr per Q-04
      writeErr: (str) => process.stderr.write(str),
    })
    .action(async (opts) => {
      const code = await statusExecute(opts);
      process.exitCode = code;     // dispatcher reads this
    });
}
```

Key configuration points (all required for Q-04 compliance):
1. `.exitOverride()` — commander throws `CommanderError` instead of calling `process.exit`, so the dispatcher controls exit codes.
2. `.configureOutput({writeOut, writeErr})` — `--help` text goes to stderr, not stdout (stdout is data only).
3. `process.exitCode` (not `process.exit`) — let the dispatcher centralize the single exit call.

### Pattern 2: writeStdoutJson canonical write

```typescript
// New apps/factory-cli/src/io.ts
import { sortJsonValue } from "@protostar/artifacts/canonical-json"; // after Q-12 lift

export function writeStdoutJson(value: unknown): void {
  const canonical = sortJsonValue(value);
  process.stdout.write(JSON.stringify(canonical) + "\n");
}

export function writeStderr(line: string): void {
  process.stderr.write(line + "\n");
}
```

### Pattern 3: branded RunId (matches Phase 5 mint pattern)

```typescript
// New apps/factory-cli/src/run-id.ts
export const RUN_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const RunIdBrand: unique symbol = Symbol("RunId");
export type RunId = string & { readonly [RunIdBrand]: true };

export function parseRunId(input: string):
  | { ok: true; value: RunId }
  | { ok: false; reason: string }
{
  if (!RUN_ID_REGEX.test(input)) {
    return { ok: false, reason: `runId ${JSON.stringify(input)} does not match ${RUN_ID_REGEX}` };
  }
  return { ok: true, value: input as RunId };
}

export function assertRunIdConfined(runsRoot: string, runId: RunId): void {
  const resolved = path.resolve(runsRoot, runId);
  const rootResolved = path.resolve(runsRoot) + path.sep;
  if (!resolved.startsWith(rootResolved)) {
    throw new Error(`runId ${runId} resolves outside runs root`);
  }
}
```

### Anti-Patterns to Avoid

- **Calling `process.exit()` from inside a command's `execute()`.** Return `ExitCode` and let the dispatcher exit. Otherwise tests cannot assert on exit codes without forking.
- **`console.log()` for progress.** Violates Q-04. Use `writeStderr`.
- **Trusting `delivery/authorization.json` as the brand.** Q-21: the file is validator INPUT, not the brand. Always re-mint.
- **Adding `runs.jsonl` index "while we're here".** Q-08 explicitly defers; coupling write-side to the run loop adds partial-write failure modes.
- **Inlining trace.json in inspect.** Q-11 forbids; sha256-reference only.
- **Hand-rolling YAML/JSON-stable output.** Q-12 lifts the existing `sortJsonValue`; do not write a parallel canonicalizer.
- **Touching `.protostar/refusals.jsonl` or `.protostar/evolution/{lineageId}.jsonl` from prune.** Append-only invariant from Phase 6 Q-12 / Phase 8 Q-14.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Subcommand routing + `--help` | A custom switch on argv[2] | `commander` v14 | Six commands × multiple flags is too much hand-rolled boilerplate; commander gives free `--help` and consistent error messages. |
| Canonical JSON | A new `canonical-json` per call site | Lift the existing `sortJsonValue` (Q-12) | One source of truth ⇒ byte-stability across phases. |
| Orphan-task replay | A new replay helper | `replayOrphanedTasks` from packages/execution | Phase 4 already shipped this exactly for resume. |
| Sentinel detection | New file-watch logic | Existing `checkSentinelBetweenTasks` in cancel.ts | Already wired into the run loop. |
| DeliveryAuthorization brand | Re-create the brand from a serialized payload | Re-mint via `mintDeliveryAuthorization` (Phase 5) | The brand is a security boundary; serializing+trusting it is privilege escalation. |
| Duration parsing | A new parser per command | Shared `parseDuration` in `apps/factory-cli/src/duration.ts` | Status (Q-06) and prune (Q-22) both need it. |
| readdir+stat run listing | Per-command duplications | Shared `listRuns` in `run-discovery.ts` | Status, prune, and inspect all enumerate. |
| Run liveness derivation | Per-command logic | Shared `computeRunLiveness` in `run-liveness.ts` | Status and resume (cancel-distinguishing) both consume. |

**Key insight:** Phase 9 looks like a lot of new code. The discipline is to ship six small shared utilities once and have each command be ≤200 LoC of composition.

## Runtime State Inventory

(Phase 9 is greenfield surface; included for the manifest schema bump only.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `FactoryRunStatus` literal values appear in existing `runs/<id>/manifest.json` files on operator machines. Adding `'cancelling' \| 'cancelled' \| 'orphaned'` is additive — no historical run will have those values. | Code edit only. No data migration. New runs may write the new values; old run readers must tolerate them (they already do via TS union). |
| Live service config | None. | None. |
| OS-registered state | None. (`installCancelWiring` registers a SIGINT handler at process start, not OS-level.) | None. |
| Secrets/env vars | None. (Delivery PAT lives in env per Phase 7; not changed here.) | None. |
| Build artifacts | TypeScript dist for `@protostar/artifacts` will need rebuild after FactoryRunStatus widens; downstream packages (`execution`, `review`, `factory-cli`) recompile on `pnpm run verify`. | `pnpm run verify` after Q-18 plan. |

## Common Pitfalls

### Pitfall 1: Q-21's "validator" is not a heavyweight function in current code

**What goes wrong:** Planner reads CONTEXT Q-21 ("re-mint via the Phase 5 brand-mint validator") and looks for `validateAndMintDeliveryAuthorization(reviewGate)` or similar — does not exist.
**Why it happens:** The actual code at `packages/review/src/delivery-authorization.ts:24` is a 5-line brand stamp `mintDeliveryAuthorization({runId, decisionPath}) → DeliveryAuthorization`, marked `// INTERNAL: only call from runReviewRepairLoop on approved exit (Plan 05-10).` The "validation" Q-21 references is the *path* through `runReviewRepairLoop` that decides whether to mint at all (mechanical pass + model pass).
**How to avoid:** The planner's deliver-command plan must (a) decide whether to **expose** a new validator entrypoint in `packages/review` that re-runs the gate-pass check against a persisted ReviewGate snapshot, OR (b) document that `runs/<id>/review-decision.json` (already written by Plan 05-10 at line 1295 in main.ts via `setFactoryRunStatus(...)` + the review-decision artifact) IS the validator output and re-minting requires only re-reading it + re-stamping the brand. **Option (b) matches the existing code minimally; option (a) is more defensible long-term.** Recommend the planner pick (b) for v0.1 and lock (a) as a Phase 10 follow-up.
**Warning signs:** A plan that says "call `validateDeliveryAuthorization(reviewGate)`" — that function does not exist; flag for redesign.

### Pitfall 2: `sortJsonValue` is currently NOT exported

**What goes wrong:** Planner assumes Q-12's "lift" is a simple re-export; tries to import from `@protostar/execution` and gets nothing.
**Why it happens:** `function sortJsonValue` at `packages/execution/src/snapshot.ts:69` is module-private. Only `serializeSnapshot` (which calls it) is exported.
**How to avoid:** The Q-12 lift plan must (1) move the function to `packages/artifacts/src/canonical-json.ts` AND export it, (2) update `serializeSnapshot` in `packages/execution/src/snapshot.ts` to import the new location, (3) ensure no behavior change to `serializeSnapshot` callers. Add a contract test that round-trips an arbitrary JSON value through the new and old paths and asserts byte-equality.
**Warning signs:** A plan that imports `sortJsonValue` from anywhere before plan-N (the lift plan) lands.

### Pitfall 3: commander's default `process.exit` swallows ExitCode taxonomy

**What goes wrong:** Without `.exitOverride()`, commander calls `process.exit(1)` on `--help` (after printing) and on any parse error. Q-03's `2 usage-or-arg-error` is then unreachable.
**Why it happens:** Commander defaults to terminating the process on its own.
**How to avoid:** Every command builder calls `.exitOverride()` and the dispatcher catches `CommanderError`, maps to `ExitCode.UsageOrArgError` (2), and exits.
**Warning signs:** Tests that assert on exit codes pass with code 1 instead of 2 — symptom of missing exitOverride.

### Pitfall 4: commander writes `--help` to stdout by default

**What goes wrong:** `protostar-factory status --help | jq .` yields a parse error.
**Why it happens:** Commander writes `--help` text to stdout. Q-04 says stdout is data only.
**How to avoid:** `.configureOutput({writeOut: (s) => process.stderr.write(s), writeErr: (s) => process.stderr.write(s)})` on every command builder. Snapshot test in admission-e2e pipes `--help` and asserts stdout is empty, stderr contains the help text.

### Pitfall 5: Running `setFactoryRunStatus` calls in main.ts will not auto-cover all transitions

**What goes wrong:** Q-18 adds three new statuses; planner greps for `setFactoryRunStatus(` and patches; misses the `'ready-to-release'` literal returned at main.ts:1528 inside `statusForReviewVerdict`.
**Why it happens:** The string `'ready-to-release'` flows through `setFactoryRunStatus` indirectly via a helper.
**How to avoid:** Plan that bumps the enum must (1) update `FactoryRunStatus` in `packages/artifacts/src/index.ts:4`, (2) audit ALL string literals in main.ts that are the status union (grep for `'created'`, `'running'`, `'blocked'`, `'repairing'`, `'ready-to-release'`, `'completed'` in main.ts), (3) add the new transition write site for `'cancelling' → 'cancelled'` per Q-16 in the run loop's existing teardown.
**Warning signs:** A plan that touches only `packages/artifacts/src/index.ts` for Q-18.

### Pitfall 6: Atomic manifest write in cancel command races the run loop's own writes

**What goes wrong:** Cancel command writes `manifest.json` with status `'cancelling'`; meanwhile the in-flight run loop writes manifest with status `'running'` for an unrelated stage transition; cancel mark is lost.
**Why it happens:** Two writers on the same file, no lock.
**How to avoid:** Atomic tmp+rename guarantees no torn writes, but does NOT guarantee ordering. Mitigation: cancel command (1) reads current manifest, (2) computes the new manifest with `status: 'cancelling'` preserving everything else, (3) tmp+rename. Run loop's next manifest write (typically at stage end) reads-modify-writes the same way, and the cancelling status is non-terminal so it's ALLOWED to be overwritten by a subsequent terminal status (`'cancelled'`, or `'completed'` if the run finishes a stage between cancel-write and sentinel-check). CONTEXT Q-16 explicitly accepts this: "If the run loop completes a stage between cancel-write and sentinel-check, the manifest may go cancelling → completed — that's fine." Document this race in the cancel command's `--help` and in CONCERNS.md.

### Pitfall 7: prune deletes a run dir but lineage JSONL still references it

**What goes wrong:** Prune removes `runs/<id>/`; `.protostar/evolution/{lineageId}.jsonl` still has a line `{snapshotPath: "runs/<id>/evolution/snapshot.json"}`; downstream readers crash.
**Why it happens:** Append-only invariant means the JSONL line cannot be deleted.
**How to avoid:** All readers of `.protostar/evolution/{lineageId}.jsonl` must tolerate `ENOENT` on `snapshotPath`. Document in CONCERNS.md (per Q-22 note). Prune does NOT consult lineage chains. Add a unit test to prune that deletes a run referenced in a lineage JSONL and asserts the JSONL line survives byte-identical.

## Code Examples

### Example 1: dispatcher in main.ts

```typescript
// New main.ts shape (after plan-1)
import { Command, CommanderError } from "@commander-js/extra-typings";
import { ExitCode } from "./exit-codes.js";
import { buildRunCommand } from "./commands/run.js";
// ... (other imports added by subsequent plans)

async function main(argv: readonly string[]): Promise<number> {
  const program = new Command("protostar-factory")
    .exitOverride()
    .configureOutput({
      writeOut: (s) => process.stderr.write(s),
      writeErr: (s) => process.stderr.write(s),
    });

  program.addCommand(buildRunCommand());
  // future plans: program.addCommand(buildStatusCommand()); etc.

  try {
    await program.parseAsync([...argv], { from: "user" });
    return process.exitCode ?? ExitCode.Success;
  } catch (err: unknown) {
    if (err instanceof CommanderError) {
      // help, version, or parse error
      if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
        return ExitCode.Success;
      }
      return ExitCode.UsageOrArgError;
    }
    process.stderr.write(`unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    return ExitCode.GenericError;
  }
}

if (process.argv[1] && process.argv[1].endsWith("main.js")) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
```

### Example 2: stage-aware resume dispatcher (Q-13)

```typescript
// apps/factory-cli/src/commands/resume.ts (sketch)
async function resumeExecute(opts: {runId: string}): Promise<ExitCode> {
  const parsed = parseRunId(opts.runId);
  if (!parsed.ok) { writeStderr(parsed.reason); return ExitCode.UsageOrArgError; }
  const runDir = path.join(runsRoot, parsed.value);
  assertRunIdConfined(runsRoot, parsed.value);

  const manifest = await readManifest(runDir);
  if (!manifest) { writeStderr(`no manifest at ${runDir}`); return ExitCode.NotFound; }

  // Q-15 sentinel handling
  if (manifest.status === "cancelled") {
    writeStdoutJson({ runId: parsed.value, error: "operator-cancelled-terminal" });
    return ExitCode.Conflict;
  }
  const liveness = await computeRunLiveness(runDir, opts);
  if (liveness.hasSentinel && manifest.status !== "cancelled") {
    writeStderr("clearing transient cancel sentinel before resume");
    await unlinkSentinelOnResume(runDir);
  }

  // Q-13 stage-aware dispatch
  switch (manifest.status) {
    case "running":
    case "orphaned":
      return resumeMidExecution(runDir, manifest);
    case "repairing":
      return resumeMidReview(runDir, manifest);
    case "ready-to-release":
      writeStderr("run is ready-to-release; use `protostar-factory deliver` instead");
      return ExitCode.NotResumable;
    case "completed":
    case "blocked":
    case "cancelled":
      writeStderr(`manifest.status=${manifest.status} is terminal`);
      return ExitCode.NotResumable;
    case "created":
    case "cancelling":
      writeStderr(`manifest.status=${manifest.status} is non-resumable in v0.1`);
      return ExitCode.NotResumable;
  }
}
```

### Example 3: snapshot-locked --help test (admission-e2e pattern)

```typescript
// packages/admission-e2e/src/factory-cli-help.contract.test.ts
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("protostar-factory status --help — locked output", () => {
  const result = spawnSync("node", ["dist/main.js", "status", "--help"], {
    cwd: pathToFactoryCli,
    encoding: "utf8",
  });
  assert.equal(result.stdout, "", "stdout must be empty for --help (Q-04)");
  const expected = readFileSync(fixturePath("status-help.txt"), "utf8");
  assert.equal(result.stderr, expected);
  assert.equal(result.status, 0);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled `parseArgs` (main.ts:2836) | `commander` v14 + extra-typings | Phase 9 (this) | Adds `--help`, type-checked options, exit-on-error suppression. |
| `console.log` for progress | `writeStderr` for progress, `writeStdoutJson` for data | Phase 9 (this) | stdout becomes machine-parseable. |
| 6-value FactoryRunStatus | 9-value (adds `'cancelling' \| 'cancelled' \| 'orphaned'`) | Phase 9 Q-18 | Operator-meaningful liveness; resume can refuse terminal-cancel. |
| Internal-only `mintDeliveryAuthorization` | Re-mintable via persisted authorization payload | Phase 9 Q-21 | Idempotent deliver retries; gated-mode delivery. |

## Validation Architecture

> Per Nyquist Dimension 8 (workflow.nyquist_validation enabled — config absent ⇒ enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) `[VERIFIED: cat apps/factory-cli/package.json scripts.test]` |
| Config file | None (per-package `pnpm run test` after `pnpm run build`) |
| Quick run command | `pnpm --filter @protostar/factory-cli run test` |
| Full suite command | `pnpm run verify` (every package — required by PLAN-A-03) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OP-01 | `run` extracts to commands/ with no behavior change | unit (parse) + integration (smoke run) | `pnpm --filter @protostar/factory-cli run test` (existing main.test.ts) | ✅ existing |
| OP-02 | `status` table + JSON outputs | snapshot contract | `pnpm --filter @protostar/admission-e2e run test` | ❌ Wave 0: status-row-schema.contract.test.ts |
| OP-03 | resume mid-execution replays orphans only | integration (fixture run dir) | per-command unit + admission-e2e | ❌ Wave 0: resume-stage-dispatch.contract.test.ts |
| OP-04 | cancel writes sentinel + manifest mark | unit + integration | per-command unit | ❌ Wave 0: cancel-command.test.ts |
| OP-05 | inspect emits manifest + path-indexed artifacts (no trace inline) | snapshot contract | admission-e2e | ❌ Wave 0: inspect-schema.contract.test.ts |
| OP-06 | deliver re-mints via Phase 5 brand; gated + idempotent | integration | admission-e2e | ❌ Wave 0: delivery-reauthorize.contract.test.ts |
| OP-07 | stdout JSON is byte-stable; --help is stderr-only | snapshot contract (round-trip) | admission-e2e | ❌ Wave 0: factory-cli-stdout-canonical.contract.test.ts + factory-cli-help.contract.test.ts |
| OP-08 | prune respects active-status guard + JSONL preservation | integration | per-command unit | ❌ Wave 0: prune-command.test.ts |
| Q-03 exit codes | integer values are stable | snapshot | admission-e2e | ❌ Wave 0: exit-codes.contract.test.ts |
| Q-18 enum | FactoryRunStatus locked to 9 values | snapshot | admission-e2e | ❌ Wave 0: manifest-status-enum.contract.test.ts |

### Sampling Rate

- **Per task commit:** `pnpm --filter @protostar/factory-cli run test`
- **Per wave merge:** `pnpm run verify` (whole monorepo; PLAN-A-03 invariant)
- **Phase gate:** Full suite green + manual smoke per `--help` snapshot review before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/admission-e2e/src/exit-codes.contract.test.ts` — locks integer values 0–6.
- [ ] `packages/admission-e2e/src/manifest-status-enum.contract.test.ts` — locks FactoryRunStatus union members.
- [ ] `packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts` — round-trip byte-equality (Q-12).
- [ ] `packages/admission-e2e/src/factory-cli-help.contract.test.ts` — per-command `--help` snapshot, stdout-empty assertion.
- [ ] `packages/admission-e2e/src/status-row-schema.contract.test.ts` — both StatusRowMinimal + StatusRowFull schemas.
- [ ] `packages/admission-e2e/src/inspect-schema.contract.test.ts` — manifest + artifacts shape, NO trace inlining assertion.
- [ ] `packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts` — operator-cancelled→exit 4, sentinel-only→unlinks, mid-execution→replayOrphanedTasks.
- [ ] `packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` — persisted authorization roundtrips through validator; tampered file rejected.
- [ ] `apps/factory-cli/src/commands/cancel.test.ts` — manifest 'cancelling' atomic write + sentinel touch + exit 4 on terminal.
- [ ] `apps/factory-cli/src/commands/prune.test.ts` — active-status guard skip + dry-run-default + JSONL preservation invariant.
- [ ] `apps/factory-cli/src/run-id.test.ts` — regex + path-confinement.
- [ ] `apps/factory-cli/src/run-discovery.test.ts` — readdir+stat+sort, --since interaction.
- [ ] `apps/factory-cli/src/run-liveness.test.ts` — three states (live, orphaned, unknown).
- [ ] `apps/factory-cli/src/duration.test.ts` — `Ns/Nm/Nh/Nd/Nw` parsing + reject malformed.

(Framework install: not needed — `node:test` is built-in.)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | GitHub PAT for delivery — out of Phase 9 scope; lives in env per Phase 7. |
| V3 Session Management | no | Single-shot CLI; no sessions. |
| V4 Access Control | yes | runId path-confinement (Q-19); active-status guard for prune (Q-22); manifest.status='cancelled' refuses resume (Q-15). |
| V5 Input Validation | yes | RUN_ID_REGEX (Q-19), `parseDuration` reject (Q-06), `--archetype` filter validated against archetype enum, branch-name brand reused from Phase 7. |
| V6 Cryptography | yes | sha256 of trace artifacts (Q-10/Q-11) — use `node:crypto.createHash('sha256')`; never hand-roll. DeliveryAuthorization brand is the security boundary (Q-21). |

### Known Threat Patterns for apps/factory-cli (Node CLI, fs+net authority tier)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `runId` (`../etc/passwd`) | Tampering | RUN_ID_REGEX at parse + `path.resolve` + startsWith(runsRoot) at execute (Q-19 belt-and-suspenders). |
| Forged DeliveryAuthorization via tampered authorization.json | Elevation of Privilege | File is INPUT; brand is re-minted by validator that re-checks ReviewGate state (Q-21). Plan must explicitly write a contract test for this. |
| Resume past a deliberate cancel | Tampering / Repudiation | `manifest.status === 'cancelled'` → exit 4 (Q-15). |
| prune deletes an active run | Denial of Service | Active-status guard refuses `running | cancelling | repairing | created | ready-to-release` (Q-22). |
| prune deletes append-only lineage/refusals | Tampering | Hard-coded skip-list + unit-test invariant for byte-identical JSONL after prune (Q-22). |
| stdout-data confusion (progress text into a JSON pipe) | DoS-of-automation | Q-04 strict discipline + round-trip contract test. |
| Argument injection via shell-quoted runId | Tampering | Already prevented by `parseRunId` regex; documented in `--help`. |

## Project Constraints (from CLAUDE.md / AGENTS.md)

- `apps/factory-cli` and `packages/repo` are the ONLY filesystem-permitted tiers. Phase 9 commands stay in `apps/factory-cli`; nothing slips into `packages/dogpile-adapter` or `packages/delivery-runtime` (network-only).
- Domain-first packaging — no `utils`, `agents`, `factory` catch-all packages. The `@protostar/paths` carve-out is the only exception and Phase 9 must NOT add a second.
- `pnpm run verify` runs every package's tests; PLAN-A-03 invariant blocks regressions silently.
- Each network-permitted package ships a static `no-fs.contract.test.ts`. Phase 9 introduces no new network-permitted package, so no new no-fs tests required.
- DELIVER-07 forbids any merge primitives. Deliver re-mint plans must NOT touch merge APIs.
- Stage contracts pass durable data forward; no later-stage reach-back into earlier-stage private state. Inspect's path-indexed view honors this (it reads artifacts, not internal stage state).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | commander v14 ESM-from-CJS interop works in factory-cli's `"type": "module"` build | Standard Stack | Build fails in plan-1; mitigation: planner verifies in plan-1 by running build, may need `import commander from "commander"` (default-import) shape instead of named. |
| A2 | `process.exitCode` set inside `.action(...)` survives commander's parseAsync return | Pattern 1 | Tests show wrong exit code; mitigation: dispatcher reads command's return value via a side-channel store rather than `process.exitCode`. |
| A3 | Q-21's "validator" is best implemented as re-reading `runs/<id>/review-decision.json` + re-stamping the brand (Pitfall 1 option b) | Pitfall 1 | If user wants a heavier validator, plan needs a new entrypoint in `packages/review`. Surface to user during plan review. |
| A4 | Atomic tmp+rename manifest write race (Pitfall 6) is acceptable per Q-16 explicit text | Pitfall 6 | None — verified verbatim in CONTEXT Q-16. |
| A5 | `fs.rm({recursive: true, force: true})` is the right deletion primitive for prune (Node 14+) | Q-22 algorithm | Node version is recent enough; verified by inspection of existing factory-cli code patterns. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All factory-cli code | ✓ (project requires Node 18+) | per repo `.nvmrc` / engines | — |
| pnpm | Workspace install | ✓ (per pnpm-workspace.yaml) | per repo | — |
| `commander@14` | Q-02 | Available on npm registry | 14.0.3 | — |
| `@commander-js/extra-typings@14` | Q-02 | Available on npm registry | 14.0.0 | — |

No missing dependencies. No fallback needed.

## Open Questions (RESOLVED)

1. **Q-21 Pitfall 1 — option (a) heavyweight validator vs option (b) re-read review-decision.json + re-stamp**
   - What we know: Current `mintDeliveryAuthorization` is a 5-line brand stamp with no validation logic. The validation is in `runReviewRepairLoop`'s decision to mint.
   - What's unclear: Whether the user intends a *new* validator (semantic change to packages/review's public surface) or a *minimal* re-mint (just unlock the INTERNAL marker).
   - Recommendation: Plan-N for deliver should split into two questions on the discuss-phase loop: "Q-21a: Add `validateAndMintDeliveryAuthorization(reviewGate, payload)` to packages/review?" and "Q-21b: Re-stamp brand from persisted ReviewDecisionArtifact?" — pick one before writing code.
   - **RESOLVED** by Plan 09-08: adopts option (a). Plan 09-08 adds a new `reAuthorizeFromPayload(payload, deps)` validator entrypoint in `packages/review/src/delivery-authorization.ts` that re-reads `review-decision.json` and re-checks pass+pass before re-minting the `DeliveryAuthorization` brand. The original `mintDeliveryAuthorization` stays internal; only `reAuthorizeFromPayload` is exported from `packages/review/src/index.ts` for Plan 09-09's deliver command.

2. **`--json` default for `cancel`, `deliver`, `prune` outputs**
   - What we know: CONTEXT Q-04 says stdout is "single JSON value or empty". Q-17 shows cancel emits JSON. Q-22 shows prune emits JSON.
   - What's unclear: Whether these commands have a human mode at all, or only emit JSON unconditionally. Q-05 only addressed `status` explicitly.
   - Recommendation: Default to JSON-always for cancel/deliver/prune (single shape, no `--json` flag); status is the only command with a dual-mode story. Confirm with user during planner-discuss.
   - **RESOLVED** by Plans 09-06 / 09-09 / 09-10: JSON-always; no `--json` flag. cancel, deliver, and prune unconditionally emit a single canonical JSON value to stdout (per Q-04 stdout discipline + Q-12 canonical-json lift). Only `status` retains the dual human/JSON output mode (Q-05).

3. **Snapshot test fixture refresh policy**
   - What we know: admission-e2e snapshot tests are byte-stable; refresh requires explicit fixture update.
   - What's unclear: Whether `--help` text changes (e.g., commander rewording an option help string in a patch release) require a fixture bump or a pinned commander version.
   - Recommendation: Pin commander to exact `14.0.3` (not `^14`) in package.json. Fixture bumps require a CONTEXT-revision discipline (since `--help` is a public contract).
   - **RESOLVED** by Plans 09-01 + 09-11: commander pinned to exact `14.0.3` and `@commander-js/extra-typings@14.0.0` (not caret-ranged) in `apps/factory-cli/package.json` (Plan 09-01 Task 2). Plan 09-11's admission-e2e `--help` snapshot fixtures regenerate only on an explicit commander-version bump, which requires a CONTEXT-revision discipline because `--help` is a public CLI contract.

## Sources

### Primary (HIGH confidence)
- `09-CONTEXT.md` — 22 power-mode locks (verbatim source of all Q-XX decisions).
- `apps/factory-cli/src/main.ts` — line 233 (`async function main`), 755 (`installCancelWiring`), 1295 (`setFactoryRunStatus`), 1528 (`'ready-to-release'`), 2836 (`parseArgs`), 3104+ (bin entrypoint).
- `apps/factory-cli/src/cancel.ts` — full file read; exports `installCancelWiring` returning `{rootController, checkSentinelBetweenTasks, unlinkSentinelOnResume, dispose}`.
- `packages/execution/src/index.ts` — confirmed exports of `replayOrphanedTasks` (line 12), `reduceJournalToSnapshot` (line 14 of snapshot.ts), `serializeSnapshot` (line 10 of snapshot.ts).
- `packages/execution/src/snapshot.ts:69` — `function sortJsonValue` is module-private (NOT exported).
- `packages/review/src/delivery-authorization.ts` — full file; mint signature `{runId, decisionPath} → DeliveryAuthorization`; INTERNAL comment.
- `packages/artifacts/src/index.ts:4` — `FactoryRunStatus = "created" | "running" | "blocked" | "repairing" | "ready-to-release" | "completed"`; `setFactoryRunStatus` at line 80.
- `AGENTS.md` — authority tiers, paths carve-out, network-package no-fs invariants.
- `npm view commander version` → 14.0.3 (verified 2026-04-28).
- `npm view @commander-js/extra-typings version` → 14.0.0 (verified 2026-04-28).
- `npm view commander@14 type` → `'commonjs'` (all 14.x versions).

### Secondary (MEDIUM confidence)
- Commander v14 README patterns for `.exitOverride()`, `.configureOutput()`, `.parseAsync()` — standard idioms across v8+.

### Tertiary (LOW confidence)
- ESM-from-CJS interop assumption (A1) — needs runtime verification in plan-1 build.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry on 2026-04-28; all in-tree code surfaces verified by direct read.
- Architecture: HIGH — CONTEXT is exhaustive; main.ts landmarks confirmed by grep.
- Pitfalls: HIGH — Pitfalls 1, 2, 5 derived from direct source reads showing CONTEXT prose vs current-code mismatch.

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days; stable infrastructure, no fast-moving dependencies)
