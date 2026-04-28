# Codebase Concerns

**Analysis Date:** 2026-04-26

## Tech Debt

**Stubbed evaluation pipeline:**
- Issue: Two of three evaluation stages are hardcoded to `status: "skipped"` with literal "stubbed" summaries. The factory advertises a three-stage evaluation (`mechanical | semantic | consensus`) but only the mechanical stage is implemented.
- Files: `packages/evaluation/src/index.ts:49-79` (`createEvaluationReport`)
- Impact: `evaluation-report.json` produced for every run claims semantic and consensus review occurred (as `skipped`), but no signal exists about whether they should have run, what would have triggered them, or what budget they would have consumed. Downstream PR delivery (`packages/delivery/src/index.ts`) only inspects mechanical verdict, so these stages are effectively dead branches.
- Fix approach: Either (a) wire real heterogeneous-local judge panel per `MEMORY.md` "dark factory design" lock, or (b) collapse the three-stage shape to one stage until v0.0.2 and remove the stubbed branches so artifacts do not lie about the pipeline.

**Three of four goal archetypes hard-blocked as `stub`:**
- Issue: `feature-add`, `refactor`, and `bugfix` archetypes are present in the registry but admission paths return `unsupported` with `capabilityCapStatus: "stub"`. Only `cosmetic-tweak` is `wired`.
- Files: `packages/policy/src/archetypes.ts:238-459`, `packages/policy/src/admission-paths.ts:199-244`, `packages/policy/src/admission-contracts.ts:336-387`
- Impact: Operators authoring intents for any non-cosmetic goal hit a deterministic block at admission. The product surface (CLI, examples) implies broad coverage; the policy surface delivers exactly one archetype. This matches the v0.0.1 lock per `MEMORY.md`, but the seam between "intentionally deferred" and "actually broken" is invisible to a caller without reading admission tests.
- Fix approach: Wire one additional archetype per release, or surface a dedicated CLI error message that distinguishes "this archetype is not yet wired" from "your intent was rejected on its merits."

**Planning execution is fixture-driven, not pile-driven:**
- Issue: `runFactory` reads `planning-result.json` from a filesystem fixture path (`--planning-fixture`) instead of invoking a planning pile. The Dogpile adapter (`packages/dogpile-adapter/src/index.ts`) defines `planningPilePreset` with three planner agents and a real budget, but nothing in the factory CLI calls it.
- Files: `apps/factory-cli/src/main.ts:218-228` (`readPlanningFixtureInput`), `packages/dogpile-adapter/src/index.ts:42-60` (preset defined but never invoked from CLI)
- Impact: Every `pnpm run factory` invocation replays a static planning artifact. The 200+ run directories in `.protostar/runs/` (one every few minutes on 2026-04-26) are deterministic replays, not real planning runs. Verification value is high; product value is zero until the pile is actually called.
- Fix approach: Add a `--planning-mode pile` branch that calls a `runDogpileMission(planningMission)` against the linked `@dogpile/sdk` and feeds the output through the existing `parsePlanningPileResult` path.

**Review pile is also un-invoked:**
- Issue: `buildReviewMission` is constructed and serialized to `review-mission.txt`, but `reviewPilePreset` is never run. Mechanical review (`runMechanicalReviewExecutionLoop`) is the only review that fires.
- Files: `apps/factory-cli/src/main.ts:336` (mission built, not executed), `packages/dogpile-adapter/src/index.ts:62-80` (preset defined)
- Impact: Symmetric with planning; the pile presets exist as dead-letter scaffolding.
- Fix approach: Same as planning — invoke the pile, feed output through review admission.

**`@dogpile/sdk` is a sibling-repo file link:**
- Issue: `packages/dogpile-adapter/package.json` declares `"@dogpile/sdk": "link:../../../dogpile"` — a relative path three directories above the repo root.
- Files: `packages/dogpile-adapter/package.json:21`
- Impact: The build only succeeds for contributors with the exact directory layout `~/Code/dogpile` (or wherever) as a peer of `~/Code/protostar`. There is no fallback, no version pin, no published artifact. Cloning the repo on a fresh machine fails `pnpm install` silently or noisily depending on the layout.
- Fix approach: Either publish `@dogpile/sdk` to a registry and pin a version, or vendor the minimal surface (`AgentSpec`, `DogpileOptions`, `budget`, `convergence`, `firstOf`) into a `packages/dogpile-types` shim until the public package exists.

**Workspace `verify` script only tests two of seven testable packages:**
- Issue: `pnpm run verify` runs `typecheck && pnpm --filter @protostar/intent test && pnpm --filter @protostar/factory-cli test`. It skips `policy`, `planning`, `execution`, `review`, and `dogpile-adapter` tests despite each having a `test` script.
- Files: `package.json:11`
- Impact: A change to `packages/policy` admission logic can break `policy/src/admission-control.test.ts` (4684 lines of contract) and pass `pnpm run verify` cleanly. The largest test file in the repo is not in the gate.
- Fix approach: Replace the filtered runs with `pnpm -r test` or, if execution time is the concern, an explicit list that includes all packages with a `test` script.

