# Phase 10: V1 Hardening + Dogfood — Context

**Gathered:** 2026-04-28
**Source:** `10-QUESTIONS.json` (22/22 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Stand up the sacrificial sibling toy repo, prove the cosmetic-tweak loop end-to-end against it, capture the 7-row outcome fixture matrix, harden the package surface (per-package READMEs, knip-enforced exports, changesets release flow, public `@protostar/*` packages), and ship the v0.1 security review (public SECURITY.md + internal audit log + admission-e2e authority-boundary contract). Phase 10 is where the 2026-04-24 cosmetic-tweak loop actually ships — DOG-03 is the first real end-to-end run; DOG-04's ≥10×≥80% loop is the exit gate; everything in between (matrix capture, docs, hygiene, release scripts, security artifacts) is parallelizable around it.

**Blast radius:** First time the factory mutates a real GitHub repo it didn't author. First public PR surface (toy is public under personal account); commits + PRs are visible. First version of the public `@protostar/*` npm packages — every exported symbol becomes a stability commitment from this tag forward. Authority-boundary enforcement moves from AGENTS.md prose to admission-e2e contract tests; the exception list becomes a load-bearing artifact. Changesets, knip, and zod-to-json-schema are new dev-deps. SECURITY.md is the first GitHub-recognized security surface and signals the trust posture downstream consumers anchor to.

**Requirements:** DOG-01, DOG-02, DOG-03, DOG-04, DOG-05, DOG-06, DOG-07, DOG-08.

</domain>

<carried_forward>
## Locked from Prior Phases / Constraints

- **v0.0.1 cosmetic-tweak loop (2026-04-24):** demo+ cosmetic-tweak loop on Tauri+React toy via Octokit PR; pnpm+Turbo monorepo; LM Studio Qwen3-Coder exec + Qwen3-80B judge. Phase 10 is where this loop actually ships (DOG-02 first row + DOG-04 seed).
- **Phase 7 deferral:** Real toy-repo PR + screenshots were explicitly deferred from Phase 7 to Phase 10. Phase 10 is the place that closes that gap.
- **Phase 9 CLI surface lock:** subcommand router (`commander` / `@commander-js/extra-typings` under `apps/factory-cli/src/commands/`), curated `ExitCode` enum, strict `stdout = data` discipline, `--json` flag for status/inspect/deliver/prune. Phase 10 docs (Q-15) and dogfood scripts (Q-09) MUST conform — never assume a richer CLI than Phase 9 ships.
- **Archetype scope:** Only `cosmetic-tweak` is wired (`packages/policy/src/admission-paths.ts`). The 7-row matrix outcomes (`accepted`, `ambiguous`, `bad-plan`, `failed-execution`, `repaired-execution`, `blocked-review`, `pr-ready`) come from the **outcome axis**, not the archetype axis. All matrix rows run on `cosmetic-tweak`.
- **Ambiguity gate:** `INTENT_AMBIGUITY_THRESHOLD = 0.2` is a hard contract. The `ambiguous` fixture row (Q-07) MUST trigger refusal at this gate; no calibration in v0.1.
- **Out of scope (PROJECT.md):** Beads memory graph, parallel waves, adaptive judge sizing, factory self-editing, numeric calibration of consensus thresholds, token-budget unit, cloud judges, non-cosmetic archetypes, GUI/TUI intake, Ouroboros runtime. Phase 10 plans MUST NOT add any of these.
- **Authority boundary:** Only `apps/factory-cli` and `packages/repo` do filesystem I/O. Any new dogfood/release helpers that touch fs land in `apps/factory-cli/src/` or `packages/repo/src/`. This boundary moves from prose to programmatic enforcement in Q-21.
- **Runtime-deps lock posture:** New Phase 10 candidates (`@changesets/cli`, `knip`, `zod-to-json-schema`) are dev-only — still flag in PROJECT.md Constraints lock revision (mirrors Phase 3's `isomorphic-git` + `diff` and Phase 9's `commander` entries).
- **PR safety regex:** Octokit + PAT from env; never pass branch names to a shell unvalidated (`^[a-zA-Z0-9._/-]+$`). Phase 10 dogfood automation MUST NOT regress this.
- **Phase prerequisites:** Phases 6, 7, 8 are not all fully verified per `STATE.md` (Phase 6 verification gaps, Phase 7 deferred toy PR, Phase 8 verification pending). Phase 10 plans should ASSUME the deliver path works because Phase 9 wires it; the first DOG-03 run is also the de-facto verifier of the deferred Phase 7 work.
</carried_forward>

<decisions>

## 1. Toy Repo & First Seed (DOG-01, DOG-03)

### Q-01 — Toy repo scaffold approach
**Decision:** **`create-tauri-app` + intentional rough edges.** Scaffold the standard Tauri+React+TypeScript template into `../protostar-toy-ttt`, then add a small set of intentionally-low-quality components: a `PrimaryButton` with a hard-coded color and no `:hover`, a `Card` with no shadow/border, a `NavBar` missing `aria-*` attributes. These become the obvious affordances for cosmetic-tweak seeds to target.
**Rationale:** Vanilla template is too minimal — seeds would have nothing predictable to grab. Curated demo (option b) sanitizes the surface and removes the "obvious improvements" that make dogfood signal real. Rough edges give the factory observable wins per run.
**Note for planner:** Document the exact rough edges in the toy repo's README so a human reviewer of factory PRs can tell intentional debt from regression. The rough-edge components are NOT acceptance criteria for the toy itself; they are seed fixtures for the factory.
**Status:** Decided.

### Q-02 — Toy repo GitHub visibility
**Decision:** **Public under your personal account** (`zkeown/protostar-toy-ttt`).
**Rationale:** Dogfood evidence (PR links, screenshots, "the factory wrote this") is part of the marketing surface. The toy is sacrificial — there's nothing private about it. PAT scope is the same either way; public surfaces also create a public failure surface, so DOG-04's pass-criterion (Q-10) must be tight.
**Note for planner:** PAT scoping plan: a dedicated `protostar-dogfood` PAT with `repo` scope limited to `zkeown/protostar-toy-ttt` (fine-grained PAT). README of the toy repo MUST disclose: "All PRs in this repo are opened by the Protostar factory; this is dogfood, not human work."
**Status:** Decided.

### Q-03 — Toy repo state between dogfood runs
**Decision:** **Branch-per-run, never merge anything.** Every dogfood run cuts a fresh branch off the toy's `main`; PRs are opened and left open against the unchanged baseline. After 10 runs there are 10 open PRs against the same baseline `main`.
**Rationale:** Cleanest signal — every run starts from identical state, so the pass-rate denominator is honest. No merge automation surface to build (and no risk of a bad merge poisoning later runs). Open PRs accumulate as visible evidence; they can be closed in batch by hand.
**Note for planner:** No merge step in the dogfood driver (Q-09). The driver is responsible for picking a fresh branch name (e.g., `protostar/<runId>`) and confirming `main` is unchanged before each run. PR cleanup is an operator-driven step (likely a one-line `gh` script in DOG-05's docs); not in the loop.
**Status:** Decided.

### Q-04 — First seed (DOG-03 baseline + DOG-04 source)
**Decision:** **A small seed library of 3 hand-curated cosmetic seeds.** DOG-03 = seed #1 ("Change the primary button color and add a hover state" — verbatim 2026-04-24 wording). DOG-04's 10× loop draws round-robin from the 3-seed library.
**Rationale:** Honors the locked DOG-03 wording while giving DOG-04 enough variety to surface non-trivial signal (a pass rate computed against the same identical seed 10 times is just measuring temperature). Three is small enough to hand-author; large enough to vary the surface area.
**Note for planner:** Seed library lives at `packages/fixtures/src/seeds/` (consistent with Q-05). Each seed = `{ id, intent: string, archetype: 'cosmetic-tweak', notes: string }`. Initial three:
1. `button-color-hover` — verbatim DOG-03: "Change the primary button color and add a hover state"
2. `card-shadow` — "Add a subtle shadow and rounded corners to the card component"
3. `navbar-aria` — "Add aria-label attributes to nav-bar buttons for accessibility"
DOG-03 plan asserts seed #1 specifically; DOG-04 driver iterates the library.
**Status:** Decided.

## 2. Fixture Matrix (DOG-02)

### Q-05 — Fixture storage location
**Decision:** **New `packages/fixtures/` package.** Owned by Phase 10; exports typed accessors for matrix rows and seed library. Lives alongside the other domain packages (consistent with the AGENTS.md domain-first rule).
**Rationale:** Co-locating in `factory-cli` (a) bloats an already-large surface; `.planning/fixtures/` (c) breaks the convention that tests don't reach across `.planning`; piling into `admission-e2e` (d) overloads its scope. A new package is the clean answer; the boundary already established by Phase 8's evolution-snapshot package shape applies here too.
**Note for planner:** New package: `packages/fixtures` with `package.json` (`@protostar/fixtures`, `private: false` per Q-17), `src/index.ts` exporting `getMatrixRow(outcome)`, `listOutcomes()`, `seedLibrary`. Add to `pnpm-workspace.yaml`, `tsconfig.references`, root `tsconfig.json`. Plan should land the empty package skeleton FIRST, then populate per-row plans.
**Status:** Decided.

### Q-06 — Fixture capture format
**Decision:** **Hybrid — TS assertion file + minimal captured artifacts (manifest.json + review-gate.json) per row.** No traces, no journals, no piles — just the manifest + the gate decision + a hand-authored TS assertion describing the expected shape.
**Rationale:** Full snapshots (a) bloat the repo and break on every artifact-shape change. Assertion-only (c) loses "this is what good looks like" as readable evidence. Hybrid keeps each row small (~5–20 KB) AND keeps real factory output as committed evidence; assertions are declarative and survive cosmetic JSON drift.
**Note for planner:** Per-row layout under `packages/fixtures/__fixtures__/<outcome>/`:
- `expectations.ts` — exports `{ outcome, archetype, expected: { manifestStatus, reviewVerdict, hasPrUrl?, refusalKind? } }`
- `manifest.json` — captured run manifest
- `review-gate.json` — captured Phase 5 gate (when applicable)
Tests in `packages/admission-e2e/` consume both: assertion file drives schema, JSON files drive byte-equality where appropriate.
**Status:** Decided.

### Q-07 — Reliably triggering negative outcomes
**Decision:** **Mix per row — pick the most natural trigger for each.**
- `accepted` + `pr-ready` → real successful runs against the toy (cosmetic seeds from Q-04).
- `ambiguous` → synthetic intent ("do something nice") that trips the 0.2 ambiguity gate.
- `bad-plan` → synthetic intent that targets a non-existent file/component, triggering planning refusal.
- `failed-execution` → capability-envelope tweak (write budget set below the patch size) on a real seed.
- `repaired-execution` → capability-envelope tweak that's recoverable in one repair iteration.
- `blocked-review` → synthetic intent that produces a known-bad diff (e.g., deletes a file the seed asked to modify), forcing review block.
**Rationale:** Real pipeline + real artifacts beats mocked pile responses (b) — the whole point of the matrix is "this is what the real factory produces in each outcome." Pure synthetic intents (a) can't drive every row; pure envelope tweaks (c) don't have a knob for ambiguity. The mix lets each row use its most natural trigger.
**Note for planner:** Each fixture row's `expectations.ts` documents the trigger inline (`triggeredBy: 'synthetic-intent' | 'envelope-tweak' | 'real-seed'`) so future maintainers know how to regenerate. The `pnpm dogfood:matrix` script (Q-08) sets up the right intent + envelope per row.
**Status:** Decided.

### Q-08 — Matrix execution cadence
**Decision:** **Static for CI; a manual `pnpm dogfood:matrix` script regenerates.** Default tests read committed `manifest.json` + `review-gate.json` + assertion files (fast, no LM Studio dependency). Operator runs `pnpm dogfood:matrix` periodically; the regenerated diff is reviewed before commit.
**Rationale:** CI cannot run LM Studio (v0.1 testing posture); per-CI regeneration (b) is impossible. Static-only (a) silently rots; the manual regen script + diff-review surfaces drift on operator cadence. Aligns with Phase 8's evolution snapshot pattern.
**Note for planner:** `pnpm dogfood:matrix` regenerates ALL 7 rows sequentially. Each row writes to a temp dir first; only on full success does it overwrite the committed fixture. Script lives at `scripts/regen-matrix.sh` (or `apps/factory-cli/src/scripts/regen-matrix.ts` per Q-09's location pattern). Add a CI check that flags fixtures older than 60 days.
**Status:** Decided.

## 3. Dogfood Loop (DOG-04)

### Q-09 — Loop driver
**Decision:** **Shell script under `scripts/dogfood.sh`.** Plain bash loop calling `protostar-factory run` N times, picking seeds round-robin from `packages/fixtures/src/seeds/`. No new CLI surface to lock.
**Rationale:** A `dogfood` subcommand (b) commits us to a public CLI shape we don't yet need. A Node script (c) is overkill for a loop-and-call pattern. The shell script is the smallest thing that works; cancellation = SIGINT; resumability comes from the next-seed-index file (Q-11).
**Note for planner:** `scripts/dogfood.sh` accepts `--runs N` (default 10) and `--resume` (reads `.protostar/dogfood/<sessionId>/cursor` for next seed index). Logs nothing to stdout (dark autonomy); writes to `.protostar/dogfood/<sessionId>/{cursor, log.jsonl}`. End-of-loop summary printed via the Q-12 mechanism. Script delegates ALL real work to `protostar-factory run` — no business logic in bash.
**Status:** Decided.

### Q-10 — Pass criterion for `pr-ready`
**Decision:** **PR opened AND CI green on the toy repo.** A run counts toward the ≥80% only if the toy repo's GitHub Actions CI returns green for the factory's PR. The toy repo MUST have CI configured (`pnpm build` + `pnpm test` + `tauri build` in a workflow) as part of DOG-01.
**Rationale:** Highest operator-meaningful bar. Review-verdict-only (a) lets a passing review still ship a broken build; PR-opened-only (b) doesn't catch bad code that compiled-cleanly-but-broke-tests. CI-green is the actual "this is shippable" signal. Configurable (d) is unneeded knobs for v0.1; pick the right bar once.
**Note for planner:** DOG-01 acceptance criteria include: toy repo `.github/workflows/ci.yml` with `pnpm install --frozen-lockfile && pnpm test && pnpm tauri build` (or equivalent for Tauri's actual build). Dogfood driver waits up to N minutes (suggest 10) for CI status via `gh pr checks --watch` after PR open; counts a run as pass iff the PR exists AND all required checks succeeded. Timeout = fail.
**Status:** Decided.

### Q-11 — Loop concurrency
**Decision:** **Sequential but resumable.** One run at a time (no GPU contention with LM Studio); a JSONL progress cursor lets a killed dogfood session resume from the next seed.
**Rationale:** Strict sequential (a) is simpler but loses hours of work on a SIGINT. Parallelism (c) hammers LM Studio (likely the bottleneck) and complicates pass-rate accounting. Resumability is cheap to add and saves real time during dogfood iteration.
**Note for planner:** Cursor file: `.protostar/dogfood/<sessionId>/cursor` = JSON `{ sessionId, totalRuns, completed: number, runs: [{ runId, seedId, outcome, startedAt, finishedAt }] }`. Updated atomically after each run. `--resume <sessionId>` rebuilds from cursor; without `--resume`, a new sessionId is minted. Sessions are pruned by Phase 9's `prune` command (treat `.protostar/dogfood/` as in scope for prune just like `.protostar/runs/`).
**Status:** Decided.

### Q-12 — Dogfood result surfacing
**Decision:** **Both — `report.json` written at the end + a one-shot console summary on stderr.** Driver writes `.protostar/dogfood/<sessionId>/report.json` with per-run rows + aggregate %; AND emits a single human-readable summary line to stderr after the loop ends. Fully dark during the loop itself (no progress logs).
**Rationale:** report.json is the machine-consumable artifact (CI consumers, future trend tracking). The stderr summary is the operator's "did the dogfood succeed" answer without needing to `cat` a file. Single one-shot doesn't violate dark-autonomy (no per-run progress chatter).
**Note for planner:** report.json schema (mirrors fixtures shape):
```ts
{ sessionId, startedAt, finishedAt, totalRuns, passCount, passRate,
  rows: [{ runId, seedId, outcome, prUrl?, ciVerdict?, durationMs }] }
```
Lock via admission-e2e snapshot test once stabilized. Summary line format: `dogfood session <id>: <pass>/<total> pr-ready (<pct>%)`. Single write on stderr after final write of report.json.
**Status:** Decided.

## 4. Documentation (DOG-05)

### Q-13 — Documentation surface and depth
**Decision:** **Root README + per-package READMEs.** Root README is the operator-first quickstart + lifecycle (Q-16's mermaid lives here). Each `packages/*/README.md` documents that package's public surface for contributors. Aligns with Q-19's knip enforcement and Q-17's public-package posture.
**Rationale:** Monolithic root (a) gets unwieldy fast. Separate `docs/` (c) duplicates what per-package READMEs naturally express. Per-package READMEs map 1:1 to npm package pages once Q-17 ships them publicly.
**Note for planner:** Per-package README template (committed as `.planning/templates/package-readme.md`): purpose, public exports, runtime deps, authority constraints, change log link. Plan should add a knip-style or eslint check that every package under `packages/*` has a README.
**Status:** Decided.

### Q-14 — Run-bundle schema documentation source of truth
**Decision:** **Hand-written prose + a generated appendix listing every Zod schema.** `docs/run-bundle.md` opens with the "why each artifact exists" prose; appendix is auto-generated from `packages/artifacts` Zod schemas via `zod-to-json-schema`.
**Rationale:** Pure prose (a) drifts. Pure generated (b) has no narrative — operators don't know which artifact to look at first. Hybrid keeps both halves honest.
**Note for planner:** Add `zod-to-json-schema` as a dev-dep on `packages/artifacts`. Build script: `pnpm --filter @protostar/artifacts gen:schema-appendix` writes `docs/run-bundle.appendix.md`. README links to both. Lock-revision note in PROJECT.md flags the new dev-dep.
**Status:** Decided.

### Q-15 — CLI command reference
**Decision:** **`--help` snapshots committed under `docs/cli/<cmd>.txt`.** Phase 9's admission-e2e snapshot tests already capture every command's `--help`; commit those captured strings under `docs/cli/` so GitHub renders them as files. README links to the directory. Zero duplicate authoring.
**Rationale:** Hand-written reference (c) is the worst — guarantees drift. README-points-at-`--help` (a) requires operators to install the binary just to read flags. Committing the snapshot text gives readable browse-on-GitHub without authoring duplication.
**Note for planner:** Phase 9's snapshot test path determines the canonical text; Phase 10 adds a step to that test (or a sibling test) that writes `docs/cli/<cmd>.txt` if `UPDATE_FIXTURES=1` is set. CI fails if `docs/cli/*.txt` is out of sync with the captured snapshots. Mirror pattern from Phase 8's evolution snapshot test.
**Status:** Decided.

### Q-16 — Run lifecycle visual
**Decision:** **Mermaid stage diagram + per-stage prose section.** Mermaid sequence diagram in README shows admission → planning → execution → review → repair? → evaluation → evolution → delivery. Each stage gets a prose subsection with file-path landmarks (e.g., "Planning: `packages/intent/src/ambiguity-scoring.ts` runs the 0.2 gate; refusals append to `.protostar/refusals.jsonl`").
**Rationale:** Diagram + prose maps 1:1 to how operators actually learn ("show me the shape, then tell me where each piece lives"). Prose-only (a) makes the pipeline shape invisible; diagram-only (b) gives shape but no depth.
**Note for planner:** Mermaid block in README. Per-stage prose lives in README under `## Run Lifecycle`. Acceptance: every prose subsection includes at least one full file path so a reader can `git grep` from the doc directly into the codebase.
**Status:** Decided.

## 5. Release, Hygiene, Security (DOG-06, DOG-07, DOG-08)

### Q-17 — Package publish posture
**Decision:** **All `@protostar/*` packages public on npm.** Full open monorepo. Every domain package (intent, planning, execution, review, evaluation, evolution, repo, delivery-runtime, dogpile-adapter, artifacts, fixtures, admission-e2e, etc.) is `npm i`-able under `@protostar/*`.
**Rationale:** Locks the public-API commitment that DOG-06's hygiene gates exist to enforce. Anything less than fully-public makes the hygiene work feel ceremonial. Phase 9's CLI surface lock + Phase 10's knip + per-package READMEs together create a credible public package set; partial publish (b) leaves most of that work invisible to consumers.
**Note for planner:** Every `packages/*/package.json` gets `"publishConfig": { "access": "public" }` and `"private": false` (or removes the `private` field). Reserve the `@protostar` npm scope BEFORE landing any plan that touches package.json — confirm scope availability is plan-zero. `apps/factory-cli` publishes as `@protostar/factory-cli` with a `bin` entry. Internal-only packages that should NOT publish keep `"private": true` and are documented in PROJECT.md.
**Status:** Decided.

### Q-18 — Versioning + release tooling
**Decision:** **Changesets (`@changesets/cli`).** Industry-standard monorepo release tool; per-package versions; changeset files in PRs become CHANGELOG entries; pairs naturally with Q-17's public publish posture.
**Rationale:** Lockstep hand-rolled (a) doesn't survive once consumers depend on individual packages and need targeted patches. release-please (c) requires Conventional-Commits discipline this project hasn't adopted. Changesets is the right shape for a public per-package monorepo.
**Note for planner:** Add `@changesets/cli` as a root dev-dep. Initialize with `pnpm changeset init`. Configure `.changeset/config.json`: access "public", baseBranch "main", updateInternalDependencies "patch". Add `pnpm release` script: `pnpm changeset version && pnpm -r build && pnpm -r test && pnpm changeset publish`. Add a CI check that PRs touching `packages/*/src/**` include a changeset (skip with `[skip changeset]` label for internal-only changes).
**Status:** Decided.

### Q-19 — Public surface enforcement (DOG-06)
**Decision:** **knip (unused exports + unused deps).** Single tool; runs in CI; reports unused exports/files/deps across the whole monorepo. Pairs with Q-17/Q-18 — once packages are public, knip is what keeps their surfaces honest.
**Rationale:** ts-prune (b) loses unused-deps detection (which the runtime-deps lock posture already cares about). Hand-authored exports contract (c) is heavy and DOG-06 doesn't require positive enumeration — only "no unused." Manual review (d) drifts within one release.
**Note for planner:** Add `knip` as root dev-dep. `knip.json` config excludes generated files (`docs/run-bundle.appendix.md`, `docs/cli/*.txt`, fixtures). Add `pnpm knip` to the existing `pnpm verify` script. CI fails on unused exports/deps; package authors clean up or add justified ignores. Lock revision note in PROJECT.md.
**Status:** Decided.

### Q-20 — Security review deliverable (DOG-08)
**Decision:** **Both — public `SECURITY.md` (operator-facing threat model) + internal `.planning/SECURITY-REVIEW.md` (audit log).**
- `SECURITY.md` at repo root: trust assumptions, capability envelope summary, secret-handling posture, vulnerability reporting address.
- `.planning/SECURITY-REVIEW.md`: per-surface checklist (subprocess args, fs writes, network egress, env-var reads, PAT scope, branch-name regex, prune safety, refusal log integrity), what was reviewed, what was found, signoff date.
**Rationale:** Public SECURITY.md is the GitHub-recognized signal downstream consumers anchor to (matters more once Q-17 ships public packages). Internal review log is the artifact future contributors audit AGAINST. Either alone leaves a gap.
**Note for planner:** SECURITY.md goes at repo root (GitHub auto-discovers). SECURITY-REVIEW.md follows the per-phase planning convention. Last plan in Phase 10 is a discrete "security signoff" plan that produces both artifacts.
**Status:** Decided.

### Q-21 — Security audit enforcement
**Decision:** **(b) admission-e2e contract tests for the authority boundary; AGENTS.md updates for the rest.** A new admission-e2e test scans every package's source for forbidden imports based on a per-package allowlist:
- `packages/dogpile-adapter` — no `node:fs`, no `node:child_process`, no `node:net`, no `@octokit/*`.
- `packages/intent`, `packages/planning`, `packages/review`, `packages/evaluation`, `packages/evolution`, `packages/policy`, `packages/artifacts` — same fs/process/net bans.
- `packages/repo` — fs allowed, child_process via allowlist (git binaries only); no network.
- `packages/delivery-runtime` — `@octokit/*` allowed, no fs.
- `apps/factory-cli` — fs + process + everything (top of authority chain).
The narrative pieces of DOG-08 (envelope sizes, secret handling, prune behavior) live in SECURITY-REVIEW.md (Q-20).
**Rationale:** Authority boundary is load-bearing — needs programmatic enforcement, not prose. Hand-grep (a) drifts immediately. semgrep/CodeQL (c) is heavy lift to express our specific allowlist. Pure programmatic for everything is overkill — secret handling and PAT scope are review judgments, not static-analysis findings.
**Note for planner:** New file `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts`. Static AST scan of `packages/*/src/**/*.ts` against an allowlist defined inline. Exception escape hatch: top-of-file `// authority-exception: <reason>` comment, recorded in SECURITY-REVIEW.md. Test fails on any import that isn't in the per-package allowlist.
**Status:** Decided.

### Q-22 — Phase 10 sub-ordering
**Decision:** **DOG-01 + DOG-03 first (one real run end-to-end), then matrix + docs in parallel, then DOG-04 final as the exit gate.**
1. **Smoke-gate wave:** DOG-01 (toy repo + CI) → DOG-03 (one real cosmetic-tweak run reaches PR with green CI). This validates the deferred Phase 7 PR path against a real repo.
2. **Parallel hardening wave:** DOG-02 (matrix), DOG-05 (docs), DOG-06 (knip + per-package READMEs), DOG-07 (changesets + release script), DOG-08 (SECURITY.md + SECURITY-REVIEW.md + authority-boundary contract).
3. **Exit gate:** DOG-04 (≥10 consecutive runs ≥80% pr-ready by Q-10's PR+CI-green criterion). Run last so the loop exercises the hardened, documented, packaged factory.
**Rationale:** Smallest end-to-end smoke first proves the loop works before any hardening assumes it does. Parallel middle wave maximizes wall-clock; Q-22's option (b) parallelism risk is contained because the smoke gate already proved the pipeline. Final 10× run is the literal exit criterion the ROADMAP names.
**Note for planner:** Plan numbering should reflect the waves: 10-01 = DOG-01 toy repo + CI; 10-02 = DOG-03 single-seed end-to-end + Phase 7 catch-up; 10-03..10-07 in parallel = DOG-02/05/06/07/08; 10-08 = DOG-04 final 10× exit gate. Plan 10-08 cannot start until plans 10-01..10-07 are committed.
**Status:** Decided.

</decisions>

<specifics>
## Specific Ideas

- **DOG-03 verbatim seed:** "Change the primary button color and add a hover state" — locked from 2026-04-24; do not paraphrase in the seed file.
- **Toy repo path:** `../protostar-toy-ttt` (sibling, NOT under protostar's working tree). Plans MUST NOT add it as a git submodule; it's a separate clone.
- **Toy repo PAT:** A dedicated fine-grained `protostar-dogfood` PAT scoped to that one repo (don't reuse the developer's general GitHub PAT).
- **Public-PR disclosure:** The toy repo README MUST disclose "PRs in this repo are opened by the Protostar factory" — establishes the dogfood frame for any third party who stumbles in.
- **Pass criterion is PR + CI green** (Q-10), not review-verdict. This is a tighter bar than the ROADMAP's `pr-ready` wording suggests; document it in DOG-04's plan.
- **Dogfood is dark:** No per-run logs from `scripts/dogfood.sh`. Single end-of-session stderr summary line (Q-12) is the only operator-facing output during the loop.
- **Authority allowlist exception escape hatch:** `// authority-exception: <reason>` comment; every exception MUST be enumerated in SECURITY-REVIEW.md.
- **Plan ordering is load-bearing:** Plan 10-02 (single end-to-end run) is the de-facto Phase 7 verifier; if it fails, the parallel wave doesn't start.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before acting on Phase 10.**

### Phase 10 scope
- `.planning/REQUIREMENTS.md` §124-131 — DOG-01..DOG-08 wording (the requirement text is load-bearing; do not paraphrase)
- `.planning/ROADMAP.md` §317-329 — Phase 10 success criteria + the "v0.1 cosmetic-tweak loop ships here" note
- `.planning/PROJECT.md` — Constraints (runtime-deps, authority, PR safety regex, ambiguity gate, archetype scope), Out-of-Scope list, Tech stack lock
- `.planning/STATE.md` — current verification state of Phases 6/7/8 (Phase 10 cannot assume any not-verified phase is fully sound)

### Cross-phase locks Phase 10 inherits
- `.planning/phases/09-operator-surface-resumability/09-CONTEXT.md` — CLI surface lock (commander dispatcher, ExitCode enum, stdout=data, --json flag, prune scope including dogfood paths)
- `.planning/phases/07-delivery/` (every artifact) — Octokit + push surface; Phase 10 dogfood-driver is the first real consumer of this path against a real repo
- `.planning/phases/05-review-repair-loop/` (every artifact) — Phase 5 review verdicts feed Q-10's pass criterion (review must pass before PR opens)
- `.planning/phases/04-execution-engine/` (every artifact) — capability envelope tweaks (Q-07) require knowing the envelope shape

### Run-bundle schema and authority
- `packages/artifacts/src/` — Zod schemas for every artifact in `.protostar/runs/<id>/` (DOG-05 Q-14 generates appendix from these)
- `packages/policy/src/admission-paths.ts` — archetype routing; cosmetic-tweak is the only wired path
- `packages/delivery-runtime/src/` — Octokit + push surface; Phase 10 dogfood is its first real consumer
- `AGENTS.md` — domain-first packaging rule (no utils/agents/factory catch-all); knip + per-package READMEs (Q-19/Q-13) enforce this

### Tooling for new dev-deps
- Changesets docs (`@changesets/cli`) — pnpm monorepo setup; `pnpm changeset version && publish` flow (Q-18)
- knip docs — pnpm monorepo configuration; per-package allowlist patterns (Q-19)
- zod-to-json-schema — Zod → JSON Schema → Markdown appendix pipeline (Q-14)

### Security
- `SECURITY.md` (to be created at repo root by Q-20)
- `.planning/SECURITY-REVIEW.md` (to be created by Q-20)
- `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts` (to be created by Q-21)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`packages/admission-e2e/`** — already the home of contract tests (Phase 8 added 5+ contracts there). Q-21's authority-boundary contract and Q-15's CLI snapshot diff check fit naturally.
- **`packages/artifacts/`** — Zod schemas for every artifact. Q-14's generated appendix reads directly from these; no schema duplication.
- **Phase 9 commander dispatcher** (`apps/factory-cli/src/commands/`) — Q-15's `--help` snapshots are produced by Phase 9's existing snapshot tests; Phase 10 only adds a write-to-`docs/cli/` step.
- **Phase 9 prune subcommand** — already has the active-status guard + lineage-preservation logic. Phase 10 needs to extend its scope to include `.protostar/dogfood/` (Q-11 cursor files).
- **Phase 7 `packages/delivery-runtime/`** — Octokit + push surface. Phase 10 plan 10-02 (DOG-03) is the first real consumer; if it fails, that's a Phase 7 catch-up, not a Phase 10 bug.

### Established Patterns
- **Domain-first packaging** (AGENTS.md) — `packages/fixtures/` (Q-05) follows the same shape as Phase 8's evolution snapshot package.
- **Authority boundary** — only `apps/factory-cli` and `packages/repo` do fs I/O. Q-09's shell driver is fine; if the dogfood loop ever moves into TS (it shouldn't for v0.1), it lives under `apps/factory-cli/src/`.
- **Append-only workspace files** — `.protostar/refusals.jsonl`, `.protostar/evolution/{lineageId}.jsonl`. Q-11's `.protostar/dogfood/<sessionId>/cursor` is per-session (not append-only) and prune-eligible by Phase 9's prune.
- **Phase 8 lock-revision pattern** — every new runtime/dev-dep gets an explicit entry in PROJECT.md Constraints. Phase 10 adds entries for `@changesets/cli`, `knip`, `zod-to-json-schema`.

### Integration Points
- **Toy repo `../protostar-toy-ttt`** — DOES NOT EXIST yet on disk. Plan 10-01 creates it; subsequent plans assume its presence and CI configuration.
- **GitHub `@protostar` npm scope** — must be reserved BEFORE plan 10-04 (DOG-07 release) lands. Make this a plan-zero step.
- **GitHub Actions on toy repo** — DOG-01 includes `.github/workflows/ci.yml` on the toy. Q-10's pass criterion depends on it. Required checks must include the build + test workflow names.
- **Phase 9 prune scope extension** — `.protostar/dogfood/` paths must be in prune's scan list. If Phase 9 already shipped without this, Phase 10's plan 10-02 (or earliest plan touching the dogfood directory) extends it.

</code_context>

<deferred>
## Deferred Ideas

- **Cross-archetype matrix** — `feature-add`, `refactor`, `bugfix` archetype rows. v0.1 explicitly limits to `cosmetic-tweak`; non-cosmetic archetypes are stubs (PROJECT.md). Add to v1.0 backlog.
- **Per-CI dogfood execution** — currently CI cannot run LM Studio. When a hosted-LLM mode lands (currently out-of-scope), revisit Q-08 (b).
- **Token-budget unit** — DOG-08 security review touches "envelope budgets," but the canonical token-budget unit is explicitly v1.0 (not v0.1). Phase 10's envelope discussion uses whatever ad-hoc units already exist.
- **`protostar-factory dogfood` subcommand** — Q-09 chose shell. If dogfood becomes a routine operator workflow post-v0.1, promote to a real subcommand (which adds a new public CLI surface).
- **TUI / live dashboard** — Phase 9 deferred TUI; Phase 10 inherits that. report.json + status command are the operator surface.
- **Cumulative-evolution dogfood** — Q-03 chose branch-per-run-no-merge for clean signal. A future "real-world drift" dogfood mode that squash-merges accepted PRs is interesting; v1.0+ work.
- **Auto-PR cleanup** — Q-03 leaves PRs open; an automated `gh pr close --delete-branch` sweep is documented in DOG-05 but not automated. Could be a recurring scheduled agent post-ship.
- **External security tooling (semgrep / CodeQL)** — Q-21 chose admission-e2e contracts. semgrep rules become attractive once the codebase has more attack surface.

</deferred>

---

*Phase: 10-v1-hardening-dogfood*
*Context gathered: 2026-04-28 (--power mode, 22/22 answered)*
