# Phase 11: Headless Mode + E2E Stress — Context

**Gathered:** 2026-04-28
**Source:** `11-QUESTIONS.json` (21/21 answered, --power mode)
**Status:** Ready for research + planning — three internal tensions flagged for the researcher (see `<conflicts_flagged>`)

<domain>
## Phase Boundary

Lift the v0.1 single-archetype lock, run the factory in fully-headless mode (CI-hosted + self-hosted-runner + local-daemon), stress-test the full pipeline along three orthogonal axes (sustained load, concurrency, fault injection), and use a single-shot `feature-add` seed to deliver a working Tauri-based tic-tac-toe game to `../protostar-toy-ttt` — verified by a Playwright E2E spec + an operator-authored property-based state-machine test, both immune to factory edits. Phase 11 is the first time the factory mutates beyond cosmetic-tweak, the first time it runs without an attached operator terminal, and the first time it is exercised under deliberate adversarial load.

**Blast radius:** Lifts the `cosmetic-tweak`-only archetype lock (`packages/policy/src/admission-paths.ts` + PROJECT.md Out-of-Scope) — `feature-add`, `bugfix`, and `refactor` admission paths land together. Adds three execution backends (LM Studio, hosted LLM, deterministic mock) — touches `packages/lmstudio-adapter` (likely renamed/abstracted) and `factory-config.schema.json`. Adds GitHub Actions workflows on the protostar repo + a self-hosted runner mode (security review ramps up). Introduces a new authority surface: bounded `pnpm add` (subprocess allowlist gets a curated package allowlist for the toy repo). Introduces a local HTTP dashboard surface (Q-17) that **conflicts with the dark-autonomy lock + the authority boundary** — see `<conflicts_flagged>` for mitigation options the planner must resolve before writing the relevant plan. Stress dimensions add a chaos harness for fault injection. The `report.json` family grows a sibling `stress-report.json` Zod schema in `packages/artifacts`.

**Requirements:** *(to be assigned by `/gsd-plan-phase 11` against the `STRESS-01..STRESS-N` prefix per Q-21; tentative slots: STRESS-01 archetype lift, STRESS-02 envelope expansion, STRESS-03 headless modes, STRESS-04 hosted-LLM backend, STRESS-05 mock-LLM backend, STRESS-06 no-stdin contract, STRESS-07 TTT seed + AC authoring, STRESS-08 stress-shape sustained-load, STRESS-09 stress-shape concurrency, STRESS-10 stress-shape fault-injection, STRESS-11 dashboard surface, STRESS-12 stress-report artifact, STRESS-13 TTT delivery exit gate)*.

</domain>

<carried_forward>
## Locked from Prior Phases / Constraints

- **Phase 10 cosmetic-only lock holds for Phase 10:** Phase 11 lifts the archetype lock — but Phase 10's plans, fixture matrix, and dogfood loop must remain on `cosmetic-tweak`-only. The Phase 11 lift MUST be additive (new admission paths registered alongside the existing one), not a rewrite of `admission-paths.ts`.
- **Phase 9 CLI surface lock:** Any new headless-mode invocation MUST go through Phase 9's commander dispatcher and `ExitCode` enum. No new top-level subcommand for stress; Phase 11 adds a `--mode stress|dogfood|headless` flag (or equivalent) to existing surfaces, OR ships a separate driver script under `scripts/` (per Q-19). No bypass of `stdout=data`.
- **Authority boundary:** Only `apps/factory-cli` + `packages/repo` do fs I/O. The Q-17 HTTP dashboard MUST live inside `apps/factory-cli` (new `apps/factory-cli/src/dashboard/` directory) or be moved to a separate process that the factory does not import. See `<conflicts_flagged>` for the dark-autonomy tension.
- **Append-only artifacts:** `.protostar/stress/<sessionId>/events.jsonl` (new) follows the same pattern as `refusals.jsonl`, evolution chain, calibration log. Atomic tmp+datasync+rename pattern from `snapshot-writer.ts` MUST be reused.
- **Phase 10 fixture matrix scope is locked:** Phase 11 MUST NOT regenerate or rewrite Phase 10's 7-row matrix. Phase 11 adds new fixture rows (or a sibling matrix) for `feature-add`/`bugfix`/`refactor` archetypes if needed.
- **PR safety regex + branch template:** Inherited from Phase 7 — `^[a-zA-Z0-9._/-]+$`. Stress runs (especially concurrent runs in Q-10b) MUST allocate distinct branch names that pass this regex.
- **Ambiguity gate ≤0.2:** Hard contract from INTENT-01. Q-08's chosen approach (rich AC up-front) MUST drive the score below 0.2 by construction; if the TTT seed scores above 0.2 the gate refuses it as expected and the operator iterates the AC list — no calibration of the threshold.
- **Cumulative branch model is OUT for Phase 11:** Q-12 chose branch-per-run-no-merge for everything. The TTT seed MUST be deliverable in one shot (single run, single PR) — no multi-run accumulation, no factory auto-merge.
- **Token-budget unit remains v1.0+:** Q-15 explicitly rejects token-based caps. Repair iteration cap (`maxRepairLoops`) stays the unit; only the per-archetype default changes.
- **Toy repo is sacrificial:** PRs accumulate against unchanged `main`. Phase 11 stress sessions can produce dozens of open PRs on `zkeown/protostar-toy-ttt`; operator-driven `gh pr close` sweeps remain manual (DOG-05).

</carried_forward>

<decisions>

## 1. Scope & Exit Criteria