**`packages/repo` is essentially empty:**
- Issue: The package exports three interfaces and one validating constructor. No actual repo access (clone, branch, patch apply, diff) is implemented despite being declared as the authority for repo side effects in `AGENTS.md`.
- Files: `packages/repo/src/index.ts` (24 lines total)
- Impact: Execution stage returns `evidence` arrays with `StageArtifactRef` placeholders but no actual workspace mutation occurs. The "dark factory" cannot deliver a real PR until this package is filled in.
- Fix approach: Implement `applyChangeSet`, `commitChangeSet`, and `openPullRequest` behind the `WorkspaceRef.trust` guard before delivery is wired.

## Known Bugs

**`pnpm run factory` writes to `.protostar/runs/` which is gitignored:**
- Symptoms: Run directories accumulate locally (208 present at audit time, all dated 2026-04-26) but are never reviewable in git or CI.
- Files: `.gitignore:5` (ignores `.protostar/runs/`), `package.json:12` (factory script writes there)
- Trigger: Running `pnpm run factory` or any test that calls `runFactory` with the default `--out`.
- Workaround: Inspect runs locally; CI artifacts must be uploaded by a separate step.
- Note: This is a design choice, but the high run count (208 in one day) suggests either runaway test invocations or a missing cleanup step. Worth confirming a developer-facing prune command exists.

**`workspaceRoot` derived from `process.env["INIT_CWD"] ?? process.cwd()`:**
- Symptoms: When the CLI is invoked outside a pnpm script, `INIT_CWD` is unset, so paths resolve relative to `process.cwd()`. Inside a pnpm script, `INIT_CWD` may point at the directory the user invoked pnpm from, not the workspace root.
- Files: `apps/factory-cli/src/main.ts:150`
- Trigger: Invoking `node dist/main.js run --draft ./local.json` from a subdirectory of the workspace.
- Workaround: Always pass absolute paths.
- Fix: Resolve workspace root deterministically by walking up to the nearest `pnpm-workspace.yaml`.

## Security Considerations

**Trust label is a string the caller controls:**
- Risk: `defineWorkspace` accepts `trust: "trusted" | "untrusted"` but `runFactory` hardcodes `trust: "trusted"` (`apps/factory-cli/src/main.ts:307`). There is no enforcement layer that consumes this label to gate dangerous operations.
- Files: `packages/repo/src/index.ts:1-5`, `apps/factory-cli/src/main.ts:305-309`
- Current mitigation: None — `trust` is currently a documentation field.
- Recommendations: Either remove the field until it is wired, or add a check in `packages/execution` that refuses `executeGrants` with `executionScope: "workspace"` when `trust !== "trusted"`.

**No `.env.example` despite `.env` being gitignored:**
- Risk: `.gitignore` excludes `.env` and `.env.*` with an `!.env.example` exception, but no `.env.example` file exists. New contributors cannot tell which env vars (if any) are required.
- Files: `.gitignore:6-8`
- Current mitigation: The codebase only references `process.env["INIT_CWD"]` (`apps/factory-cli/src/main.ts:150`), so no secrets are needed today.
- Recommendations: Add a minimal `.env.example` (even if empty with comments) before any LM Studio / Octokit credentials enter the codebase, so the secret surface is announced before it appears.

**LM Studio and Octokit credentials are not yet present but are imminent:**
- Risk: `MEMORY.md` lock declares LM Studio + Octokit PR delivery for v0.0.1. The `delivery` package builds a `gh pr create` command shell-execution recipe (`packages/delivery/src/index.ts:68`) but never executes it. When execution lands, the auth pathway needs explicit handling.
- Files: `packages/delivery/src/index.ts:68`
- Current mitigation: Command is built as `readonly string[]`, not a shell string, so injection from `runId`, `baseBranch`, or `headBranch` is bounded by `gh`'s arg parsing — but those values flow from user-supplied JSON.
- Recommendations: When wiring execution of the delivery command, validate `baseBranch` and `headBranch` against `^[a-zA-Z0-9._/-]+$` before invocation; never pass them to a shell.

## Performance Bottlenecks

**`pnpm run verify` requires a full TypeScript build before running tests:**
- Problem: Each package's `test` script is `pnpm run build && node --test dist/*.test.js`. A typo in a test file triggers a project-references build before any test runs.
- Files: `packages/intent/package.json` and 5 sibling test scripts; `package.json:12` for the factory CLI
- Cause: Tests run against compiled JS, not source. There is no `tsx`/`ts-node` shortcut.
- Improvement path: Acceptable for CI determinism. For local iteration, add a `test:watch` that uses `node --import tsx --test src/*.test.ts`.

