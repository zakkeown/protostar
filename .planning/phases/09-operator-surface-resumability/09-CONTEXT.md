# Phase 9: Operator Surface + Resumability — Context

**Gathered:** 2026-04-28
**Source:** `09-QUESTIONS.json` (22/22 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Stand up the operator CLI surface that makes a dark factory legible. `protostar-factory` becomes a multi-subcommand binary (`run | status | resume | cancel | inspect | deliver | prune`) with a strict JSON-stable output contract, a curated exit-code taxonomy, and stdout-as-data discipline. Resume rebuilds execution state from the Phase 4 task journal (mid-execution kills only in v0.1; non-execution stages refuse with a pointer to `run --run-id`). Cancel writes the existing CANCEL sentinel from a separate process and marks the manifest `cancelling` → `cancelled` so status surfaces in-flight cancels. Inspect emits a manifest + path-indexed view of the run bundle (traces never inlined). Deliver supports both a config-gated mode and idempotent retry, re-minting `DeliveryAuthorization` from a persisted `runs/<id>/delivery/authorization.json`. Prune ships as a real subcommand with `--dry-run` default, active-status guard, and lineage-preservation guarantees.

**Blast radius:** First place an operator binds expectations to a public CLI shape. Every flag, exit code, output schema, and runId validation becomes a stability commitment that Phase 10 hardens and downstream automation depends on. Three new manifest statuses (`cancelled`, `cancelling`, `orphaned`) bump `FactoryRunStatus` — a public schema change. The cancel and prune surfaces are the first commands that mutate persistent factory state from outside a `run` invocation; they must respect the workspace-level append-only files (`.protostar/refusals.jsonl`, `.protostar/evolution/{lineageId}.jsonl`) and refuse to touch active runs. Re-minting delivery authorization from disk is a load-bearing security boundary — the persisted payload must not become a trust shortcut around Phase 5's brand-mint validator.

**Requirements:** OP-01, OP-02, OP-03, OP-04, OP-05, OP-06, OP-07, OP-08.

</domain>

<carried_forward>
## Locked from Prior Phases / Constraints

- **Phase 6 Q-07 run layout:** `runs/<id>/{manifest.json, intent.json, plan.json, execution-plan.json, planning-mission.txt, review-mission.txt, review-gate.json, piles/<kind>/iter-<N>/, execution/{journal.jsonl, snapshot.json}, evolution/snapshot.json, ci-events.jsonl}`. All Phase 9 commands read this layout; none invent new per-run paths beyond `delivery/authorization.json` (Q-21) and `run.pid`-equivalent state captured via the `cancelling` manifest mark (Q-16/Q-18).
- **Phase 6 Q-08 always-on traces:** trace.json files exist for every pile invocation and can be 10s of MB. Inspect MUST NOT inline them (Q-11).
- **Phase 6 Q-12/Q-13 refusal pipe:** `.protostar/refusals.jsonl` is append-only with a `sourceOfTruth` discriminator. Phase 9 prune MUST preserve it.
- **Phase 4 task journal (Phase 4 lock):** `packages/execution` exposes `TaskJournalEvent`, `reduceJournalToSnapshot`, `serializeSnapshot`, and `replayOrphanedTasks`. Phase 9 resume builds on these — does not introduce a parallel journal model.
- **Phase 5 DeliveryAuthorization brand:** the brand is minted by a validator over `ReviewGate`. Phase 9 deliver MUST re-mint via that validator (Q-21); it MUST NOT skip the validator and trust an on-disk payload.
- **Phase 7 delivery-runtime:** `packages/delivery-runtime` is the network-only Octokit + push surface. Phase 9 deliver invokes that runtime entrypoint; it does not duplicate Octokit usage in factory-cli.
- **Phase 8 evolution chain (Phase 8 Q-14):** `.protostar/evolution/{lineageId}.jsonl` is append-only and MUST survive run pruning. Phase 9 prune's active-status guard must not include the lineage indices.
- **Authority:** Only `apps/factory-cli` and `packages/repo` do filesystem I/O. All new subcommand modules live in `apps/factory-cli/src/commands/`.
- **Runtime-deps lock revision required:** Q-02 selected `commander` (per `@commander-js/extra-typings`). PROJECT.md Constraints table must be amended in Phase 9's first plan with the runtime-dep entry alongside `isomorphic-git`, `diff`, `@dogpile/sdk`, and Phase 7's `@octokit/*`.
- **Archetype scope:** Only `cosmetic-tweak` is wired for v0.1; archetype-aware prune filters (Q-22) are present but exercise only that one value in v0.1.
</carried_forward>

<decisions>

## 1. CLI Architecture

### Q-01 — Subcommand router refactor
**Decision:** **Per-command modules under `apps/factory-cli/src/commands/`.** Create `commands/{run,status,resume,cancel,inspect,deliver,prune}.ts`. Each module exports `parse(rest: readonly string[]): ParsedArgs<T>` and `execute(opts: T): Promise<ExitCode>`. `main.ts` becomes a thin dispatcher: tokenize argv → route on first non-flag token to the matching module's `parse` → invoke `execute` → exit with returned code.
**Rationale:** main.ts is already ~3000 LoC and the run-loop logic is the load-bearing part. Co-locating six new subcommands there inflates the file and tangles command-parse/validate code with the run loop. Per-command modules give each subcommand its own test surface, mirror Phase 5's pattern of small focused modules, and keep blast radius per command minimal.
**Note for planner:** Move the existing `parseArgs` and `runFactory` invocation into `commands/run.ts` first as a no-op refactor (validates the dispatcher seam). Subsequent plans add the new commands one per plan. Each command module's `execute` returns an `ExitCode` enum (Q-03) — `main.ts` calls `process.exit(code)` from a single site. Test pattern: per-command unit tests of `parse()` (table-driven argv → ParsedArgs) and `execute()` (table-driven opts → ExitCode given a temp `.protostar/` fixture root).
**Status:** Decided.

### Q-02 — Argument parser library
**Decision:** **Add `commander` (specifically `@commander-js/extra-typings` for inferred types).** Subcommand DSL replaces the hand-rolled router; types-friendly via the extra-typings package; mature ecosystem.
**Rationale:** Six subcommands × multiple flags each is too much hand-rolled boilerplate to keep auditable. `commander` is mature, well-typed, and produces clean `--help` output for free (operator surface!). Cost: one new runtime dep on `apps/factory-cli`. Alternative (mri/arg) saves bundle size but loses the subcommand DSL — false economy here because the subcommand DSL is the load-bearing piece.
**Note for planner:** Add `commander@^14` and `@commander-js/extra-typings@^14` to `apps/factory-cli/package.json` (exact versions to be pinned by planner per PROJECT.md lock posture). Amend PROJECT.md Constraints with a runtime-dep lock entry: `commander` family on `apps/factory-cli` → operator-surface CLI parsing. The `commands/<name>.ts` modules build their `Command` instance lazily and export it; `main.ts` composes them onto the root program. `--help` output is part of the OP-07 stable contract — pin via a snapshot test in `admission-e2e`.
**Status:** Decided.

### Q-03 — Exit-code taxonomy
**Decision:** **Curated taxonomy.** Single `ExitCode` enum exported from a shared location: `0 success`, `1 generic-error`, `2 usage-or-arg-error`, `3 not-found`, `4 conflict` (already-cancelled, already-delivered, sentinel-present-without-force), `5 cancelled-by-operator`, `6 not-resumable`. Documented in `--help` and a top-level `EXIT_CODES.md` reference.
**Rationale:** Operator surface is a public contract. Shell pipelines and CI consumers need to distinguish "not found" from "arg error" from "deliberately cancelled." Binary 0/1 erases that information; JSON-only signaling breaks `set -e`. The taxonomy is six values — small enough to memorize, large enough to be useful.
**Note for planner:** Define `ExitCode` as a `const` object (not a TS enum — avoid runtime enum baggage) in a new `apps/factory-cli/src/exit-codes.ts`. Every command's `execute` returns one of these values. Snapshot test in `admission-e2e` locks the integer values (they are part of the public contract). Document inside `--help` for each subcommand and at the root.
**Status:** Decided.

### Q-04 — stdout vs stderr discipline
**Decision:** **Strict: stdout = data only; stderr = everything else.** All progress, banners, warnings, and diagnostic lines go to stderr. stdout always parses as either a single JSON value (status, inspect, deliver-result, prune-result) or empty. `--verbose` adds extra diagnostic lines on stderr only.
**Rationale:** OP-07's "JSON-stable so it's pipeable" means `cmd | jq .` must work without prefiltering. Keeping `run` loose ((b)) splits the discipline and lets habits leak; better to fix `run` as part of the same refactor (low risk — `run` already produces a final summary that can be JSONified, and intermediate progress was always operator-noise).
**Note for planner:** Introduce `apps/factory-cli/src/io.ts` with `writeStdoutJson(value)` (canonical-stringifies via Q-12's sortJsonValue + writes once + newline) and `writeStderr(line)`. Replace existing `console.log(...)` progress calls in main.ts/run.ts with `writeStderr`. Add a runtime invariant test: under `--json`-default subcommands, `process.stdout` receives exactly one chunk that parses as JSON. Ensure tests don't assert on stdout for progress strings.
**Status:** Decided.

## 2. Status Command (OP-02, OP-07)

### Q-05 — Default output mode
**Decision:** **Human by default, `--json` flag.** Bare `protostar-factory status` prints a fixed-width text table to stdout (operator-friendly first-touch); `status --json` emits the stable JSON shape. `status --run <id> [--json]` follows the same default.
**Rationale:** TTY-aware auto-switch ((c)) is magical and produces two shapes from the same command — surprises CI when a developer's local TTY behavior diverges from CI's pipe behavior. JSON-only ((a)) is hostile to first-time operators. Two explicit modes, each with a documented contract, is the cleanest separation.
**Note for planner:** Both shapes (human table format + JSON schema) are public contracts. Lock both via snapshot tests in `admission-e2e`: one fixture renders the human table, one renders the JSON. Human table columns derive from the JSON shape (Q-07 tiered) — avoid divergent column orderings. The Q-04 stdout-discipline invariant means `--json` writes one chunk; the human mode writes one chunk too (the rendered table) — `writeStdout(...)` is single-shot in both paths.
**Status:** Decided.

### Q-06 — Default N for `status`
**Decision:** **25.** Default `--limit 25`. Add `--all` to disable cap and `--since <duration>` (mtime-based; duration parser shared with prune).
**Rationale:** Phase 10 dogfood explicitly wants ≥10 consecutive runs; 10 as default is too tight (the dogfood loop will wrap the visible window mid-session). 25 fits a typical scrollback comfortably and gives operators a more useful default for Phase 10 work without forcing `--all`. The `--since` flag is for free since prune (Q-22) already needs the duration parser — share the helper in `apps/factory-cli/src/duration.ts`.
**Note for planner:** Define `parseDuration(input: string): number` (returns ms) handling `Ns/Nm/Nh/Nd/Nw` (e.g., `24h`, `7d`). Reject malformed input with exit 2. Share between status and prune. Default-clamp the resolved set: `--limit + --since` → take the intersection (most recent up to limit, within since-window). `--all` disables both caps.
**Status:** Decided.

### Q-07 — Status row schema
**Decision:** **Tiered — minimal default, `--full` opt-in.** Bare `status` row = `{ runId, archetype, verdict, durationMs }`. `status --full` row = `{ runId, archetype, status, reviewVerdict, evaluationVerdict, lineageId, generation, prUrl?, durationMs, createdAt }`. JSON consumers self-select. Both shapes are public.
**Rationale:** Two narrowly-scoped public contracts beat one large one. The minimal shape covers OP-02's literal asks (last N runs with verdict + archetype + duration); `--full` covers the dashboard mental model (lineage, evaluation, PR URL) without bloating the default surface.
**Note for planner:** Define two TS types `StatusRowMinimal` and `StatusRowFull`. Two stable schemas locked via separate `admission-e2e` snapshot tests. Field derivations:
- `verdict` (minimal): Phase 5 review-gate.json final verdict — `pass | block | fail | repair-budget-exhausted`. For runs that never reached review, `verdict: 'incomplete'`.
- `status` (full): manifest.status (Q-18 enum).
- `reviewVerdict` / `evaluationVerdict`: from review-gate.json + evaluation-report.json respectively; `null` if stage didn't run.
- `lineageId` / `generation`: from `runs/<id>/evolution/snapshot.json` (Phase 8 Q-14 + Q-19).
- `prUrl`: from delivery artifacts; `null` if delivery didn't run or hasn't completed.
- `durationMs`: createdAt → completion timestamp from manifest (or → now for non-terminal runs).
**Status:** Decided.

### Q-08 — Run discovery: scan vs index
**Decision:** **Directory scan, sorted by mtime.** `readdir(.protostar/runs)` + `stat` each entry; sort by mtime desc; lazily read `manifest.json` for the requested page. No top-level index file in v0.1.
**Rationale:** Adds zero write-side coupling to the run loop (no risk of partial-write breaking the index). v0.1 scale (≤ low-thousands of runs in dogfood) is well within readdir+stat performance. Ship the cheap path now; if dogfood (Phase 10) shows latency, add an index then. The Phase 6 refusals.jsonl pattern is for append-only events, not run lifecycle — a runs.jsonl would be lifecycle (different semantics: needs entries for terminal-state transitions).
**Note for planner:** New `apps/factory-cli/src/run-discovery.ts` exporting `listRuns(opts: { limit?, since?, all? }): Promise<readonly RunDirEntry[]>`. Treat readdir errors as empty list (workspace not initialized). Filter to entries matching the runId regex (Q-19) — defensive against accidental directories. Document the O(n) scan + recommended bound (1k runs) in `.planning/codebase/CONCERNS.md`. Add a Phase 10 follow-up note: "consider .protostar/runs.jsonl index if dogfood saturates."
**Status:** Decided.

### Q-09 — Mid-run / corrupted manifest handling
**Decision:** **Compute liveness from journal + sentinel.** A row's `state` field surfaces three derived states beyond manifest.status:
- `unknown`: manifest unreadable / parse error (best-effort row with `error` field).
- `orphaned`: manifest.status `running` AND no journal append in N seconds AND no CANCEL sentinel.
- `live`: manifest non-terminal AND journal append within N seconds.

Resume command shares the same helper.
**Rationale:** Status that lies (says `running` for a process that crashed yesterday) erodes operator trust. Shared liveness helper is also exactly what resume (Q-15(c)) needs to distinguish operator-cancel from sentinel-trip. Hard-fail on first corrupt row punishes the operator for v0.1's reality.
**Note for planner:** New `apps/factory-cli/src/run-liveness.ts` exporting `computeRunLiveness(runDir, opts): Promise<{ state, lastJournalAt?, hasSentinel, manifestStatus? }>`. Liveness threshold default `60_000` ms (configurable via factory-config.json `operator.livenessThresholdMs`). Q-18(d)'s `'orphaned'` manifest status is the *terminal* form; this helper reports the *derived* runtime state in status output without rewriting the manifest. (A separate transition path may move stalled runs from `running` to `orphaned` in the manifest — left for Phase 9 plan to decide based on whether status should mutate manifests, default = no.)
**Status:** Decided.

## 3. Inspect Command (OP-05, OP-07)

### Q-10 — Default inspect view
**Decision:** **Manifest + index of artifact paths.** `inspect <id>` emits `{ manifest, artifacts: [{ stage, kind, path, sha256? }], summary }`. Operator pipes to `jq` to read individual files. No composite-inlining default.
**Rationale:** Composite inlining ((a/c)) produces unbounded JSON when a run has 8+ pile iterations × always-on trace.json (Phase 6 Q-08). Path-indexed inspect bounds the output, lets the operator slice arbitrarily with `cat $(jq -r ...)`, and matches the layered authority story: factory CLI tells you *what* exists; the filesystem tells you *what's in it*.
**Note for planner:** New `apps/factory-cli/src/commands/inspect.ts`. Walk `runs/<id>/` with a fixed allowlist of expected artifact kinds (manifest.json, plan.json, execution/journal.jsonl, execution/snapshot.json, review-gate.json, evaluation-report.json, evolution/snapshot.json, ci-events.jsonl, piles/<kind>/iter-<N>/{result.json,trace.json,refusal.json}). For each found artifact, emit a row with `{ stage, kind, path: <relative>, sha256: <hex> }`. `summary` field is a human-readable one-line description: `"run X — review:pass — eval:pass — pr#42 — 12m13s"` (still inside the JSON, not a separate stream). `--stage <name>` filters the artifacts array but never the manifest field.
**Status:** Decided.

### Q-11 — Trace inclusion
**Decision:** **Always reference, never inline.** Trace files are referenced by path + sha256 in the artifacts array; never inlined; no `--include-traces` flag. Operator reads traces via `cat <path> | jq` or a future dedicated `trace` subcommand.
**Rationale:** Phase 6 Q-08's always-on policy means traces are large by design. An `--include-traces` flag invites operators to use the wrong tool ("just cat the file"). Not building the flag preserves the bounded-output guarantee and avoids special-casing the artifact pipeline.
**Note for planner:** Inspect's artifact walk explicitly excludes any inlining of trace.json contents. Document in `--help`: "Traces are referenced by path; read them directly with `cat`." Sha256 of trace.json IS computed and emitted (cheap; lets operators detect drift).
**Status:** Decided.

### Q-12 — Field ordering / canonicalization
**Decision:** **Sorted keys via `sortJsonValue`.** Reuse the helper from `packages/execution/src/snapshot.ts` (lift into a small shared util — see plan note). All Phase 9 stdout JSON output canonicalizes keys recursively before writing.
**Rationale:** Byte-stable across machines; same approach Phase 4 already uses for snapshot.json — symmetric. Schema-fixed insertion order ((b)) is harder to keep stable across refactors and offers no real readability win when operators pipe to jq anyway.
**Note for planner:** Move `sortJsonValue` from `packages/execution/src/snapshot.ts` to a new shared package (suggest `packages/artifacts/src/canonical-json.ts`) since it's now used by execution + factory-cli. Re-export from execution to keep Phase 4 callers unchanged. `apps/factory-cli/src/io.ts:writeStdoutJson` calls it before stringify. Add a contract test in `admission-e2e`: every Phase 9 subcommand's stdout output, when re-parsed and re-serialized through `writeStdoutJson`, is byte-identical (idempotency).
**Status:** Decided.

## 4. Resume Command (OP-03)

### Q-13 — What stages can resume from?
**Decision:** **Stage-aware resume.** Resume jumps to the latest non-terminal stage in the manifest. Mid-execution → replay journal via `replayOrphanedTasks`. Mid-review → re-invoke review pile from latest `iter-<N>`. Mid-evaluation → re-invoke evaluation pile. Mid-planning → re-invoke planning pile. Mid-delivery → re-invoke delivery (Q-21 authority story applies).
**Rationale:** Operator expectation for `resume` is "just continue" — execution-only resume teaches a confusing distinction between "resumable" and "kinda resumable, use the run command." Pile invocations are already idempotent (Phase 6 always-on iter-N dirs), so re-invocation cost is bounded. Stage-aware is more wiring but a meaningfully better operator surface.
**Note for planner:** New `apps/factory-cli/src/commands/resume.ts` reads the manifest, finds the first non-terminal stage, and dispatches to a per-stage resume helper. Per-stage helpers live in the existing stage modules (e.g., `runRealExecution` already has the seam — extend with a `resume({ runId, fromTaskId? })` entrypoint). For pile stages, the helper finds the highest `iter-<N>` directory under `piles/<kind>/` and starts iter-(N+1). Document each stage's resume semantics inline in `commands/resume.ts`. Map non-terminal-stage absent → exit 6 (not-resumable) with a message identifying the manifest.status.
**Status:** Decided.

### Q-14 — Re-execution semantics for a partial journal
**Decision:** **Replay only orphaned tasks.** Use Phase 4's `replayOrphanedTasks`. Re-execute T2 (and any later tasks) from its last seq; preserves successful T1/T3.
**Rationale:** Phase 4 already shaped the helper exactly for this. Re-running the whole plan ((b)) loses successful work. The `--from <taskId>` escape hatch ((c)) is a future Phase 10 add — not needed for v0.1 cosmetic-tweak (single-shot executor; minimal partial-progress complexity).
**Note for planner:** `commands/resume.ts` (mid-execution branch) calls `replayOrphanedTasks(reduceJournalToSnapshot(events))` to derive the orphan set, then drives the executor with that set. Cancel-sentinel handling per Q-15. The Phase 4 helper already returns `readonly TaskJournalEvent[]` — driver appends fresh events under the same runId.
**Status:** Decided.

### Q-15 — Cancel sentinel on resume
**Decision:** **Refuse if `manifest.status === 'cancelled'`; auto-unlink otherwise.** A terminal operator-cancel is final — resume on it exits 4 (conflict) with a message: "this run was cancelled by an operator; start a fresh run via `protostar-factory run --intent-draft <path>`." A transient sentinel (sentinel present but manifest.status not `cancelled`) is auto-unlinked via the existing `unlinkSentinelOnResume` helper.
**Rationale:** Distinguishes operator intent (deliberate, terminal) from machine state (signal trip, transient). Auto-unlink everywhere ((a)) silently overrides operator intent. Refuse-everywhere ((b)) blocks the common case where SIGINT tripped the sentinel mid-task and the operator just wants to keep going. The Q-18(d) status enum lock is the prerequisite that makes (c) discriminable.
**Note for planner:** `commands/resume.ts` first reads manifest, then:
1. If `manifest.status === 'cancelled'` → exit 4 with the message above.
2. Else if `runs/<id>/CANCEL` present → log to stderr "clearing transient cancel sentinel before resume" and call `unlinkSentinelOnResume`.
3. Proceed with stage-aware dispatch.
Test cases (admission-e2e): operator-cancelled run + resume → exit 4; SIGINT-tripped run (sentinel present, manifest still `running`) + resume → unlinks + dispatches.
**Status:** Decided.

## 5. Cancel Command (OP-04)

### Q-16 — Out-of-process cancel mechanism
**Decision:** **Sentinel + manifest mark.** `cancel <runId>` writes `runs/<id>/CANCEL` AND atomically updates `manifest.status` to `'cancelling'`. The in-flight run loop, on its next sentinel check, transitions manifest to `'cancelled'` and exits.
**Rationale:** PID-file + SIGTERM ((b)) buys a few seconds of latency at the cost of significant lifecycle complexity (stale PIDs, cross-host invalidation, signal-handler races) — wrong tradeoff for v0.1. Plain sentinel ((a)) leaves status command lying ("running" when actually being cancelled). Manifest mark gives status command honest visibility into in-flight cancels (the `cancelling` row in the table is operator-meaningful).
**Note for planner:** New `apps/factory-cli/src/commands/cancel.ts`. Algorithm:
1. Validate runId (Q-19).
2. Read manifest. If terminal (`completed | blocked | cancelled`) → see Q-17.
3. Atomic-write manifest with status `'cancelling'` (tmp+rename pattern from Phase 6 Q-07).
4. Touch `runs/<id>/CANCEL` (write empty file).
5. Emit JSON `{ runId, action: 'cancelling-requested', sentinelPath, manifestStatus: 'cancelling' }` to stdout, exit 0.

Run loop: existing `installCancelWiring.checkSentinelBetweenTasks` detects sentinel → calls `rootController.abort('sentinel')` → existing teardown writes manifest with status `'cancelled'` (new transition; planner adds the write site). If the run loop completes a stage between cancel-write and sentinel-check, the manifest may go `cancelling → completed` — that's fine; `cancelling` is non-terminal so subsequent terminal transitions are allowed.
**Status:** Decided.

### Q-17 — Cancel against an already-finished run
**Decision:** **Refuse with exit code 4 (conflict).** Cancel against `manifest.status` ∈ {`completed`, `blocked`, `cancelled`} exits 4 with a JSON error payload `{ runId, error: 'already-terminal', terminalStatus }` to stdout (per Q-04 stdout discipline) and a one-line stderr message.
**Rationale:** Surfacing the truth helps operators debug their own automation. Idempotent no-op-success ((a)) hides bugs (e.g., operator script targeting the wrong runId). Differentiating completed vs blocked ((c)) is more conceptual overhead than payoff.
**Note for planner:** Above algorithm step 2 returns exit 4 with the JSON payload. `'cancelled'` is in the set so double-cancel is also rejected. Test fixture covers all three terminal statuses.
**Status:** Decided.

## 6. Manifest Status & Authority

### Q-18 — FactoryRunStatus enum extension
**Decision:** **Full set: add `'cancelled'` + `'cancelling'` + `'orphaned'`.** New enum: `'created' | 'running' | 'cancelling' | 'cancelled' | 'orphaned' | 'blocked' | 'repairing' | 'ready-to-release' | 'completed'`.
**Rationale:** Three-way distinction is operator-meaningful: `cancelling` (in-flight cancel, transient), `cancelled` (terminal operator action, refuse resume), `orphaned` (process gone, journal stalled — resumable target). Two of those (`cancelling`, `orphaned`) are needed by Q-16(c) and Q-09(b) decisions already locked above; adding all three at once avoids a follow-up schema bump in Phase 10.
**Note for planner:** Schema change in `packages/artifacts/src/index.ts`:`FactoryRunStatus` union. Update all status-write sites in main.ts (search for `setFactoryRunStatus`). Schema-bump contract test in `admission-e2e/src/manifest-status-enum.contract.test.ts` — locks the exact enum values. State-transition diagram (planner draft):
- `running → cancelling` (cancel command)
- `cancelling → cancelled` (run loop terminal handler)
- `running → orphaned` (deferred — see Q-09 note: status command derives `orphaned` without writing manifest in v0.1; an explicit transition writer can be added later)
- All other terminals (`completed`, `blocked`) reachable from `running | repairing` as today.
Document in PROJECT.md Constraints lock revision (status enum is a public schema).
**Status:** Decided.

### Q-19 — runId validation
**Decision:** **Both: regex + path-confinement.** Strict regex `^[a-zA-Z0-9_-]{1,128}$` at the parse layer (rejects with exit 2) AND `path.resolve(runsRoot, runId)` confinement check at the execute layer (rejects with exit 2). Branded `RunId` type ensures all downstream consumers are type-checked.
**Rationale:** Belt-and-suspenders: regex catches the obvious shell-injection class at parse time before any filesystem access; path confinement catches anything the regex missed (defense in depth). Cheap. Mirrors Phase 5's mint-brand-validator pattern.
**Note for planner:** New `apps/factory-cli/src/run-id.ts` exporting:
- `RUN_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/`
- `type RunId = string & { readonly __brand: 'RunId' }`
- `parseRunId(input: string): { ok: true; value: RunId } | { ok: false; reason: string }`
- `assertRunIdConfined(runsRoot: string, runId: RunId): void` (throws for out-of-tree)
Every `commands/<name>.ts` that takes a runId argument calls `parseRunId` first; downstream APIs accept only `RunId`. Update existing `createLaunchRefusalRunId` to mint the brand.
**Status:** Decided.

## 7. Deliver Command (OP-06)

### Q-20 — When does `deliver <runId>` apply?
**Decision:** **Both: gated mode + retry idempotency.** Add `factory-config.json delivery.mode: 'auto' | 'gated'` (default `'auto'` — preserves Phase 7 behavior). `'gated'` makes the loop pause at `'ready-to-release'` without auto-delivering. `deliver <runId>` works in both modes: in gated mode it triggers the first delivery; in auto mode (or after a successful auto-delivery) it acts as an idempotent retry — re-issues the PR-create or push if the prior attempt failed/timed out, otherwise no-ops.
**Rationale:** Two distinct operator stories that both need a CLI surface: "let me approve before any external write" (gated) and "delivery flaked, please retry" (idempotent). Building one without the other leaves an obvious gap. CLI override `--delivery-mode <auto|gated>` per Phase 6 Q-04 mode-resolution.
**Note for planner:** Schema additions in `factory-config.schema.json`: `delivery: { mode: 'auto' | 'gated' }`. CLI parser adds `--delivery-mode <auto|gated>` to the `run` command. When `mode === 'gated'`, the run loop terminates at `'ready-to-release'` after writing `runs/<id>/delivery/authorization.json` (Q-21) and emits a stderr hint: `"gated: run \`protostar-factory deliver ${runId}\` to push."` `commands/deliver.ts` algorithm:
1. Validate runId; load manifest.
2. If `manifest.status === 'completed'` AND `runs/<id>/delivery/result.json` shows `prUrl` AND CI status is captured → emit `{ runId, action: 'noop', prUrl, reason: 'already-delivered' }` exit 0 (idempotent).
3. If `manifest.status === 'completed'` but delivery artifact missing/incomplete → re-mint authorization (Q-21) + re-invoke `delivery-runtime.executeDelivery`.
4. If `manifest.status === 'ready-to-release'` (gated case) → re-mint authorization + invoke executeDelivery.
5. Else exit 4 (conflict) with reason.
**Status:** Decided.

### Q-21 — Authority loading for `deliver`
**Decision:** **Persist `runs/<id>/delivery/authorization.json`; deliver re-mints via the validator.** When the run loop reaches `'ready-to-release'`, factory-cli serializes the authorization payload (the inputs the validator needs: ReviewGate ref, target, branchName, title, body) atomically. `deliver <runId>` reads that file, re-runs the Phase 5 brand-mint validator (which re-checks ReviewGate state), and obtains a fresh `DeliveryAuthorization`. The persisted file is *input* to the validator, never trusted as the brand itself.
**Rationale:** The validator is the security boundary; bypassing it means the on-disk file becomes a trust shortcut and any disk corruption / tampering becomes a privilege-escalation vector. (c)'s "re-derive from review-gate.json" is similar but loses the exact target / branchName / title metadata committed at mint time — re-deriving those at deliver time risks producing a different PR than the loop would have. Persisting the validator inputs (not the brand) and re-validating is the cleanest authority story.
**Note for planner:** New write site in main.ts at the existing `'ready-to-release'` transition: atomic write `runs/<id>/delivery/authorization.json` containing the validator inputs (NOT the brand — TS won't let you serialize it anyway, and the brand is by-definition runtime-only). Schema for the authorization payload defined in `packages/delivery/src/authorization-payload.ts` (pure types). `commands/deliver.ts` reads the file, calls the existing Phase 5 mint validator with the inputs, mints the brand, hands to `delivery-runtime.executeDelivery`. If the validator refuses (e.g., ReviewGate state changed since mint), exit 4 with the validator's refusal reason. Add a contract test in `admission-e2e/src/delivery-reauthorize.contract.test.ts`.
**Status:** Decided.

## 8. Prune Command (OP-08)

### Q-22 — Prune surface and safety
**Decision:** **Full subcommand: `protostar-factory prune --older-than <duration> [--dry-run] [--archetype X] [--confirm]`.** Default `--dry-run`; `--confirm` is required to actually delete. Active-status guard refuses to prune runs whose `manifest.status` is non-terminal (`created | running | cancelling | repairing | ready-to-release`). Workspace-level append-only files (`.protostar/refusals.jsonl`, `.protostar/evolution/{lineageId}.jsonl`) are NEVER touched.
**Rationale:** Operators expect a real subcommand; documented `find` recipe ((a)) leaves them to memorize lineage-preservation rules and active-run guards on every invocation. The dry-run-default + explicit `--confirm` matches the safety posture the rest of the factory takes (e.g., delivery brand minting is explicit).
**Note for planner:** New `apps/factory-cli/src/commands/prune.ts`. Algorithm:
1. Parse `--older-than <duration>` via shared `parseDuration` helper (Q-06).
2. Optional `--archetype <name>` filter (matches `manifest.archetype`).
3. Enumerate runs via shared `listRuns` (Q-08).
4. For each candidate: read manifest; if non-terminal → skip with a `protected` row in the report; if older than threshold → mark for deletion.
5. Emit JSON `{ scanned, candidates: [...], protected: [...], deleted: [...] }` to stdout. In `--dry-run` mode, `deleted` is empty. With `--confirm`, recursively rm each candidate's `runs/<id>/` directory (use `fs.rm({recursive: true, force: true})`) and populate `deleted`.
6. NEVER touch `.protostar/refusals.jsonl` or `.protostar/evolution/`. Add a unit test asserting these paths exist before and after a prune.

Document in `--help` and in `.planning/codebase/CONCERNS.md`: prune does not consult lineage chains (a pruned run's snapshot.json is gone, but the JSONL line referencing it remains — readers must tolerate missing snapshot files). This is the Phase 8 Q-14 "append-only index survives prune" lock realized.
**Status:** Decided.

</decisions>

<canonical_refs>

## Canonical References

Downstream agents (researcher, planner) MUST read these before producing artifacts.

### Roadmap & Requirements (project-level)
- `.planning/ROADMAP.md` — Phase 9 entry (lines 286–298); Phase 10 dogfood relationship (lines 300–310); risk register (delivery + cancel rows).
- `.planning/REQUIREMENTS.md` — OP-01..OP-08 (lines 111–117); coverage matrix (lines 231–238).
- `.planning/PROJECT.md` — Out-of-Scope (TUI deferred; cosmetic-tweak only); Constraints (minimal runtime deps — Phase 9 amends with `commander`); authority boundary.

### Phase 9 Code Landmarks
- `apps/factory-cli/src/main.ts:2517` — current `parseArgs` (single-command). Phase 9 refactor extracts `run` to `commands/run.ts` and adds the dispatcher.
- `apps/factory-cli/src/main.ts:2780` — current `bin` entrypoint + help wiring.
- `apps/factory-cli/src/cancel.ts` — `installCancelWiring`, `checkSentinelBetweenTasks`, `unlinkSentinelOnResume`. Phase 9 cancel command writes the sentinel from a separate process; resume reuses unlinkSentinelOnResume.
- `apps/factory-cli/src/journal-writer.ts` — Phase 4 task-journal append-only writer.
- `packages/execution/src/snapshot.ts` — `reduceJournalToSnapshot`, `serializeSnapshot`, `sortJsonValue` (lift to shared per Q-12).
- `packages/execution/src/orphan-replay.ts` — `replayOrphanedTasks` (consumed by resume Q-14).
- `packages/artifacts/src/index.ts` — `FactoryRunStatus` enum (Phase 9 extends per Q-18); `FactoryRunManifest`; `setFactoryRunStatus`.

### Phase 5 / 7 Inputs Phase 9 Consumes
- `packages/review/src/index.ts` — `ReviewGate` consumed by deliver re-mint (Q-21).
- Phase 5 `DeliveryAuthorization` brand-mint validator (location: `packages/delivery/src/...` — planner to confirm) — Q-21 invokes this.
- `packages/delivery-runtime/src/index.ts` — `executeDelivery`, `pollCiStatus` (Q-20 deliver invokes; Phase 7 lock).
- `runs/<id>/delivery/result.json`, `ci-events.jsonl` — read by deliver-idempotency check (Q-20 step 2).

### Run Bundle Layout (Phase 6 Q-07 lock — Phase 9 reads everywhere)
- `.protostar/runs/<runId>/manifest.json` — primary status driver.
- `.protostar/runs/<runId>/execution/journal.jsonl + snapshot.json` — resume input.
- `.protostar/runs/<runId>/piles/<kind>/iter-<N>/` — pile resume targets (Q-13).
- `.protostar/runs/<runId>/evolution/snapshot.json` — status `--full` lineage data.
- `.protostar/runs/<runId>/CANCEL` — sentinel file (cancel + resume).
- `.protostar/runs/<runId>/delivery/authorization.json` — NEW (Q-21).

### Workspace-Level Append-Only Files (MUST survive prune)
- `.protostar/refusals.jsonl` (Phase 6 Q-12).
- `.protostar/evolution/{lineageId}.jsonl` (Phase 8 Q-14).

### Constraints (Phase 9 must respect)
- `AGENTS.md` — domain-first packaging; subcommand modules belong in `apps/factory-cli/src/commands/`, not in a new package.
- `apps/factory-cli/src/main.ts` — only fs writer outside `packages/repo`. Inspect/status/etc. read; cancel/prune/deliver write within their own subtrees.
- `packages/dogpile-adapter/` — network-only; resume's pile re-invocations go through it.

</canonical_refs>

<code_context>

## Reusable Assets / Patterns

- **Atomic writes (tmp+rename)** — Phase 6 Q-07 pattern; reused by `cancel` (manifest mark, sentinel) and gated-delivery write of `delivery/authorization.json`.
- **Append-only JSONL indexes** — `.protostar/refusals.jsonl` + `.protostar/evolution/{lineageId}.jsonl` are the precedent; Q-08 explicitly DOES NOT add a `runs.jsonl` (scan-first; revisit in Phase 10).
- **`sortJsonValue` canonicalization** — `packages/execution/src/snapshot.ts`; Q-12 lifts it into a shared util consumed by all stdout JSON output (Q-04 + Q-12).
- **Brand-mint validator pattern** — Phase 5 `DeliveryAuthorization`; Q-21 reuses for deliver re-mint without bypassing the validator.
- **Mode resolution (Phase 6 Q-04)** — CLI > factory-config.json > built-in default; reused for `--delivery-mode` (Q-20).
- **Cancel wiring (`installCancelWiring`, `unlinkSentinelOnResume`, `checkSentinelBetweenTasks`)** — Phase 6 in-process surface; Q-16 wraps it from outside, Q-15 reuses unlinkSentinelOnResume on resume.
- **Phase 4 journal helpers (`reduceJournalToSnapshot`, `replayOrphanedTasks`)** — Q-13/Q-14 build directly on these; no parallel journal model.
- **Per-stage iter-<N> directory pattern** — Phase 6 Q-07; Q-13 stage-aware resume increments iter for pile re-invocation.

## New Surfaces Phase 9 Introduces

- `apps/factory-cli/src/commands/{run,status,resume,cancel,inspect,deliver,prune}.ts` — per-command modules (Q-01).
- `apps/factory-cli/src/exit-codes.ts` — `ExitCode` const object (Q-03).
- `apps/factory-cli/src/io.ts` — `writeStdoutJson` + `writeStderr` discipline (Q-04, Q-12).
- `apps/factory-cli/src/run-id.ts` — `RUN_ID_REGEX`, branded `RunId`, `parseRunId`, `assertRunIdConfined` (Q-19).
- `apps/factory-cli/src/run-discovery.ts` — `listRuns({limit, since, all})` (Q-08).
- `apps/factory-cli/src/run-liveness.ts` — `computeRunLiveness` shared helper (Q-09; consumed by status + resume).
- `apps/factory-cli/src/duration.ts` — `parseDuration(input)` (Q-06; shared with prune Q-22).
- `packages/artifacts/src/canonical-json.ts` (or similar shared location) — `sortJsonValue` lifted from execution (Q-12).
- `packages/delivery/src/authorization-payload.ts` — serializable authorization inputs (Q-21).
- `runs/<id>/delivery/authorization.json` artifact (Q-21).
- `factory-config.json delivery.{mode}` field + `--delivery-mode` CLI flag (Q-20).
- `factory-config.json operator.{livenessThresholdMs}` field (Q-09).
- `FactoryRunStatus` enum bump: `'cancelling' | 'cancelled' | 'orphaned'` (Q-18).
- Public CLI contracts (snapshot-locked): `--help` text per command, `ExitCode` integers, `StatusRowMinimal` + `StatusRowFull` schemas, inspect output schema, cancel/deliver/prune JSON output schemas.
- New runtime deps (PROJECT.md Constraints lock revision): `commander` + `@commander-js/extra-typings` on `apps/factory-cli` (Q-02).

</code_context>

<deferred_ideas>

## Noted for Later

- **`.protostar/runs.jsonl` index** — Q-08 deferred; revisit in Phase 10 if dogfood (≥10 consecutive runs) shows scan latency.
- **`--from <taskId>` resume escape hatch** — Q-14 deferred; v0.1 cosmetic-tweak doesn't need it. Phase 10+.
- **Manifest writer for `running → orphaned` transition** — Q-09 derives `orphaned` at status time without mutating the manifest. A background watchdog that rewrites stalled manifests is a v1.0 add.
- **`trace` subcommand for guided trace.json reading** — Q-11 keeps traces unviewable except via `cat`; a richer surface (e.g., last-N events, filter-by-judge) belongs in Phase 10 or v1.0.
- **TUI / live `status --watch`** — explicitly deferred per ROADMAP.md Phase 9 notes ("TUI is deferred. The product feel is 'boring CLI you trust.'"). v1.0+.
- **Cross-host PID-file cancel** — Q-16(b) rejected for v0.1; if a multi-host operator surface ever lands, revisit.
- **Empirical calibration of `operator.livenessThresholdMs`** — Q-09 default 60s; Phase 10 dogfood may tune.
- **Composite/full inspect view** — Q-10 ships path-indexed-only; if operators repeatedly hand-stitch artifacts, consider a `--full` inlining mode in v1.0.

</deferred_ideas>

<open_questions>
None at this time. All 22 power-mode questions answered; planner has the locks needed to proceed.
</open_questions>