### Q-01 — TTT delivery definition
**Decision:** **PR opened + CI green + Playwright E2E spec asserts a full game can be played** (option **b**).
**Rationale:** CI-green alone (a) lets a logically-broken game ship if tests are weak. Native-binary smoke (c) is more theatrical than verifying. Auto-merge + tag (d) breaks Phase 10's branch-per-run lock. Playwright is the right strength bar: it clicks 9 cells in a winning sequence, asserts a winner banner — verifiable, automatable, replayable.
**Note for planner:** The toy repo's CI MUST gain a Playwright job in addition to its existing `pnpm test + tauri build` checks. Two targets: web build (Playwright against `vite preview`) is the primary gate; native Tauri-app E2E via `tauri-driver`/`webdriverio` is **deferred** unless straightforward — cite the Tauri E2E docs in the research phase. The Playwright spec lives at `e2e/ttt.spec.ts` in the toy repo and is **immutable from the factory's side** — admission rule MUST refuse any plan whose `targetFiles` includes `e2e/**` (Q-13 strengthens this further with a sibling property-based test).
**Status:** Decided.

### Q-02 — Phase exit gate
**Decision:** **TTT delivered AND the stress session survives a documented load shape without crash/wedge** (option **d**).
**Rationale:** Conjunction of correctness AND resilience matches the phase title (`headless-mode-e2e-stress`) literally. Single-shot delivery (a) leaves resilience untested; consecutive deliveries (b) miss the stress dimension entirely; pass-rate (c) is informational, not a gate.
**Note for planner:** The exit gate is a single Boolean — `(ttt-delivered AND stress-clean)` — both must be true to close the phase. "Stress-clean" is parameterized by Q-10's three shapes: each shape has its own pass criterion (Q-14 tiers); "stress-clean" means **all three shapes** ran end-to-end and Q-11's stop-the-world condition was not triggered. Add an `11-VERIFICATION.md` checkbox per shape.
**Status:** Decided.

### Q-03 — Hard cap on phase
**Decision:** **Both run-count cap AND wall-clock cap, whichever fires first** (option **c**).
**Rationale:** Belt-and-suspenders. Numeric ceiling per shape (e.g., 50 attempts at TTT delivery) AND a 14-day wall-clock prevents the phase from drifting. If either fires, abort and re-discuss.
**Note for planner:** Numeric defaults (planner picks final values during research): TTT delivery cap = **50 attempts** OR **14 calendar days**; sustained-load stress cap = **500 runs** OR **7 calendar days**; concurrency stress cap = **20 sessions** OR **3 calendar days**; fault-injection stress cap = **100 fault injections** OR **3 calendar days**. Capture these as constants on `factory-config.schema.json` (`stress.caps.*`) so the operator can tune without code edits. On cap breach, the driver writes a `phase-11-cap-breach.json` artifact with which cap fired and the partial-progress summary, then exits non-zero.
**Status:** Decided.

## 2. Headless Execution & LLM Backend

### Q-04 — Headless mode shape
**Decision:** **All three modes supported — config flag selects backend** (option **d**).
**Rationale:** Each mode targets a different operating context: GH-hosted CI for public visibility + scheduled smoke, self-hosted runner for local-LLM + GH-Actions UX, local daemon for unattended overnight stress. Forcing one mode constrains future deployment. Cost is the new selector + three documented setup paths.
**Note for planner:** Add `factory.headlessMode: "github-hosted" | "self-hosted-runner" | "local-daemon"` to `factory-config.schema.json`. CLI flag `--headless-mode <mode>` (precedence over config). Three plans — one per mode — each landing the workflow file / launchd plist / GH Actions YAML alongside its mode-specific docs. Each mode plan owns its own admission-e2e contract (e.g., `headless-github-hosted.contract.test.ts` validates the workflow file references the published `@protostar/factory-cli` and never reads from a TTY).
**Status:** Decided.

### Q-05 — LLM execution backend
**Decision:** **Combination — hosted LLM backend (b) for real runs + deterministic mock (c) for stress shape testing** (option **d**).
**Rationale:** Hosted backend unblocks GH-hosted-runner mode (Q-04). Mock backend lets the stress dimension exercise the orchestration layer without LLM cost. Real "deliver TTT" runs can use either LM Studio (self-hosted-runner / local-daemon) OR hosted LLM (GH-hosted) — the orchestrator does not care.
**Note for planner:** Likely rename `packages/lmstudio-adapter` → `packages/llm-adapter` (or split: `lmstudio-adapter` stays + `hosted-llm-adapter` is new + `mock-llm-adapter` is new under `packages/`). Each adapter implements a single `LlmAdapter` interface. Selector: `factory.llmBackend: "lmstudio" | "hosted" | "mock"`. Hosted-backend MUST support an OpenAI-compatible interface (Anthropic Messages API + OpenAI Chat Completions API are both candidates — researcher decides). Mock-backend reads canned plan/judge JSON from `packages/fixtures/src/canned/` so stress runs are deterministic. Each adapter ships with its own admission-e2e no-fs contract (already established pattern from Phase 6).
**Status:** Decided.

### Q-06 — No-interactive-prompt audit
**Decision:** **Both — admission-e2e contract test + SECURITY-REVIEW.md narrative entry** (option **c**).
**Rationale:** Static AST scan catches silent regressions; SECURITY-REVIEW.md captures the audit reasoning and the explicit allowlist of legitimate stdin reads (e.g., signed-intent verification flow may legitimately read stdin under a flag — needs to be enumerated, not banned). Phase 10 Q-21 already established the contract-test-for-load-bearing-rules pattern.
**Note for planner:** New file `packages/admission-e2e/src/contracts/no-interactive-prompts.contract.test.ts`. Static AST scan of `apps/*/src/**/*.ts` and `packages/*/src/**/*.ts` — bans imports of `node:readline`, `prompts`, `inquirer`, `enquirer`, `@inquirer/*`, and direct usage of `process.stdin.on(...)`. Exception escape hatch: `// no-prompt-exception: <reason>` top-of-file comment, enumerated in SECURITY-REVIEW.md. SECURITY-REVIEW.md Phase-11 entry MUST list every accepted exception, the runtime guards that prevent it from blocking in headless mode (e.g., a `--non-interactive` flag that converts stdin reads into immediate refusal), and which Phase-11 plan added the guard.
**Status:** Decided.