**`packages/planning/src/index.ts` is 5361 lines:**
- Problem: A single index file holds plan validation, candidate-plan parsing, admission control, planning-pile output parsing, and admitted-plan handoff.
- Files: `packages/planning/src/index.ts`
- Cause: Organic growth without subdir extraction. The package has subdirs (`schema/`, `artifacts/`) but the index has not been split to use them.
- Improvement path: Split into `validation.ts`, `admission.ts`, `pile-parsing.ts`, `handoff.ts`. The package already exports through subpath conditions (`@protostar/planning/schema`, `/artifacts`), so consumers can be migrated incrementally.

## Fragile Areas

**`apps/factory-cli/src/main.ts` is a 1190-line orchestrator:**
- Files: `apps/factory-cli/src/main.ts`
- Why fragile: A single function (`runFactory`) sequences 13+ artifact reads/writes, threads admission decisions through optional clarification reports, and branches on whether a draft vs. confirmed intent was supplied. Every new artifact touches the manifest construction reducer at line 438.
- Safe modification: Pair every change with the existing `apps/factory-cli/src/main.test.ts` (2930 lines) and add a new test before changing the artifact list. The reducer's order is part of the contract.
- Test coverage: High for happy path; unclear for partial-failure paths (e.g., what happens if `writePlanningAdmissionArtifacts` succeeds but `readPersistedPlanningAdmissionArtifact` fails).

**`packages/policy/src/admission-control.test.ts` is 4684 lines and not in `verify`:**
- Files: `packages/policy/src/admission-control.test.ts`
- Why fragile: This file encodes the v0.0.1 archetype policy contract. Refactors to `packages/policy/src/archetypes.ts` or `admission-paths.ts` will break it in non-obvious ways, and the project's gate (`pnpm run verify`) does not run it.
- Safe modification: Run `pnpm --filter @protostar/policy test` explicitly before any policy change.
- Coverage gap: See "verify script" debt above.

**`@ts-expect-error` contract files cannot be checked in `verify`:**
- Files: `packages/planning/src/plan-task-coverage.contract.ts:27`, `:35`, `:43`; `packages/planning/src/task-required-capabilities.contract.ts:38`; `packages/planning/src/task-risk-declaration.contract.ts:72,75`; `packages/planning/src/plan-acceptance-criteria.contract.ts:26,35`
- Why fragile: These are negative type-level tests. If the underlying type weakens, `@ts-expect-error` becomes a hard error at build time — but only when that contract file is actually compiled. The `.contract.ts` extension is not special; whether it is in the build graph depends on its consumers.
- Safe modification: Verify each contract file is referenced from at least one test or `tsconfig` `include` glob.

## Scaling Limits

**Run directory naming uses second-precision timestamps:**
- Current capacity: `run_YYYYMMDDHHMMSS_<archetype>` (`apps/factory-cli/src/main.ts` `createRunId` / `createDraftRunId`)
- Limit: Two runs in the same second collide. With the current ~30 runs/hour observed on 2026-04-26, the collision risk is low but real for parallel test invocations.
- Scaling path: Append a random suffix or use millisecond precision. `runId` is also exposed via `--run-id`, so a CI strategy can avoid the issue today.

**Planning admission validates every candidate plan even after a winner is selected:**
- Current capacity: Multi-candidate path (`admitCandidatePlans`) iterates all candidates.
- Limit: `packages/planning/src/index.ts:2209` enforces "did not evaluate every candidate plan." This is a correctness invariant, but means scaling candidate count is O(n × validation-cost).
- Scaling path: Acceptable while N stays small (3 planners per Dogpile preset). Revisit if planner count grows.

## Dependencies at Risk

**TypeScript `^6.0.3`:**
- Risk: TypeScript 6 is current at audit time, but `node --test` integration depends on Node 22 and TS 6 type emission staying compatible. The repo pins `node: >=22` and `packageManager: pnpm@10.33.0`.
- Impact: A Node 22 LTS deprecation or pnpm 11 breaking change will surface here first.
- Migration plan: Pin in CI; add a renovate/dependabot config (none present).

**`@dogpile/sdk` via `link:`:**
- Risk: As noted in tech debt — sibling-repo file link with no version metadata.
- Impact: Build breakage on any machine without the sibling layout.
- Migration plan: Publish or vendor before onboarding any second contributor.

## Missing Critical Features

**No actual code execution:**
- Problem: `packages/execution/src/index.ts` provides a `prepareExecutionRun` and `ExecutionDryRunResult` shape. There is no real execution — only dry-run task lifecycle events.
- Blocks: End-to-end factory cannot produce a real PR. The pipeline ends with a `delivery-plan.json` describing what would have happened.

**No real PR delivery:**
- Problem: `packages/delivery/src/index.ts` produces a delivery plan including a `gh pr create` command array, but nothing executes it.
- Blocks: v0.0.1 "demo+ cosmetic-tweak loop" lock per `MEMORY.md` requires Octokit PR delivery; this is not implemented.

**No ontology snapshot persistence between runs:**
- Problem: `decideEvolution` compares current to previous snapshot, but `apps/factory-cli/src/main.ts:327-330` always passes `intent` as previous and `plan` as current within a single run. There is no cross-run memory.
- Blocks: The "evolutionary loop" promised by `CLAUDE.md` cannot accumulate state. Every run is generation 0.

## Test Coverage Gaps

**`packages/repo` has no tests:**
- What's not tested: `defineWorkspace` validation, `RepoChangeSet` construction.
- Files: `packages/repo/src/` (no `*.test.ts`)
- Risk: When real repo operations land, there is no test scaffolding.
- Priority: Low until the package gains real behavior.

**`packages/artifacts` has no tests:**
- What's not tested: `createFactoryRunManifest`, `recordStageArtifacts`, `setFactoryRunStatus`.
- Files: `packages/artifacts/src/` (no `*.test.ts`)
- Risk: The reducer in `apps/factory-cli/src/main.ts:438-448` depends on artifact-record append semantics; a regression in `recordStageArtifacts` would silently drop or duplicate artifacts.
- Priority: Medium — covered transitively by `apps/factory-cli/src/main.test.ts` but not in isolation.

**`packages/delivery` has no tests:**
- What's not tested: `createGitHubPrDeliveryPlan` blocked-vs-ready branching, PR body formatting.
- Files: `packages/delivery/src/` (no `*.test.ts`)
- Risk: PR body generation includes hardcoded artifact filenames (`packages/delivery/src/index.ts:80-83`) that drift from `apps/factory-cli/src/main.ts` artifact list.
- Priority: Medium.

**`packages/evaluation` has no tests:**
- What's not tested: `measureOntologySimilarity` math, `decideEvolution` thresholding, the stubbed `createEvaluationReport`.
- Files: `packages/evaluation/src/` (no `*.test.ts`)
- Risk: The similarity score formula (`0.5 * nameOverlap + 0.3 * typeMatch + 0.2 * exactMatch`, `packages/evaluation/src/index.ts:123`) is undocumented and untested. Convergence threshold of 0.95 may never be reachable in practice — no test confirms it.
- Priority: High — this controls the evolutionary loop's halt condition.

**No tests gate is enforced for new packages:**
- What's not tested: `pnpm run verify` does not include `policy`, `planning`, `execution`, `review`, or `dogpile-adapter`.
- Files: `package.json:12`
- Risk: See "verify script" debt.
- Priority: High.

---

*Concerns audit: 2026-04-26*

## Phase 3 Concerns (added 2026-04-27)

**Runtime-deps lock broken (intentional):**
- Issue: PROJECT.md previously asserted "zero external runtime deps". Phase 3
  adds three: `isomorphic-git@1.37.6`, `diff@9.0.0` (both on `@protostar/repo`),
  `@dogpile/sdk@0.2.0` (on `@protostar/dogpile-adapter`). Locks rephrased
  explicitly; not a silent break.
- Files: `packages/repo/package.json`, `packages/dogpile-adapter/package.json`
- Impact: Operators evaluating dep posture must read the rephrased lock; the
  audit trail is in `03-CONTEXT.md` Errata E-01.

**Tombstone disk-fill on stuck-run streak:**
- Issue: Q-11 fresh-clone-per-run + tombstone-on-failure means a streak of
  100 failed runs accumulates 100 workspace dirs in `.protostar/workspaces/`.
  A small Tauri toy clone is ~50 MB; 100 streaks = 5 GB.
- Mitigation: `tombstoneRetentionHours` (default 24) in `repo-policy.json`;
  operator runs `protostar-factory prune` (Phase 9) to reclaim.

### Phase 7: push cancel is best-effort (Pitfall 11)

isomorphic-git's push() takes no AbortSignal. We implement two-layer cancel:
(1) pre-push signal check, (2) onAuth signal check between auth invocations.
An in-flight HTTP pack upload cannot be interrupted from outside the callbacks.
Recovery: Q-18 idempotency - next delivery attempt finds the partial push and
reconciles via remote-SHA check (Pitfall 5).

**`diff.applyPatch` is text-only (binary-not-supported):**
- Issue: Cosmetic-tweak loop touching a `.png` icon will hit the
  `Binary files ... differ` patch placeholder. `applyChangeSet` records
  `{status: "skipped-error", error: "binary-not-supported"}` and the review
  pile decides.
- Mitigation: Phase 3 v1 detects binary headers via `parsePatch` output and
  records as evidence. Binary-aware fallback deferred.