## 3. Archetype Lift & TTT Spec Authoring

### Q-07 — Archetype lock lift
**Decision:** **Add `feature-add`, `bugfix`, AND `refactor` archetypes in one go** (option **b**).
**Rationale:** Single landing of all three minimizes admission-paths churn. TTT delivery only needs `feature-add`, but Q-10's mixed-seed stress shape benefits from all three (sustained-load runs against varied archetypes catch admission-rule cross-contamination earlier). Splitting by phase would re-open `admission-paths.ts` repeatedly.
**Note for planner:** PROJECT.md Out-of-Scope updated: remove "non-cosmetic archetypes" from out-of-scope; add a new lock revision dated 2026-04-28 noting Phase 11 adds the three archetypes with their per-archetype envelope defaults (Q-15) and admission rules. `packages/policy/src/admission-paths.ts` gains three new path entries; each path needs at least one passing fixture (`good-feature-add.json`, `good-bugfix.json`, `good-refactor.json`) AND one rejected fixture (`bad-feature-add-no-target.json`, etc.) to keep the Phase 1 PLAN-A-03 admission e2e coverage complete. **Note:** `bugfix` and `refactor` archetypes require their own AC normalization rules (different from `feature-add`'s greenfield-creation defaults) — researcher MUST scope this work and may recommend deferring `bugfix`/`refactor` to a v1.1 phase if the lift is too large; in that case, Phase 11 lifts `feature-add` only and the deferred items roll forward.
**Status:** Decided (with planner-permitted scope-down to `feature-add`-only if researcher finds the multi-archetype lift unsafe in one phase).

### Q-08 — TTT spec authoring approach
**Decision:** **Single high-level intent, ambiguity score lowered via richer AC up-front** (option **a**).
**Rationale:** Aligns with Q-12 (single-shot, no decomposition). The ambiguity scorer is the gate — it accepts thoroughly-specified intents regardless of feature size. Operator authors a comprehensive AC list (see Note); if the score still exceeds 0.2 the gate refuses it as expected, the operator iterates the AC.
**Note for planner:** TTT seed lives at `packages/fixtures/src/seeds/feature-add/ttt-game.json` (path follows Q-09). Suggested AC list (researcher MUST validate against the actual ambiguity scorer):
1. 3×3 grid renders 9 cells, each clickable
2. Clicking an empty cell places the current player's mark (X first, alternating)
3. Win detection covers 3 rows, 3 columns, 2 diagonals (8 win conditions)
4. Win UI shows the winning player and the winning line
5. Draw detection (all 9 cells filled, no winner) shows a draw UI
6. Restart button resets the board and starts a new game with X first
7. Game state lives in React state, no persistence to disk or storage
8. All UI is keyboard-accessible (cells reachable via Tab, Space activates)
9. New `e2e/ttt.spec.ts` Playwright spec already exists in the toy repo and MUST pass
10. New `tests/ttt-state.property.test.ts` operator-authored property test already exists and MUST pass
The intent text + AC are authored by the operator BEFORE Phase 11 plans run; commit them as `packages/fixtures/src/seeds/feature-add/ttt-game.json` and `packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts`. AC items 9 + 10 force the factory toward the operator-authored verification artifacts (Q-13).
**Status:** Decided.

### Q-09 — Seed library location
**Decision:** **Extend `packages/fixtures/src/seeds/` with a `feature-add/` subfolder** (option **a**).
**Rationale:** Reuses Phase 10's package; one library, multiple archetype subfolders. Path symmetry: `seeds/cosmetic-tweak/<id>.json`, `seeds/feature-add/<id>.json`, `seeds/bugfix/<id>.json`, `seeds/refactor/<id>.json`. Single import surface from the dogfood / stress drivers.
**Note for planner:** `packages/fixtures/src/index.ts` exports `seedLibrary` becomes a record keyed by archetype: `{ "cosmetic-tweak": Seed[], "feature-add": Seed[], "bugfix": Seed[], "refactor": Seed[] }`. Round-robin selectors in the dogfood/stress drivers iterate the union flattened by archetype + ordering. Add admission-e2e contract `seed-library-shape.contract.test.ts` pinning the shape so future seed additions cannot silently break consumers.
**Status:** Decided.

## 4. Stress Test Shape

### Q-10 — Stress dimensions
**Decision:** **All three (sustained load + concurrency + fault injection) as three separate stress runs, each with its own pass criterion** (option **d**).
**Rationale:** Three orthogonal axes, three orthogonal failure modes. Sustained load surfaces memory leaks + log accumulation; concurrency surfaces fs lock + pile-budget collisions; fault injection surfaces refusal-path correctness. Sequencing them as three discrete stress sessions (not interleaved) keeps each session's report.json clean.
**Note for planner:** Each stress shape gets its own plan and its own pass criterion (Q-14 tiers):
- **Plan: sustained-load stress** — 100+ runs sequentially, mixed seeds, measure pass rate + latency drift + .protostar artifact growth. Pass: ≥80% cosmetic, ≥50% feature-add, no orphaned-run leak, no monotonic latency increase.
- **Plan: concurrency stress** — K parallel runs (start with K=2, ramp to K=4) against the same toy on distinct branches. Pass: zero cross-run state corruption, zero pile-budget contention deadlocks, fs locks held briefly (<1s p99).
- **Plan: fault-injection stress** — chaos harness injects network drops (kill LM Studio mid-call), LLM timeouts (force AbortSignal), disk-full (full a tmp partition mid-write), abort signals (SIGINT during execution-coordination pile). Pass: every fault produces a structured refusal, runs cleanly transition to `cancelling`/`cancelled`/`orphaned` per Phase 9, no zombie processes, no half-written artifacts.
The chaos harness lives at `packages/stress-harness/` (new package) with injectable failure interceptors that wrap the LLM adapter, fs adapter, and subprocess runner.
**Status:** Decided.

### Q-11 — Failure isolation policy
**Decision:** **Stop-the-world: the whole stress session aborts on first wedge; full debugging pass before the next stress session** (option **c**).
**Rationale:** Aligns with the dark-factory `dark-except-hard-failures` posture. Highest signal-per-failure; cheap to implement. Throughput sacrifice is acceptable because Phase 11 stress sessions are not on the critical path of any operator workflow.
**Note for planner:** "Wedge" definition (researcher refines): a run that has not transitioned status in **>5× the p95 successful run duration** AND has no observable sentinel/cancel transition pending. The stress driver detects wedges by polling `protostar-factory status --json` (Phase 9 surface). On wedge detection: driver writes `.protostar/stress/<sessionId>/wedge-evidence.json` capturing the wedged run's latest manifest + the runs preceding it, transitions the session to `aborted`, exits non-zero. No automatic recovery; operator triage is required before re-running. Q-10's fault-injection plan MUST distinguish "injected fault that produced a structured refusal" (success) from "injected fault that produced a wedge" (stop-the-world failure of the harness, not the factory).
**Status:** Decided.

### Q-12 — Toy repo state model
**Decision:** **Branch-per-run-no-merge for everything; TTT seed is single-shot** (option **c**).
**Rationale:** One state model. Aligns with Phase 10 Q-03 lock (no merge automation). Forces TTT into a single-run delivery — Q-08(a) (rich AC) is the mechanism that makes single-shot feasible. If the factory cannot deliver TTT in one shot, the answer is "iterate the AC list," not "decompose the seed across runs."
**Note for planner:** No new branch-management code beyond what Phase 10 ships. TTT branch name follows Phase 10's `protostar/<runId>` template. PR opened against unchanged `main`. The Q-13 verification artifacts (Playwright + property test) MUST already exist on `main` BEFORE the TTT run starts — their existence is a precondition the stress driver checks (`gh api repos/zkeown/protostar-toy-ttt/contents/e2e/ttt.spec.ts` returns 200, similarly for the property test). If absent, the run refuses to start.
**Status:** Decided.

## 5. Pass / Verification Criteria

### Q-13 — Per-run game-correctness verification
**Decision:** **CI green + property-based / fuzz test against the game state machine** (option **c**).
**Rationale:** Strongest behavioral guarantee for game logic. Property tests catch off-by-one win-detect bugs that example-based Playwright specs miss (e.g., diagonal win where the diagonal includes a recently-cleared cell). Combined with Q-01 (Playwright E2E), the total verification is **CI green + Playwright E2E + property test** — three orthogonal checks, all operator-authored, none factory-editable.
**Note for planner:** The property test lives at `tests/ttt-state.property.test.ts` in the toy repo (NOT in protostar). Uses `fast-check` (or equivalent) to generate sequences of cell-click events; asserts invariants: (1) board has at most 9 marks; (2) marks alternate X/O strictly; (3) once a winner is declared, the game is over (no further state change); (4) winner declaration corresponds to one of the 8 win lines in the marks array; (5) restart resets to a known starting state. Property test is **immutable from the factory's side** — admission rule refuses any plan whose `targetFiles` includes `tests/ttt-state.property.test.ts` (companion to Q-01's `e2e/**` refusal). Researcher decides whether to add a single `e2e/ + tests/*.property.test.ts` refusal rule or two separate rules.
**Status:** Decided.

### Q-14 — Per-archetype pass-rate targets during stress
**Decision:** **Tiered targets — cosmetic ≥80%, feature-add ≥50%, stress-fault ≥30%** (option **a**).
**Rationale:** Concrete numbers; honest expectations per difficulty. Tiers report independently in `stress-report.json` so a high cosmetic pass rate does not mask feature-add failures.
**Note for planner:** `stress-report.json` schema (Q-18) carries per-archetype-tier rollups: `{ archetype: string, runs: number, passes: number, passRate: number, threshold: number, met: boolean }`. The exit gate (Q-02) does NOT fail on tier-threshold misses by itself — Q-02's Boolean only checks "stress session ran clean (no wedge per Q-11)." Tier misses produce a warning in the phase summary but do not block phase completion. This is intentional: pass-rate calibration is empirical (DOG-04 pattern); set the bar from observed results, not from an a-priori number.
**Status:** Decided.

### Q-15 — Repair iteration cap for feature-add
**Decision:** **Lift `maxRepairLoops` default for `feature-add` archetype (e.g., 3× cosmetic-tweak default), keep cosmetic-tweak default unchanged** (option **a**).
**Rationale:** Greenfield game code legitimately needs more repair iterations than a single-file color tweak. Per-archetype default is the right unit of variation. Token-budget cap is explicitly v1.0+ (PROJECT.md).
**Note for planner:** Concrete numbers (researcher confirms against actual cosmetic-tweak observed iteration counts):
- `cosmetic-tweak` default: keep current Phase 5 schema 1.4.0 default (e.g., **3** loops)
- `feature-add` default: **9** loops (3× cosmetic)
- `bugfix` default: **5** loops (between cosmetic and feature-add)
- `refactor` default: **5** loops
Schema bump: `confirmed-intent.schema.json` adds per-archetype `maxRepairLoops` defaults under `capabilityEnvelope.budget.maxRepairLoops` — likely a discriminated union by archetype, OR a sibling field `maxRepairLoopsByArchetype: Record<Archetype, number>`. Researcher chooses the schema shape; both options preserve backwards compat with existing fixtures via a default fallback.
**Status:** Decided.

## 6. Capability Envelope Expansion

### Q-16 — Envelope changes for `feature-add`
**Decision:** **Multi-file writes + bounded `pnpm add` (allowlist of pre-approved packages)** (option **b**).
**Rationale:** TTT may want a state-mgmt lib (zustand, jotai) or a property-test lib for the toy's repo (`fast-check` for Q-13's property test). Allowlist contains the blast radius without forbidding the use case. The subprocess allowlist machinery from Phase 3 Q-08 is the enforcement seam.
**Note for planner:** Allowlist contents (operator-curated; researcher confirms against the toy repo's existing dep set + the AC list in Q-08): `fast-check`, `@playwright/test`, `zustand`, `clsx`, `react-aria` (preliminary list — researcher refines). Allowlist lives at `packages/repo/src/pnpm-add-allowlist.ts` (Phase 3 boundary — only `repo` does subprocess). New schema field on the `feature-add` admission path: `pnpm.allowedAdds: string[]` capped to the allowlist; admission rule rejects plans that propose `pnpm add <pkg>` where `<pkg>` is not on the list. **Authority impact:** SECURITY-REVIEW.md Phase-11 entry MUST enumerate the allowlist, the threat model (what a malicious package could do given the subprocess + fs surface), and the operator approval cadence for adding entries.
**Status:** Decided.

## 7. Operator Surface During Stress

### Q-17 — Live observability
**Decision:** **Optional live HTML dashboard served from `.protostar/stress/<sessionId>/dashboard.html` on a local port** (option **c**).
**Rationale (operator preference):** Operator wants real-time visibility during multi-day stress sessions; the Phase 9 `status` poll surface is insufficient for stress.
**⚠ Internal tension:** This decision **directly conflicts** with two existing locks:
1. **Dark-autonomy lock** (PROJECT.md): "no progress logs; the only human-facing output is the evidence bundle and hard-failure errors." A live dashboard is by definition not dark.
2. **Authority boundary** (PROJECT.md + AGENTS.md): "only `apps/factory-cli` and `packages/repo` may touch the filesystem." An HTTP server is a new authority surface (network egress / LISTEN socket) not currently anywhere in the boundary table.
3. **TUI deferral** (Phase 9 Notes): "TUI is deferred. The product feel is 'boring CLI you trust.'" A dashboard is the same shape.
**Mitigation directive for planner (researcher MUST resolve before plan):** Treat this as a **Phase 11 lock revision proposal**, not a fait-accompli decision. The researcher MUST present the operator with three resolved options before the dashboard plan is written:
- **(R1)** Carve out a "stress-only" exception to the dark-autonomy lock — dashboard runs ONLY when invoked via the stress driver, never during dogfood or normal `run` invocations. Update PROJECT.md Constraints with an explicit `dark-autonomy-exception: stress-mode` entry. The HTTP server lives in `apps/factory-cli/src/dashboard/` (inside the existing authority surface). Loopback bind only (`127.0.0.1:<port>`); no auth needed.
- **(R2)** Replace the dashboard with a JSONL append (`.protostar/stress/<sessionId>/events.jsonl`) the operator voluntarily `tail -f`s. No HTTP surface; no dark-autonomy violation; no authority boundary widening. Operator gets a passive log instead of a live UI.
- **(R3)** Move the dashboard out-of-process: a separate `protostar-stress-dashboard` binary (or an external script) reads the events.jsonl from (R2) and renders a TUI/web UI. Keeps the factory dark; the dashboard is a sibling tool, not part of the factory authority surface.
**Recommendation:** **(R2)** is the smallest change consistent with existing locks; **(R3)** is the smallest change that gives the operator a live UI without lock revision. **(R1)** requires PROJECT.md edits and SECURITY-REVIEW.md treatment of the loopback HTTP surface — feasible, but the cost-benefit needs operator confirmation.
**Status:** **Decided directionally (live UI desired); concrete implementation pending researcher's R1/R2/R3 resolution.**

### Q-18 — Stress-report artifact
**Decision:** **New artifact type `stress-report.json` with its own Zod schema in `packages/artifacts`** (option **b**).
**Rationale:** Dogfood and stress are conceptually different artifacts (different consumers, different fields, different lifecycles). Sharing a schema would force optional-field bloat on both. Two snapshot tests, two doc entries — symmetric with how delivery / review / evaluation reports each have their own schema.
**Note for planner:** New file `packages/artifacts/src/stress-report.schema.ts` (Zod). Schema fields:
```
{ sessionId, startedAt, finishedAt, totalRuns, headlessMode, llmBackend,
  shape: "sustained-load" | "concurrency" | "fault-injection",
  perArchetype: Array<{ archetype, runs, passes, passRate, threshold, met }>,
  perRun: Array<{ runId, seedId, archetype, outcome, prUrl?, ciVerdict?, durationMs, faultInjected? }>,
  wedgeEvent?: WedgeEvidence,  // present only if Q-11 stop-the-world fired
  capBreached?: { kind: "run-count" | "wall-clock", value, limit } }
```
Lock via `packages/admission-e2e/src/contracts/stress-report-snapshot.contract.test.ts`. Path: `.protostar/stress/<sessionId>/stress-report.json`. Atomic write via the canonical-json + tmp+rename pattern. Phase 9 prune scope MUST extend to `.protostar/stress/` (sibling concern to Phase 10's `.protostar/dogfood/` extension).
**Status:** Decided.

## 8. Evidence, Driver & Plan Numbering

### Q-19 — Stress driver
**Decision:** **New `scripts/stress.sh` separate from dogfood; bash for sequential stress only** (option **b**).
**Rationale (operator preference):** Keep the dogfood driver narrow; stress is a separate operator workflow with its own resume/cursor semantics.
**⚠ Internal tension:** Q-10's chosen stress dimensions include **concurrency** and **fault injection** — neither fits cleanly in bash. Bash can `xargs -P` or `&` background processes for concurrency, but synchronization, structured cancellation, and chaos harness wiring (Q-10's fault injection) are awkward in shell.
**Mitigation directive for planner:** Implement the stress driver as **bash for sustained-load shape only**, AND a **TS script under `apps/factory-cli/src/scripts/stress.ts` for the concurrency + fault-injection shapes**. Each shape's plan owns its driver. Both drivers share a common `stress-session.ts` library (cursor file, report.json writer, wedge detection per Q-11) under `apps/factory-cli/src/stress/`. The bash script is the simple one (loop + call); the TS script handles concurrency/chaos. **Document this split explicitly** so future maintainers do not try to unify.
**Status:** **Decided directionally (split bash + TS); concrete file paths pinned by the relevant plans.**

### Q-20 — Plan ordering
**Decision:** **Lift → Enable → Stress → Deliver** (option **a**).
**Rationale:** Archetype lift is a precondition for TTT; envelope expansion is a precondition for archetype lift to mean anything; headless audit is a precondition for any headless run. Stress shapes can run in parallel only after the lift is done. TTT delivery is the exit gate.
**Note for planner:** Suggested wave structure (planner finalizes during plan-phase):
- **Wave 1 (sequential, foundational):**
  - 11-01: Archetype lift (Q-07) — `feature-add`/`bugfix`/`refactor` admission paths + per-archetype envelope defaults (Q-15) + per-archetype admission-rule fixtures
  - 11-02: Envelope expansion (Q-16) — multi-file writes + `pnpm add` allowlist on `feature-add` path
  - 11-03: Headless no-prompt audit (Q-06) — admission-e2e contract + SECURITY-REVIEW.md entry
- **Wave 2 (parallel, enabling):**
  - 11-04: Headless modes (Q-04) — three workflow/runner/daemon configs + per-mode admission-e2e contracts
  - 11-05: LLM backend abstraction (Q-05) — `LlmAdapter` interface + hosted-LLM adapter + mock-LLM adapter + adapter selector
  - 11-06: TTT seed authoring (Q-08) — seed JSON + AC list + ambiguity scoring validation
  - 11-07: Stress driver split (Q-19) — bash sustained-load + TS concurrency/fault drivers + shared `stress-session` lib
  - 11-08: Observability resolution (Q-17) — researcher's R1/R2/R3 resolution lands as a plan
  - 11-09: Stress-report artifact (Q-18) — Zod schema + admission-e2e snapshot contract + prune scope extension
- **Wave 3 (parallel, stress execution):**
  - 11-10: Sustained-load stress (Q-10 part 1) — 100+ run session against mixed seeds; measure tier pass rates (Q-14) + latency drift
  - 11-11: Concurrency stress (Q-10 part 2) — K=2..4 parallel runs against distinct branches
  - 11-12: Fault-injection stress (Q-10 part 3) — `packages/stress-harness/` chaos package + injection scenarios + refusal validation
- **Wave 4 (sequential, exit gate):**
  - 11-13: TTT delivery (Q-01, Q-12) — single-shot run of the TTT seed; Playwright + property test gating; PR opens green
  - 11-14: Phase verification — both halves of Q-02 (`ttt-delivered AND stress-clean`) checked into `11-VERIFICATION.md`
**Status:** Decided.

### Q-21 — Requirement labeling
**Decision:** **`STRESS-01..STRESS-N`** (option **a**).
**Rationale:** Matches the phase title and dominant theme. Single prefix is the project pattern.
**Note for planner:** Requirements get assigned during `/gsd-plan-phase 11` against the wave breakdown above. Tentative slot mapping is in `<domain>` Requirements paragraph; planner adjusts as plans are drafted.
**Status:** Decided.

</decisions>

<conflicts_flagged>
## Internal Tensions for the Researcher

Three answers create real tension with prior locks. The planner MUST resolve these before the affected plans are drafted — do not silently choose a side.

### Conflict 1 — Dashboard vs. dark-autonomy + authority boundary (Q-17)
**Where:** Q-17 chose a live HTTP dashboard.
**Conflicts with:**
- PROJECT.md `dark-except-hard-failures` lock
- AGENTS.md authority boundary (only `factory-cli` + `repo` touch fs/network)
- Phase 9 TUI deferral
**Resolution path:** Three options (R1/R2/R3) enumerated in the Q-17 Note. Researcher MUST surface these to the operator and lock the choice before `11-08` is planned. Recommendation: **R2** (events.jsonl tail) for v0.1, with **R3** (sibling tool) as a follow-on.

### Conflict 2 — Multi-archetype lift scope (Q-07)
**Where:** Q-07 chose `feature-add` + `bugfix` + `refactor` together.
**Conflicts with:** TTT delivery (Q-01) only requires `feature-add`. Adding `bugfix` and `refactor` triples the admission-rule + AC-normalization + fixture work.
**Resolution path:** Researcher scopes the multi-archetype lift cost during `11-01` research. If the cost crosses a "more than 50% of Phase 11's planned effort" threshold, fall back to `feature-add`-only and roll `bugfix`/`refactor` to a v1.1 phase. The decision is binary: all three OR feature-add-only, never two-of-three (uneven).

### Conflict 3 — Bash driver vs. concurrency/fault stress shapes (Q-19 + Q-10)
**Where:** Q-19 chose bash; Q-10 chose all three stress shapes including concurrency + fault injection.
**Conflicts with:** Bash is a poor fit for structured concurrency, signal handling, and chaos injection.
**Resolution path:** Split — bash for sustained-load only, TS for concurrency + fault. Documented in the Q-19 Note. No further operator input needed; planner pins paths.

</conflicts_flagged>

<specifics>
## Specific Ideas

- **TTT exit gate is a Boolean conjunction** — `(ttt-delivered AND stress-clean)`. Both must be true. Don't ship Phase 11 with one half done.
- **Verification artifacts are operator-authored and immutable** — `e2e/ttt.spec.ts` (Playwright) AND `tests/ttt-state.property.test.ts` (fast-check). Both live in the toy repo on `main` BEFORE Phase 11 starts. Admission rule refuses any plan whose `targetFiles` touches them.
- **Single-shot TTT** — Q-12 + Q-08 lock TTT to one run, one PR. If iteration is needed, the operator iterates the AC list (richer spec → lower ambiguity score), not the seed sequence.
- **`pnpm add` allowlist is a security surface** — every entry needs SECURITY-REVIEW.md treatment. Preliminary list: `fast-check`, `@playwright/test`, `zustand`, `clsx`, `react-aria`. Researcher refines.
- **Stress sessions are stop-the-world on wedge** — first wedge aborts the session, no auto-recovery. Operator triages before resuming.
- **Three stress shapes, three plans, three pass criteria** — sustained-load, concurrency, fault-injection. Each has its own report.json row family.
- **Q-15 archetype repair-loop defaults** — cosmetic 3, bugfix 5, refactor 5, feature-add 9 (researcher confirms against observed cosmetic iteration counts).
- **Q-03 caps** — TTT 50 attempts / 14 days; sustained 500 runs / 7 days; concurrency 20 sessions / 3 days; fault 100 injections / 3 days. Configurable via `factory-config.schema.json`.
- **Phase 9 prune extension** — `.protostar/stress/` joins `.protostar/dogfood/` and `.protostar/runs/` in the prune scope. Same active-guard + JSONL-preservation rules.
- **Tier pass rates report-only** — Q-14 tiers (cosmetic ≥80%, feature-add ≥50%, fault ≥30%) produce warnings, not phase blockers. Phase blocker is wedge-or-not.
- **Toy repo precondition check** — TTT run refuses to start unless `e2e/ttt.spec.ts` and `tests/ttt-state.property.test.ts` already exist on `main`. Use `gh api` to verify.
- **PROJECT.md needs three lock revisions in Phase 11** — (1) archetype lift dated 2026-04-28, (2) dev/runtime deps for `fast-check`/`@playwright/test`/etc., (3) Q-17's R1/R2/R3 resolution if R1 is chosen.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`packages/admission-e2e/`** — home of contract tests; gains four new contracts in Phase 11: `no-interactive-prompts.contract.test.ts` (Q-06), per-headless-mode contracts (Q-04), `seed-library-shape.contract.test.ts` (Q-09), `stress-report-snapshot.contract.test.ts` (Q-18).
- **`packages/fixtures/`** (Phase 10 owns) — gains `feature-add/`, `bugfix/`, `refactor/` subfolders under `seeds/`; `__fixtures__/` mirrors with archetype subfolders for Q-09's seedLibrary shape.
- **`packages/policy/src/admission-paths.ts`** — single seam for archetype lift (Q-07); add three new paths.
- **`packages/repo/src/`** — owns subprocess allowlist (Phase 3 Q-08); gains `pnpm-add-allowlist.ts` for Q-16. Authority boundary applies — only `repo` runs subprocess.
- **`packages/lmstudio-adapter/`** — Q-05 likely abstracts this into a generic `LlmAdapter` interface with multiple impls; researcher decides between rename + extend OR add sibling packages (`hosted-llm-adapter`, `mock-llm-adapter`).
- **`apps/factory-cli/src/commands/`** — Phase 9 commander dispatcher; gains `--headless-mode` flag passthrough; gains `dashboard/` subdir if Q-17 R1 wins.
- **`packages/artifacts/`** — gains `stress-report.schema.ts` (Q-18); Zod + canonical-json pattern from Phase 9 Plan 02 + 03.
- **Phase 9 prune subcommand** — already has active-status guard; Phase 11 extends scope to `.protostar/stress/<sessionId>/`.

### Established Patterns
- **Append-only JSONL artifacts** — `refusals.jsonl`, evolution chain, calibration log. Q-17 R2's `events.jsonl` follows this. Atomic tmp+datasync+rename mirrors `snapshot-writer.ts`.
- **Per-archetype admission paths** — fixtures cascade pattern (`bad-*.json` per path). Q-07 adds three new paths; each needs at least one `good-*.json` and one `bad-*.json`.
- **`factory-config.schema.json` for runtime knobs** — Q-03 caps, Q-04 headlessMode, Q-05 llmBackend, Q-15 maxRepairLoopsByArchetype, Q-16 pnpm.allowedAdds.
- **Lock revision in PROJECT.md** — every new dev/runtime dep + every lock change gets a dated entry. Phase 11 adds at least: archetype lift, fast-check, @playwright/test, optional dashboard exception.
- **Admission-e2e static-AST contracts** — pattern from `authority-no-fs.contract.test.ts`, `dogpile-adapter-no-fs.contract.test.ts`. Q-06's no-prompt contract follows the same shape.

### Integration Points
- **Toy repo `../protostar-toy-ttt`** — must have Playwright CI job + `e2e/ttt.spec.ts` + `tests/ttt-state.property.test.ts` on `main` BEFORE Phase 11 stress + delivery plans run. This is a pre-Phase-11 operator task; Phase 11 plans assume it.
- **GH Actions on protostar repo** — Q-04 GH-hosted-runner mode adds `.github/workflows/headless-stress.yml` (or similar) on the protostar repo itself; cron + workflow_dispatch.
- **Self-hosted runner registration** — Q-04 self-hosted-runner mode requires registering a runner against `zkeown/protostar` (or a dedicated org). Security caveats: never enable for forks; runner is single-tenant.
- **Hosted LLM provider** — Q-05 introduces a new external dep on Anthropic / OpenAI. PAT/API-key handling expands `.env.example` (Phase 3 REPO-09 pattern). Cost is real; suggest a per-session spend cap on `factory-config.schema.json`.
- **`packages/stress-harness/`** (new) — chaos package for Q-10 fault injection. Wraps LlmAdapter + FsAdapter + SubprocessRunner with injectable failure interceptors. Lives outside `apps/factory-cli` because it is consumed by stress drivers, not factory runs.

</code_context>

<deferred>
## Deferred Ideas

- **Cumulative branch model + auto-merge** — Q-12 chose branch-per-run-no-merge. A future "real-world drift" mode that merges accepted PRs and runs subsequent runs against moving `main` is interesting; v1.1+.
- **Native Tauri E2E** — Q-01 chose Playwright against the web build. `tauri-driver` + `webdriverio` for native binary testing is feasible but adds toolchain; defer unless researcher finds it cheap.
- **Multi-LLM panel for stress** — current judge panel is heterogeneous local (PROJECT.md). Stress dimension could vary judge composition (mock judges vs real); v1.1+.
- **Token-budget unit** — explicitly v1.0+ per PROJECT.md. Q-15 stays on iteration count.
- **Dashboard as sibling tool (Q-17 R3)** — even if R2 (events.jsonl) wins for v0.1, a future `protostar-stress-dashboard` binary that renders the JSONL is natural follow-on.
- **Bugfix + refactor archetypes (if Q-07 scopes down to feature-add only)** — the multi-archetype lift fallback. Roll to v1.1 phase if cost crosses the 50% threshold.
- **Cross-archetype matrix rows** — Phase 10's matrix is cosmetic-only. Phase 11 could add `feature-add` rows; deferred unless researcher finds the bandwidth.
- **Concurrency K > 4** — Q-10 ramps concurrency K=2 → K=4. Higher K is interesting for finding race conditions; defer until K=4 is stable.
- **Cloud-judge backends** — explicitly v1.0+ per PROJECT.md. Q-05 hosted-LLM is for execution, not judging.
- **`pnpm add` allowlist auto-curation** — Q-16's allowlist is operator-curated. Future: auto-derive from a vetted registry.

</deferred>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before acting on Phase 11.**

### Phase 11 scope
- `.planning/REQUIREMENTS.md` — append `STRESS-01..STRESS-N` requirement block during `/gsd-plan-phase 11`; align with the wave breakdown in Q-20
- `.planning/ROADMAP.md` Phase 11 section — goal + tentative requirements + success criteria (this file's source)
- `.planning/PROJECT.md` Constraints + Out-of-Scope — three lock revisions due in Phase 11 (archetype lift, new deps, optional dashboard exception)
- `.planning/STATE.md` Phase Status row 11

### Cross-phase locks Phase 11 inherits
- `.planning/phases/10-v1-hardening-dogfood/10-CONTEXT.md` — `cosmetic-tweak`-only lock for Phase 10 still holds; Phase 11 lift is additive; toy repo posture (branch-per-run-no-merge); `packages/fixtures/` shape; Q-21 admission-e2e authority-boundary contract pattern
- `.planning/phases/09-operator-surface-resumability/09-CONTEXT.md` — CLI surface lock (commander dispatcher, ExitCode enum, stdout=data, --json, prune scope); Q-17 R3 (sibling-process dashboard) reuses this surface
- `.planning/phases/08-evaluation-evolution/` — calibration JSONL pattern + lineage chain; mock-LLM adapter (Q-05) follows the canonical-JSON write pattern
- `.planning/phases/07-delivery/` — Octokit + push surface; Q-12 toy-repo PR target; Q-01 PR + CI green pass criterion ancestor
- `.planning/phases/05-review-repair-loop/` — `maxRepairLoops` defaults seam (Q-15)
- `.planning/phases/03-repo-runtime-sandbox/` — subprocess allowlist (Q-16); fs adapter authority boundary (Q-17 R1 conflict source)
- `.planning/phases/02-authority-governance-kernel/` — capability envelope shape (Q-15, Q-16); admission-decision evidence pattern
- `.planning/phases/01-intent-planning-admission/` — ambiguity scorer (Q-08); admission paths (Q-07); fixture cascade pattern (Q-09)

### Existing code anchors
- `packages/policy/src/admission-paths.ts` — Q-07 archetype lift seam
- `packages/intent/src/ambiguity-scoring.ts` — Q-08 0.2 gate; AC-driven score lowering
- `packages/repo/src/runner.ts` (or equivalent) — Q-16 subprocess allowlist
- `packages/artifacts/src/canonical-json.ts` — Q-18 stress-report Zod + canonical-write pattern (Phase 9 Plan 02)
- `packages/admission-e2e/src/contracts/authority-no-fs.contract.test.ts` — Q-06 no-prompt contract template
- `apps/factory-cli/src/commands/` — Phase 9 commander dispatcher
- `apps/factory-cli/src/snapshot-writer.ts` — atomic tmp+datasync+rename pattern for Q-17 R2 events.jsonl + Q-18 stress-report.json
- `scripts/dogfood.sh` (Phase 10) — sibling driver template for `scripts/stress.sh` (Q-19)

### External / new dependencies
- Tauri v2 docs — toy-repo Tauri build + optional native E2E (Q-01)
- Playwright docs — `e2e/ttt.spec.ts` authoring (Q-01); `@playwright/test` runner config
- fast-check docs — `tests/ttt-state.property.test.ts` authoring (Q-13)
- Anthropic Messages API + OpenAI Chat Completions API — Q-05 hosted-LLM adapter
- GitHub Actions self-hosted runner docs — Q-04 self-hosted-runner mode security caveats
- changesets + knip + zod-to-json-schema (Phase 10) — Phase 11 inherits these dev-deps; new deps in Phase 11 (`fast-check`, `@playwright/test`, hosted-LLM SDK) get the same lock-revision treatment

### Security
- `SECURITY.md` (Phase 10 creates at repo root) — Phase 11 amends with: hosted-LLM API key handling, self-hosted runner caveats, `pnpm add` allowlist threat model, optional dashboard surface (if Q-17 R1)
- `.planning/SECURITY-REVIEW.md` (Phase 10 creates) — Phase 11 appends per-Q audit entries: Q-06 no-prompt exception list, Q-16 pnpm-add allowlist + threat model, Q-17 dashboard resolution

</canonical_refs>

---

*Phase: 11-headless-mode-e2e-stress*
*Context gathered: 2026-04-28 (--power mode, 21/21 answered)*
