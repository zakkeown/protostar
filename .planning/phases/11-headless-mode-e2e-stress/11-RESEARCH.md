# Phase 11: Headless Mode + E2E Stress - Research

**Researched:** 2026-04-29  
**Domain:** headless factory orchestration, LLM backend selection, stress execution, E2E delivery verification  
**Confidence:** HIGH for repository surfaces and Phase 11 hosted-provider choice; MEDIUM for CI-runner operational details.

<user_constraints>
## User Constraints (from 11-CONTEXT.md)

### Locked Decisions

- Phase 11 must prove the factory can run fully headless and stress the full E2E pipeline until it can build and deliver a Tauri-based tic-tac-toe game in `../protostar-toy-ttt`. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- The exit gate is both TTT delivered and stress-clean. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- TTT success requires a PR opened, CI green, and Playwright E2E asserting a full playable game. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Phase 11 must lift beyond `cosmetic-tweak` toward `feature-add`, `bugfix`, and `refactor`; `feature-add` only is the permitted fallback if all three are too large. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Phase 11 must add headless modes `github-hosted`, `self-hosted-runner`, and `local-daemon`, exposed through config and `--headless-mode`. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Phase 11 must add hosted LLM and deterministic mock backends while preserving existing LM Studio behavior. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Phase 11 must add a no-interactive-prompt audit and a security review entry. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Phase 11 must author the TTT feature-add seed and treat toy repo verification assumptions as immutable from the factory. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Phase 11 must add sustained-load, concurrency, and fault-injection stress shapes. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Q-17 dashboard conflict must be resolved before plan 11-08; context recommends R2, an append-only `events.jsonl` tail for v0.1, with R3 sibling dashboard deferred. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Q-19 driver split is required: bash for sustained-load, TypeScript for concurrency and fault injection, with shared stress-session code. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Phase 11 must add `stress-report.json` with a Zod schema in `packages/artifacts`, canonical formatting, and append-only stress event evidence. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]

### the agent's Discretion

- Choose whether all-three archetype lift is still small enough; research recommendation is all-three narrow lift with feature-add-only fallback documented. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Choose the exact hosted LLM adapter shape while preserving LM Studio and the authority boundary. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Choose the exact stress artifact fields so long as they support stop-the-world, pass-rate reporting, and append-only evidence. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]

### Deferred Ideas (OUT OF SCOPE)

- Full dashboard app/server in the factory process is deferred; use event tailing for v0.1. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Non-branch delivery merge/auto-merge is out of scope; Phase 11 stays branch-per-run-no-merge. [VERIFIED: `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md`]
- Native Anthropic Messages streaming can be deferred if an OpenAI-compatible hosted backend satisfies Phase 11. [ASSUMED]
</user_constraints>

## Project Constraints (from AGENTS.md)

- `apps/factory-cli` is the orchestration tier and may own filesystem plus network composition. [VERIFIED: `AGENTS.md`]
- `packages/repo` and `@protostar/paths` are the only package-level filesystem authority surfaces; `@protostar/paths` is path-resolution-only. [VERIFIED: `AGENTS.md`]
- Network packages may use network authority but must not import filesystem or path modules; each must contain a static `no-fs.contract.test.ts`. [VERIFIED: `AGENTS.md`]
- Pure packages must remain filesystem-forbidden and network-forbidden; package manifests are the machine-readable tier source through `"protostar": { "tier": ... }`. [VERIFIED: `AGENTS.md`]
- Do not make Dogpile the factory authority boundary; Dogpile stays a bounded coordination cell. [VERIFIED: `AGENTS.md`]
- Keep packages domain-first and avoid generic `utils`, `agents`, or catch-all factory packages. [VERIFIED: `AGENTS.md`]
- Stage contracts should pass durable data forward; later stages must not reach into private state from earlier stages. [VERIFIED: `AGENTS.md`]
- Run `pnpm run verify` before handing implementation work back; run `pnpm run factory` after changing stage composition or package exports. [VERIFIED: `AGENTS.md`]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRESS-01 | Establish Phase 11 requirements and traceability. | `.planning/REQUIREMENTS.md` already uses grouped requirement IDs and trace tables. [VERIFIED: local file] |
| STRESS-02 | Lift goal archetype admission beyond cosmetic. | Existing archetype policy/admission surfaces are present but stubbed for `feature-add`, `bugfix`, and `refactor`. [VERIFIED: `packages/intent/src/archetypes.ts`] |
| STRESS-03 | Add TTT feature-add seed library support. | Current seed library is cosmetic-only and must become per-archetype. [VERIFIED: `packages/fixtures/src/seeds/index.ts`] |
| STRESS-04 | Enforce immutable toy repo verification assumptions. | Required TTT verification files are absent today and must be treated as target-repo preconditions. [VERIFIED: `../protostar-toy-ttt/package.json`] |
| STRESS-05 | Add headless mode config and CLI flag. | Existing run/config code lacks `--headless-mode` and headless config keys. [VERIFIED: `apps/factory-cli/src/commands/run.ts`] |
| STRESS-06 | Add LLM backend selection while preserving LM Studio. | Existing execution adapter contract and LM Studio implementation can be reused. [VERIFIED: `packages/execution/src/adapter-contract.ts`] |
| STRESS-07 | Add deterministic mock backend. | CI stress needs no-network deterministic execution behind the same adapter contract. [VERIFIED: local architecture] |
| STRESS-08 | Add hosted LLM backend. | OpenAI-compatible chat is the smallest hosted extension from current LM Studio protocol. [VERIFIED: `packages/lmstudio-adapter/src/lmstudio-client.ts`] |
| STRESS-09 | Add bounded dependency installation support. | `pnpm add` is currently not in the repo subprocess schema. [VERIFIED: `packages/repo/src/subprocess-schemas/pnpm.ts`] |
| STRESS-10 | Add stress report and append-only event artifact schemas. | `packages/artifacts` already owns canonical JSON helpers. [VERIFIED: `packages/artifacts/src/canonical-json.ts`] |
| STRESS-11 | Add shared stress session core. | Factory CLI owns filesystem orchestration and atomic snapshot writing. [VERIFIED: `apps/factory-cli/src/snapshot-writer.ts`] |
| STRESS-12 | Add sustained-load bash driver. | Existing dogfood shell script provides the orchestration-only pattern. [VERIFIED: `scripts/dogfood.sh`] |
| STRESS-13 | Add TypeScript concurrency/fault driver. | Concurrency/fault handling requires typed session state and cancellation logic in factory CLI. [VERIFIED: local architecture] |
| STRESS-14 | Add CI/headless/security/TTT phase gates. | Existing workflow and security docs provide the integration points. [VERIFIED: `.github/workflows/verify.yml`] |
</phase_requirements>

## Phase Summary

Phase 11 should convert the factory from a mostly interactive/local dogfood system into a headless, CI-operable delivery system with measurable stress evidence. The phase has three major implementation tracks: headless runtime selection, wider goal archetype admission, and stress execution with durable append-only artifacts. The current repo already has strong seams for this: `apps/factory-cli` owns orchestration, `packages/intent` owns archetype admission, `packages/repo` owns subprocess authority, `packages/artifacts` owns durable schema contracts, and the Phase 10 dogfood driver already demonstrates cursor/report/log patterns. [VERIFIED: `apps/factory-cli/src/main.ts`, `packages/intent/src/archetypes.ts`, `packages/repo/src/subprocess-runner.ts`, `packages/artifacts/src/index.ts`, `scripts/dogfood.sh`]

The safest plan is not to rename the existing `@protostar/lmstudio-adapter`. Add sibling backend adapters and select among them in the factory CLI/config composition root. The current LM Studio client already speaks OpenAI-compatible chat completions, so an OpenAI-compatible hosted backend is the smallest hosted step; native provider-specific streams can be added later behind the same `ExecutionAdapter` contract. [VERIFIED: `packages/lmstudio-adapter/src/lmstudio-client.ts`, `packages/execution/src/adapter-contract.ts`] [CITED: `https://platform.openai.com/docs/api-reference/chat`]

**Primary recommendation:** implement Phase 11 as 15 small plans: first unlock archetypes and immutable TTT seed contracts, then add headless/backend selection, then split hosted and mock adapter wiring, then artifact schemas and stress runners, then TTT validation and security gates. Choose R2 `events.jsonl` tailing for Q-17, all-three narrow archetype lift for Q-07 with feature-add-only fallback, and the Q-19 split driver exactly as locked.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Goal archetype lift | Pure domain packages | Admission E2E tests | `packages/intent` and `packages/policy` already own archetype policy/admission; no filesystem or network needed. [VERIFIED: `packages/intent/src/archetypes.ts`] |
| TTT feature seed library | Pure fixtures package | Planning/admission tests | Seeds are static typed fixture data exported from `packages/fixtures`; keep them immutable and testable. [VERIFIED: `packages/fixtures/src/seeds/index.ts`] |
| Headless mode selection | Factory CLI orchestration | Config schema package | CLI/config selects runtime posture; mode should influence prompts, delivery behavior, and CI assumptions but not move authority into pure packages. [VERIFIED: `apps/factory-cli/src/commands/run.ts`, `packages/lmstudio-adapter/src/factory-config.ts`] |
| Hosted LLM backend | Network package | Factory CLI composition | Hosted API calls belong in a network tier adapter that implements `ExecutionAdapter`; factory CLI chooses it. [VERIFIED: `packages/execution/src/adapter-contract.ts`] |
| Deterministic mock backend | Pure package or factory CLI test support | Admission E2E tests | Deterministic model output should avoid network and filesystem to make CI stress stable. [VERIFIED: `packages/execution/src/adapter-contract.ts`] |
| Subprocess and `pnpm add` authority | Filesystem tier package | Factory CLI orchestration | `packages/repo` already owns subprocess allowlisting and process execution. [VERIFIED: `packages/repo/src/subprocess-allowlist.ts`, `packages/repo/src/subprocess-schemas/pnpm.ts`] |
| Stress sessions and event evidence | Factory CLI orchestration | Artifacts pure schema | Writing `.protostar/stress` is filesystem authority, so factory CLI writes while `packages/artifacts` defines pure schemas. [VERIFIED: `apps/factory-cli/src/snapshot-writer.ts`, `packages/artifacts/src/canonical-json.ts`] |
| Stress shape domain types | Pure stress-harness package or artifacts | Factory CLI execution | Scenario definitions and report types are pure; process launching, cancellation, and fault injection stay in factory CLI. [VERIFIED: `packages/admission-e2e/src/tier-conformance.contract.test.ts`] |
| PR/CI verification | Factory CLI orchestration | GitHub CLI/environment | Existing dogfood step shells out to `gh pr checks`; stress can reuse the pattern without adding merge authority. [VERIFIED: `apps/factory-cli/src/commands/__dogfood-step.ts`] |
| Toy repo verification | Target repo CI/tests | Factory CLI preflight | `../protostar-toy-ttt` owns Playwright and property tests; the factory must verify presence and avoid modifying immutable verification files. [VERIFIED: `../protostar-toy-ttt/package.json`, `../protostar-toy-ttt/.github/workflows/ci.yml`] |

## Existing Code Surfaces to Reuse

| Surface | Current Behavior | Reuse in Phase 11 |
|---------|------------------|-------------------|
| `packages/intent/src/archetypes.ts` | Defines `SUPPORTED_GOAL_ARCHETYPES`, policy rows, and registry. `cosmetic-tweak` is wired; `feature-add`, `bugfix`, and `refactor` are present but `stub`. Cosmetic cap is currently `repair_loop_count: 1`. [VERIFIED: local file] | Change selected archetype rows from stub to wired, update rationale/caps, and keep repair-loop caps explicit. Do not invent a new archetype registry. |
| `packages/intent/src/admission-paths.ts` | Feature/refactor/bugfix admission paths currently emit `unsupported-goal-archetype` findings and blocked decisions. [VERIFIED: local file] | Replace unsupported findings for selected archetypes with narrow positive admission path findings. Keep unsupported code only for archetypes still intentionally stubbed. |
| `packages/intent/src/capability-admission.ts` | `admitCosmeticTweakCapabilityEnvelope` can grant; feature/refactor/bugfix admission functions always block. [VERIFIED: local file] | Reuse the cosmetic grant pattern and add archetype-specific validation/caps. Avoid duplicating capability envelope parsing. |
| `packages/intent/src/capability-envelope.ts` | `FactoryBudget` supports `maxRepairLoops`, default 3, schema max 10. [VERIFIED: local file] | Feature-add can support `maxRepairLoops: 9`; update policy cap and seed budget. Watch the mismatch with current cosmetic cap 1. |
| `packages/fixtures/src/seeds/index.ts` | Seed library is a frozen array of three cosmetic seeds; `SeedArchetype` only permits `cosmetic-tweak`. [VERIFIED: local file] | Convert to record keyed by archetype subfolders, e.g. `seedLibrary["feature-add"]`, and add `feature-add/ttt-game.json`. Preserve existing cosmetic ids. |
| `packages/fixtures/src/seeds/seed-library.test.ts` | Tests exactly three Phase 10 cosmetic seeds. [VERIFIED: local file] | Update tests to assert per-archetype grouping and the immutable TTT seed, while keeping Phase 10 cosmetic fixtures stable. |
| `packages/repo/src/subprocess-allowlist.ts` | Baseline command allowlist is `git`, `pnpm`, `node`, `tsc`; policy can extend but not remove. [VERIFIED: local file] | Keep command authority here; add package-level validation for bounded `pnpm add`, not in factory CLI string parsing. |
| `packages/repo/src/subprocess-schemas/pnpm.ts` | Allows `pnpm install`, `run`, `build`, `test`, `--filter`, and `exec`; does not allow `add`. [VERIFIED: local file] | Add a narrow `add` branch with exact dependency allowlist and safe flags. This is the correct choke point for Q-16. |
| `packages/repo/src/subprocess-runner.ts` | Runs commands with `shell:false`, validates allowlist/schemas, captures stdout/stderr, and kills timed-out child processes. [VERIFIED: local file] | Reuse for factory task execution and stress fault cases. Fault injection should wrap this rather than bypass process policy. |
| `packages/execution/src/adapter-contract.ts` | Defines `ExecutionAdapter`, `AdapterContext`, `AdapterPolicy`, and network/repo context. [VERIFIED: local file] | Hosted and mock backends should implement this contract. No new generic backend framework is needed. |
| `packages/lmstudio-adapter/src/lmstudio-client.ts` | Implements OpenAI-compatible `/chat/completions` stream and JSON calls, plus `/models` preflight. [VERIFIED: local file] | Preserve as-is. Copy only protocol-appropriate logic into a hosted adapter, or extract a domain-specific OpenAI-compatible client if needed. Avoid package rename. |
| `packages/lmstudio-adapter/src/coder-adapter.ts` | Creates an `ExecutionAdapter` that reads target preimages via injected repo reader and returns a `RepoChangeSet`. [VERIFIED: local file] | Use as the behavioral baseline for hosted and mock coder adapters. |
| `packages/lmstudio-adapter/src/create-judge-adapter.ts` | Creates a judge adapter; prompt text is still cosmetic-oriented. [VERIFIED: local file] | Update judge prompting for feature-add/bugfix/refactor or make archetype-aware, otherwise non-cosmetic goals will be judged through stale language. |
| `packages/lmstudio-adapter/src/factory-config.ts` and `.schema.json` | Config currently hard-codes `provider: "lmstudio"` for coder/judge adapters and exposes LM Studio env overrides. [VERIFIED: local file] | Add `llmBackend` and `headlessMode` without breaking default LM Studio config. Keep schema and runtime TypeScript in lockstep. |
| `apps/factory-cli/src/commands/run.ts` | Commander run command has execution, planning, review, delivery, and judge flags; no `--headless-mode` or `--llm-backend`. [VERIFIED: local file] | Add both flags here and propagate into `RunCommandOptions`. |
| `apps/factory-cli/src/main.ts` | Composition root imports and instantiates LM Studio coder adapter directly. [VERIFIED: local file] | Select adapter implementation here. This is the authority-correct place for backend composition. |
| `apps/factory-cli/src/load-factory-config.ts` | Reads `.protostar/factory-config.json`, resolves defaults/env, and returns liveness/delivery helpers. [VERIFIED: local file] | Add mode/backend config loading and validation helpers. |
| `apps/factory-cli/src/snapshot-writer.ts` | `writeSnapshotAtomic` writes temp file, datasyncs file, renames, and datasyncs directory with per-path write chaining. [VERIFIED: local file] | Use this durability pattern for `stress-report.json`; do not copy the lighter dogfood text writer for final stress artifacts. |
| `apps/factory-cli/src/commands/__dogfood-step.ts` | Hidden dogfood command manages cursor, confirmed intent, draft selection, log/report files, PR checks, and `gh pr checks`. [VERIFIED: local file] | Reuse shape, not exact implementation. Stress needs shared session code and richer artifact schema. Existing hard-coded toy repo owner is a landmine to remove or config-gate. |
| `scripts/dogfood.sh` | Bash sequential driver with no business logic comment; loops seeds and invokes hidden CLI step. [VERIFIED: local file] | `scripts/stress.sh` should mirror the orchestration-only style for sustained-load and delegate business rules to factory CLI. |
| `apps/factory-cli/src/commands/status.ts` | Supports JSON/full run status and liveness classification. [VERIFIED: local file] | Stress can reuse run discovery/liveness. Watch that full status appears to read `delivery/result.json`, while delivery writes `delivery/delivery-result.json`. |
| `apps/factory-cli/src/run-liveness.ts` | Classifies terminal/running/orphaned runs based on manifest status, age, and cancel sentinel. [VERIFIED: local file] | Stop-the-world wedge detection should compose this with p95 successful duration. |
| `apps/factory-cli/src/commands/prune.ts` | Prunes `.protostar/runs` and `.protostar/dogfood`, dry-run by default, active-status protected. [VERIFIED: local file] | Extend prune scope to `.protostar/stress` with active-session protection and fixture updates. |
| `packages/artifacts/src/canonical-json.ts` | Sorts object keys for byte-stable JSON. [VERIFIED: local file] | Stress report schema/formatter should use this for canonical `stress-report.json`. |
| `packages/artifacts/package.json` | `zod` and `zod-to-json-schema` are devDependencies today. [VERIFIED: local file] | If runtime schema parsers are exported from `packages/artifacts`, move `zod` to dependencies or avoid runtime parse exports. Q-18 points toward runtime Zod schema. |
| `packages/admission-e2e/src/tier-conformance.contract.test.ts` | Enforces tier manifests, network no-fs tests, pure no-net tests, dep boundaries, and side effects. [VERIFIED: local file] | Every new package must satisfy this immediately; this will catch hosted adapter and stress-harness mistakes. |
| `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts` | Scans production imports for authority violations. [VERIFIED: local file] | Add no-interactive-prompt audit beside these contract tests; keep filesystem/network authority explicit. |
| `.github/workflows/verify.yml` | CI runs Node 22, pnpm 10.33.0, install frozen lockfile, then `pnpm run verify:full`. [VERIFIED: local file] | Add headless smoke/stress checks carefully; avoid 500-run stress in normal PR CI. Use nightly/scheduled or manual workflows for full stress. |
| `../protostar-toy-ttt/package.json` | React/Tauri/Vite app; `pnpm test` currently prints `no tests yet`. [VERIFIED: local file] | Phase 11 must make toy verification assumptions real before factory delivery: Playwright and property tests must exist on main. |
| `../protostar-toy-ttt/.github/workflows/ci.yml` | CI installs Tauri Linux deps, runs `pnpm test`, and builds Tauri debug no-bundle. [VERIFIED: local file] | Final TTT PR gate should watch this workflow. Add Playwright/property tests to toy repo before using it as immutable target. |

## Recommended Implementation Strategy

| Req ID | Recommended Strategy | Main Verification |
|--------|----------------------|-------------------|
| STRESS-01 | Add traceability requirements and Phase 11 docs first. Use `STRESS-01..STRESS-14` labels in `.planning/REQUIREMENTS.md`; keep existing requirement style. [VERIFIED: `.planning/REQUIREMENTS.md`] | Requirements table includes all Phase 11 IDs and trace rows. |
| STRESS-02 | Lift archetypes in `packages/intent` and `packages/policy` by changing existing stub rows/functions, not by adding parallel registries. Wire all three if tests stay small; otherwise wire `feature-add` only and leave explicit unsupported decisions for the rest. [VERIFIED: `packages/intent/src/archetypes.ts`] | `pnpm --filter @protostar/intent test`; admission E2E tests prove selected archetypes are no longer rejected as unsupported. |
| STRESS-03 | Convert fixture seed library to per-archetype grouping and add `packages/fixtures/src/seeds/feature-add/ttt-game.json`. Include rich AC and explicit budget, preferably `maxRepairLoops: 9` for feature-add. [VERIFIED: `packages/fixtures/src/seeds/index.ts`] | `pnpm --filter @protostar/fixtures test`; fixture tests assert TTT seed id, archetype, AC count, and budget. |
| STRESS-04 | Add immutable toy verification preflight: factory may check but not edit `e2e/ttt.spec.ts` and `tests/ttt-state.property.test.ts`. Since these files are currently absent, plan must include an operator/toy-repo prerequisite before final delivery. [VERIFIED: `../protostar-toy-ttt`] | Admission/planning contract rejects factory plans that modify immutable verification paths; preflight fails clearly if files absent. |
| STRESS-05 | Add `headlessMode` to config and `--headless-mode` to CLI, with values `github-hosted`, `self-hosted-runner`, `local-daemon`. Mode should disable all prompt paths and select appropriate CI/local assumptions. [VERIFIED: `apps/factory-cli/src/commands/run.ts`] | CLI parser tests, config schema tests, and a no-prompt contract in admission-e2e. |
| STRESS-06 | Add LLM backend selection while preserving LM Studio default. Recommended backends: `lmstudio`, `hosted-openai-compatible`, `mock-deterministic`. Use existing `ExecutionAdapter` contract. [VERIFIED: `packages/execution/src/adapter-contract.ts`] [CITED: `https://platform.openai.com/docs/api-reference/chat`] | Unit tests for config resolution and adapter factory; LM Studio tests remain green. |
| STRESS-07 | Implement deterministic mock backend with canned, seed-addressed responses and no network/filesystem authority. Prefer a pure package if it only returns changes from inputs. [VERIFIED: `packages/admission-e2e/src/tier-conformance.contract.test.ts`] | Mock backend tests are deterministic across repeated runs; pure no-net contract passes. |
| STRESS-08 | Implement hosted LLM adapter as a network package with no-fs contract. Start with OpenAI-compatible chat completions because current LM Studio protocol already uses `/chat/completions`; keep Anthropic native API as later provider-specific work. [VERIFIED: `packages/lmstudio-adapter/src/lmstudio-client.ts`] [CITED: `https://platform.openai.com/docs/api-reference/chat`] [CITED: `https://docs.anthropic.com/en/api/messages`] | Hosted adapter unit tests mock fetch; `no-fs.contract.test.ts` passes; no API key required for default CI. |
| STRESS-09 | Add bounded `pnpm add` in `packages/repo` only. Exact allowlist should be small and scenario-specific; prefer no dependency additions for TTT implementation when React state is enough. [VERIFIED: `packages/repo/src/subprocess-schemas/pnpm.ts`] | Subprocess schema tests accept allowlisted exact package specs and reject arbitrary packages, scripts, shell metacharacters, and global flags. |
| STRESS-10 | Add `packages/artifacts` stress report schema and formatter. Path convention: `.protostar/stress/<sessionId>/stress-report.json`; event evidence: `.protostar/stress/<sessionId>/events.jsonl`. [VERIFIED: `packages/artifacts/src/canonical-json.ts`] | Byte-stability and malformed-rejection contract tests. |
| STRESS-11 | Add shared factory CLI stress session code under `apps/factory-cli/src/stress/stress-session.ts`: create session, append event, update report atomically, compute pass rates, detect stop-the-world wedge. [VERIFIED: `apps/factory-cli/src/snapshot-writer.ts`, `apps/factory-cli/src/run-liveness.ts`] | Factory CLI unit tests with temp dirs; no event truncation on repeated appends. |
| STRESS-12 | Add `scripts/stress.sh` only for sustained sequential load. It should parse shape/run count/session id, then call built CLI commands; no business logic in bash. [VERIFIED: `scripts/dogfood.sh`] | Shell smoke with `--runs 1 --llm-backend mock`; ShellCheck if available, otherwise bash syntax check. |
| STRESS-13 | Add TypeScript stress runner at `apps/factory-cli/src/scripts/stress.ts` for concurrency and fault injection. This can use worker pools, cancellation, timeouts, and structured events without bash race bugs. [VERIFIED: `apps/factory-cli/src/commands/__dogfood-step.ts`] | Unit tests for concurrency caps, fault scenario events, stop-world conditions; small compiled smoke. |
| STRESS-14 | Add CI/headless/security integration: no-interactive-prompt contract, SECURITY-REVIEW entry, optional manual/scheduled stress workflow, and final TTT delivery validation using toy repo CI/Playwright/property tests. [VERIFIED: `.github/workflows/verify.yml`, `.planning/SECURITY-REVIEW.md`] | `pnpm run verify`, `pnpm run verify:full`, and explicit toy repo CI green check before phase completion. |

## Conflict Resolutions

### Q-17 Dashboard Choice

**Choose R2: append-only `events.jsonl` tail for v0.1.**

R2 best preserves the current dark-autonomy boundary. The factory already writes durable artifacts under `.protostar`, and operators can inspect append-only evidence without adding a web server, websocket, or dashboard package. A dashboard would add lifecycle, port, auth, and filesystem/network authority questions that are not needed to prove Phase 11. [VERIFIED: `apps/factory-cli/src/journal-writer.ts`, `apps/factory-cli/src/snapshot-writer.ts`] [ASSUMED: operator tailing is sufficient for v0.1 observability]

Plan implications:

- Add `.protostar/stress/<sessionId>/events.jsonl`.
- Add `stress-report.json` snapshots for machine-readable summary.
- Add a CLI/status read path if needed, but no HTTP server in Phase 11.
- Defer R3 sibling dashboard to a future phase with separate authority review.
- Reject R1/no-live-progress because sustained-load and wedge detection need append-only evidence.

### Q-07 Archetype Scope Recommendation

**Choose all-three narrow lift: `feature-add`, `bugfix`, and `refactor`, with `feature-add` as the fallback.**

All three archetypes already exist in the current codebase as explicit policy rows, admission paths, capability admission functions, and draft examples. That makes the lift mostly a controlled conversion from "stub/unsupported" to "wired/narrowly supported", not a greenfield domain expansion. [VERIFIED: `packages/intent/src/archetypes.ts`, `packages/intent/src/admission-paths.ts`, `packages/intent/src/capability-admission.ts`, `examples/intents/feature-add.draft.json`]

Scope guard:

- Wire positive admission only for bounded file/task shapes.
- Keep repair-loop defaults/caps archetype-specific.
- Make TTT delivery depend only on `feature-add`.
- If all-three lift threatens Phase 11 schedule, do `feature-add` fully and leave bugfix/refactor explicitly unsupported with updated requirements noting the fallback.

### Q-19 Driver Split

**Use bash only for sustained-load; use TypeScript for concurrency and fault injection.**

Bash is adequate for sequential orchestration and already used by `scripts/dogfood.sh`, but concurrency/fault injection needs structured cancellation, worker accounting, process timeout reasoning, report snapshots, and race-free event appends. Put those in TypeScript under `apps/factory-cli/src/scripts/stress.ts` and a shared module under `apps/factory-cli/src/stress/stress-session.ts`. [VERIFIED: `scripts/dogfood.sh`, `apps/factory-cli/src/commands/__dogfood-step.ts`]

Implementation shape:

- `scripts/stress.sh --shape sustained-load --runs N ...` loops and delegates to built factory CLI.
- `node apps/factory-cli/dist/scripts/stress.js --shape concurrency ...` runs bounded parallel sessions.
- `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection ...` injects deterministic timeouts/errors/cancellations.
- Both paths write through the same stress session/report module.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` compiled from TypeScript. [VERIFIED: `.planning/codebase/TESTING.md`] |
| Config files | Package `tsconfig.json` references plus package `package.json` test scripts. [VERIFIED: repo package manifests] |
| Quick run command | `pnpm --filter <package> test` |
| Full suite command | `pnpm run verify` and `pnpm run verify:full` |
| Current CI command | `.github/workflows/verify.yml` runs `pnpm run verify:full`. [VERIFIED: `.github/workflows/verify.yml`] |

### Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node | Build/tests/factory CLI | Yes | `v22.22.1` [VERIFIED: local command] | None |
| pnpm | Workspace install/tests | Yes | `10.33.0` [VERIFIED: local command] | None |
| git | Branch-per-run delivery | Yes | `2.50.1` [VERIFIED: local command] | None |
| GitHub CLI `gh` | PR/CI checks | Yes | `2.91.0` [VERIFIED: local command] | Manual GitHub API check |
| jq | Bash stress/dogfood parsing | Yes | `jq-1.7.1-apple` [VERIFIED: local command] | Move parsing into Node |
| bash | `scripts/stress.sh` | Yes | GNU bash `3.2.57` [VERIFIED: local command] | Keep script POSIX-ish / avoid bash 4 arrays |
| cargo | Tauri build in toy repo | Yes | `1.94.0` [VERIFIED: local command] | CI-only Tauri build |
| Playwright | Toy repo E2E | Not installed in toy repo today [VERIFIED: `../protostar-toy-ttt/package.json`] | Add as immutable toy repo prerequisite |
| fast-check | Toy repo property tests | Not installed in toy repo today [VERIFIED: `../protostar-toy-ttt/package.json`] | Add as immutable toy repo prerequisite |

### Package Version Findings

| Package | Current Registry Version | Use |
|---------|--------------------------|-----|
| `@playwright/test` | `1.59.1`, modified 2026-04-29 [VERIFIED: npm registry] | Toy repo E2E dependency and CI/browser automation. |
| `fast-check` | `4.7.0`, modified 2026-04-17 [VERIFIED: npm registry] | Toy repo property/state-machine tests. |
| `openai` | `6.35.0`, modified 2026-04-28 [VERIFIED: npm registry] | Optional hosted OpenAI-compatible client. Direct `fetch` is also acceptable. |
| `@anthropic-ai/sdk` | `0.91.1`, modified 2026-04-24 [VERIFIED: npm registry] | Deferred native Anthropic adapter if needed. |
| `zod` | Repo currently uses `3.25.76` in factory CLI; registry latest is `4.3.6`. [VERIFIED: local package list] [VERIFIED: npm registry] | Keep repo on current Zod major unless a separate upgrade phase is planned. |

### Validation Dimensions

| Dimension | Required Evidence | Commands / Tests to Add |
|-----------|-------------------|--------------------------|
| Archetype lift | Selected archetypes no longer blocked as unsupported; fallback behavior explicit. | `pnpm --filter @protostar/intent test`; admission E2E tests for `feature-add`, `bugfix`, `refactor`; grep rejects stale `unsupported-goal-archetype` for wired archetypes. |
| Seed library | `feature-add/ttt-game.json` exists and is exported by archetype; old cosmetic seeds remain stable. | `pnpm --filter @protostar/fixtures test`; fixture snapshot/contract. |
| Immutable toy verification | Factory refuses to modify `e2e/ttt.spec.ts` and `tests/ttt-state.property.test.ts`; preflight fails if missing. | Planning/admission contract; factory CLI preflight test with temp target repo. |
| Headless mode | Config and CLI accept exactly three modes; no interactive prompt code allowed in headless path. | CLI parser tests; config schema tests; admission-e2e no-prompt scan for `readline`, `inquirer`, `prompts`, `process.stdin`, `question(`. |
| Backend selection | LM Studio remains default; hosted and mock can be selected; no API keys needed for mock CI. | Factory CLI config tests; adapter factory tests; `pnpm --filter @protostar/lmstudio-adapter test`; new adapter package tests. |
| Authority boundary | New packages declare correct tier; network packages no-fs; pure packages no-net. | `pnpm --filter @protostar/admission-e2e test`; package-local `no-fs.contract.test.ts` / `no-net.contract.test.ts`. |
| Bounded dependency install | `pnpm add` only permits exact allowlisted packages and safe flags. | `pnpm --filter @protostar/repo test`; schema rejection tests. |
| Stress report schema | Canonical `stress-report.json` and append-only `events.jsonl` parse/validate and survive malformed input. | `pnpm --filter @protostar/artifacts test`; admission-e2e byte-equality contract similar to dogfood report. |
| Sustained load | Sequential stress can run small mock-backed smoke locally; full 500-run gate remains manual/scheduled. | `bash scripts/stress.sh --shape sustained-load --runs 3 --llm-backend mock --headless-mode local-daemon`. |
| Concurrency | TypeScript runner respects concurrency cap and writes per-session evidence. | `node apps/factory-cli/dist/scripts/stress.js --shape concurrency --sessions 2 --concurrency 2 --llm-backend mock`. |
| Fault injection | Runner records injected failures, cancellation, and stop-the-world behavior without corrupting report. Final phase-gate evidence covers `network-drop`, `llm-timeout`, `disk-full`, and `abort-signal`. | `node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario llm-timeout --runs 1 --llm-backend mock`. |
| Wedge detection | Stop-the-world if run exceeds 5x p95 successful duration and has no sentinel/cancel transition. | Unit tests for p95 computation and liveness integration. |
| TTT delivery | PR opened in toy repo, CI green, Playwright E2E full game, property test passes, Tauri debug build passes. | In `../protostar-toy-ttt`: `pnpm test`, `pnpm exec playwright test`, `pnpm tauri build --debug --no-bundle`; `gh pr checks`. |
| Security review | Phase 11 entries cover no prompts, hosted API keys, self-hosted runner risks, pnpm allowlist, and no dashboard server. | `.planning/SECURITY-REVIEW.md` update plus admission-e2e security contract if present. |

### Plan Checker Hooks

| Check | How Plan Checker Can Verify |
|-------|-----------------------------|
| R2 dashboard choice | No new HTTP/websocket/dashboard source under `apps/factory-cli`; stress artifacts include `events.jsonl`; plan 11-08 does not add server lifecycle. |
| Q-19 split | `scripts/stress.sh` exists and only targets sustained-load; `apps/factory-cli/src/scripts/stress.ts` exists for concurrency/fault injection; both import shared stress session code. |
| No prompt audit | Static scan of production `src/` rejects interactive prompt imports and stdin question APIs. |
| Authority boundary | New package manifests include `protostar.tier`; network packages include no-fs test; pure packages include no-net test. |
| Hosted secrets | Config supports env var references; no API keys are committed or written into artifacts. |
| Append-only evidence | Tests assert event append does not truncate prior lines and malformed lines do not erase report history. |
| Stress report schema | `packages/artifacts` exports schema/formatter and package tests validate canonical order. |
| Immutable toy assumptions | Tests prove factory rejects plan changes targeting `e2e/ttt.spec.ts` and `tests/ttt-state.property.test.ts`. |
| No merge authority | Existing no-merge contract remains green; no new `gh pr merge`, `git merge --`, `pulls.merge`, `enableAutoMerge`, or update-branch strings. |
| Full repo verification | `pnpm run verify` and `pnpm run verify:full` pass before phase gate. |

## Risks and Landmines

- **Cosmetic repair-loop mismatch:** Context says keep/permit cosmetic default 3, but code currently caps cosmetic policy at 1 and Phase 10 drafts use 1. Changing defaults broadly may break Phase 10 assumptions. Prefer explicit per-archetype caps and explicit seed budgets. [VERIFIED: `packages/intent/src/archetypes.ts`, `packages/intent/src/capability-envelope.ts`]
- **Stale judge wording:** The LM Studio judge prompt is cosmetic-focused. Non-cosmetic goals may be judged incorrectly unless prompts become archetype-aware. [VERIFIED: `packages/lmstudio-adapter/src/create-judge-adapter.ts`]
- **Toy repo prerequisites absent:** `../protostar-toy-ttt` currently lacks `e2e/ttt.spec.ts`, `tests/ttt-state.property.test.ts`, and real `pnpm test`. Phase 11 cannot honestly satisfy TTT delivery until those immutable files exist on toy main. [VERIFIED: `../protostar-toy-ttt/package.json`]
- **Tauri CI cost and platform dependencies:** Tauri builds require OS packages on Linux and can be slow; keep full toy build as gate/manual CI, not every local unit test. [VERIFIED: `../protostar-toy-ttt/.github/workflows/ci.yml`] [CITED: `https://v2.tauri.app/develop/tests/webdriver/`]
- **Hosted LLM secrets:** Hosted backend must read keys from environment/config indirection and must never serialize secrets into manifests, events, reports, or run logs. [CITED: `https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions`]
- **Self-hosted runner risk:** Self-hosted runners have different isolation and persistence risks than GitHub-hosted runners; security review must call this out and default heavy stress to trusted repos/environments. [CITED: `https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners`]
- **Bash version:** Local macOS bash is 3.2.57; do not write bash 4-specific associative arrays or `mapfile` logic in `scripts/stress.sh`. [VERIFIED: local command]
- **`pnpm add` blast radius:** Allowing dependency installation expands execution authority. Keep validation in `packages/repo`, use exact allowlisted package names/specs, and log every dependency-add operation. [VERIFIED: `packages/repo/src/subprocess-schemas/pnpm.ts`]
- **Artifacts package Zod dependency:** `packages/artifacts` has Zod in devDependencies today. Exported runtime Zod schemas require dependency movement or a pure schema-data alternative. [VERIFIED: `packages/artifacts/package.json`]
- **Status path mismatch:** `status --full` appears to read `delivery/result.json`, while delivery code writes `delivery/delivery-result.json`; stress should not rely on that field until corrected or separately verified. [VERIFIED: `apps/factory-cli/src/commands/status.ts`, `apps/factory-cli/src/commands/deliver.ts`]
- **Hard-coded dogfood repo owner:** Dogfood step contains a hard-coded `zakkeown/protostar-toy-ttt`; stress/TTT delivery should config-gate this and avoid burying repo identity in reusable logic. [VERIFIED: `apps/factory-cli/src/commands/__dogfood-step.ts`]
- **Dark autonomy vs live progress:** A dashboard server would widen the observable/control surface. R2 event tail keeps evidence durable without changing authority. [VERIFIED: `AGENTS.md`]
- **Phase 10 fixture stability:** Existing Phase 10 matrix and cosmetic seeds should be additive-preserved. Do not rewrite old fixture outputs just to fit the new grouped seed library. [VERIFIED: `packages/fixtures/src/seeds/seed-library.test.ts`]
- **Concurrency race conditions:** Parallel stress runs must use session-scoped paths and serialized writes per report path. Reuse `writeSnapshotAtomic` style and avoid shared temp filenames. [VERIFIED: `apps/factory-cli/src/snapshot-writer.ts`]
- **No implementation in research:** This artifact only plans; source changes should happen in Phase 11 execution tasks. [VERIFIED: user instruction]

## Plan Skeleton Recommendation

| Plan | Wave | Dependencies | Main Files to Modify |
|------|------|--------------|----------------------|
| `11-01-requirements-traceability.md` | Wave 0 | None | `.planning/REQUIREMENTS.md`, `.planning/STATE.md` |
| `11-02-archetype-admission-lift.md` | Wave 1 | 11-01 | `packages/intent/src/archetypes.ts`, `packages/intent/src/admission-paths.ts`, `packages/intent/src/capability-admission.ts`, `packages/policy/src/archetypes/index.ts`, tests in `packages/intent/src/*.test.ts`, `packages/admission-e2e/src/*` |
| `11-03-seed-library-ttt.md` | Wave 1 | 11-01, 11-02 | `packages/fixtures/src/seeds/index.ts`, `packages/fixtures/src/seeds/feature-add/ttt-game.json`, `packages/fixtures/src/seeds/seed-library.test.ts`, package exports |
| `11-04-immutable-toy-verification.md` | Wave 1 | 11-03 | Planning/admission guard files, `apps/factory-cli/src/*preflight*`, tests using temp target repos, documentation for required toy repo files |
| `11-05-headless-mode-config-cli.md` | Wave 2 | 11-01 | `packages/lmstudio-adapter/src/factory-config.ts`, `packages/lmstudio-adapter/src/factory-config.schema.json`, `apps/factory-cli/src/commands/run.ts`, `apps/factory-cli/src/cli-args.ts`, `apps/factory-cli/src/load-factory-config.ts`, tests |
| `11-06-llm-backend-selection.md` | Wave 2 | 11-05 | `apps/factory-cli/src/main.ts`, new adapter factory module, `packages/execution` contract tests if needed, LM Studio regression tests |
| `11-07-hosted-and-mock-adapters.md` | Wave 3 | 11-06 | New `packages/hosted-llm-adapter`, hosted workspace/tsconfig/app manifest wiring, no-fs contract tests, adapter unit tests |
| `11-15-mock-adapter-selector-wiring.md` | Wave 4 | 11-06, 11-07 | New `packages/mock-llm-adapter`, factory-cli selector wiring, app manifest/tsconfig references, AGENTS.md tier mirror, no-net contract tests |
| `11-08-stress-artifact-schema-and-events.md` | Wave 3 | 11-01 | `packages/artifacts/src/stress-report.schema.ts`, `packages/artifacts/src/index.ts`, `packages/artifacts/package.json`, artifact schema tests, admission-e2e byte-equality tests |
| `11-09-stress-session-core.md` | Wave 3 | 11-08 | `apps/factory-cli/src/stress/stress-session.ts`, `apps/factory-cli/src/stress/*.test.ts`, `apps/factory-cli/src/run-liveness.ts` integration, `apps/factory-cli/src/snapshot-writer.ts` reuse |
| `11-10-sustained-load-bash-driver.md` | Wave 5 | 11-09, 11-05, 11-15 | `scripts/stress.sh`, `apps/factory-cli` hidden/support commands if needed, stress smoke tests/docs |
| `11-11-concurrency-fault-ts-driver.md` | Wave 5 | 11-09, 11-15 | `apps/factory-cli/src/scripts/stress.ts`, package bin/build config, worker-pool/fault tests |
| `11-12-pnpm-add-allowlist.md` | Wave 4 | 11-02 | `packages/repo/src/subprocess-schemas/pnpm.ts`, new allowlist module, repo tests, security review note |
| `11-13-ci-headless-security-gates.md` | Wave 6 | 11-05, 11-07, 11-10, 11-11, 11-12, 11-15 | `.github/workflows/verify.yml` PR mock smokes, new manual/scheduled workflow, `packages/admission-e2e/src/contracts/no-interactive-prompts.contract.test.ts`, `.planning/SECURITY-REVIEW.md`, `SECURITY.md` |
| `11-14-ttt-delivery-and-stress-gate.md` | Wave 7 | all prior | `apps/factory-cli` TTT preflight/status integration, final live evidence docs, Phase 11 state/roadmap update only after evidence, stress gate fixtures and scripts |

### Suggested Wave Gates

| Wave | Gate |
|------|------|
| Wave 0 | Requirements and traceability exist before code tasks. |
| Wave 1 | Archetype, toy preflight, headless config, and stress artifact contracts pass. |
| Wave 2 | TTT seed, backend selection, stress session core, and `pnpm add` allowlist pass. |
| Wave 3 | Hosted OpenAI-compatible package compiles, redacts secrets, and is tier-conformant. |
| Wave 4 | Deterministic mock backend and hosted/mock selector wiring pass. |
| Wave 5 | Sustained-load and TypeScript concurrency/fault mock smokes pass locally. |
| Wave 6 | PR mock smokes, no-prompt, no-dashboard, secret-redaction, and no-merge gates pass. |
| Wave 7 | Final non-autonomous TTT delivery plus sustained/concurrency/fault evidence is recorded before STATE/ROADMAP completion. |

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No for factory local CLI; yes indirectly for hosted API credentials. | Environment-secret lookup only; no committed keys. [CITED: GitHub Actions security hardening docs] |
| V3 Session Management | No web session in R2. | Do not add dashboard server/session cookies in Phase 11. [VERIFIED: Q-17 resolution] |
| V4 Access Control | Yes for repo/runner authority. | Preserve package tier boundaries and subprocess allowlists. [VERIFIED: `AGENTS.md`] |
| V5 Input Validation | Yes. | Zod/config schemas for headless modes, backend selection, stress reports, and subprocess args. [VERIFIED: existing config/schema patterns] |
| V6 Cryptography | No new crypto expected. | Do not hand-roll secret handling; rely on CI secret stores/environment. [CITED: GitHub Actions security hardening docs] |

| Threat Pattern | STRIDE | Standard Mitigation |
|----------------|--------|---------------------|
| Hosted LLM API key leakage into logs/artifacts | Information Disclosure | Redact env-derived secrets; never include secret values in event/report schemas. |
| Self-hosted runner residue between stress runs | Elevation of Privilege / Information Disclosure | Document trusted-runner requirement; keep branch-per-run and prune scoped artifacts. |
| Arbitrary dependency install via `pnpm add` | Tampering / Elevation of Privilege | Exact package allowlist in `packages/repo`, `shell:false`, schema tests. |
| Interactive prompt blocking CI | Denial of Service | No-prompt static contract and headless smoke tests. |
| Stress event/report corruption under concurrency | Tampering / Repudiation | Append-only events plus atomic canonical report snapshots. |
| Accidental merge/update-branch during delivery | Tampering | Existing no-merge contract plus plan checker grep for merge/update-branch strings. |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser E2E automation | Custom DOM/browser runner | Playwright `@playwright/test` [VERIFIED: npm registry] [CITED: `https://playwright.dev/docs/ci`] | Handles browsers, traces, retries, CI integration, and web server lifecycle. |
| Property/state-machine testing | Custom random-state generator | `fast-check` [VERIFIED: npm registry] [CITED: `https://fast-check.dev/docs/`] | Shrinking/replay and model-based patterns are easy to get wrong manually. |
| JSON canonicalization | Ad hoc key sorting per report | `packages/artifacts/src/canonical-json.ts` | Existing package already owns byte-stable sorting. |
| Atomic artifact writes | Plain `writeFile` for reports | `apps/factory-cli/src/snapshot-writer.ts` pattern | Stress reports are evidence; they need durable rename/fsync behavior. |
| Shell command safety | String-concatenated shell commands | `packages/repo/src/subprocess-runner.ts` with schemas | Existing runner uses `shell:false`, allowlists, and timeouts. |
| Hosted LLM protocol abstraction | New generic AI framework | Existing `ExecutionAdapter` contract | Keeps backend changes behind current execution boundary. |

## State of the Art

| Old Approach | Current Approach | Evidence | Impact |
|--------------|------------------|----------|--------|
| Local-only LM Studio backend | LM Studio default plus selectable hosted/mock backends | Phase 11 locked decision; LM Studio OpenAI-compatible client exists. [VERIFIED: context + local file] | Preserve local behavior while enabling headless CI and deterministic stress. |
| Cosmetic-only dogfood seeds | Per-archetype seed library with feature-add TTT seed | Phase 11 locked decision; current fixture library is cosmetic-only. [VERIFIED: context + local file] | Unlocks meaningful E2E validation. |
| Sequential dogfood report | Stress report plus append-only event evidence | Phase 11 locked decision; dogfood report pattern exists. [VERIFIED: context + local file] | Supports sustained-load, concurrency, and fault analysis. |
| Manual/local operation | Headless modes for GitHub-hosted, self-hosted-runner, and local-daemon | Phase 11 locked decision. [VERIFIED: context] | Makes factory usable in CI and daemonized local loops. |
| Full dashboard | Event tail for v0.1 | Q-17 R2 chosen. [VERIFIED: context] | Avoids premature server/dashboard authority. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenAI-compatible hosted backend is enough for Phase 11; native Anthropic Messages streaming can be deferred. | User Constraints / STRESS-08 | If user requires Anthropic first, adapter scope grows and tests need provider-specific stream fixtures. |
| A2 | Operator tailing `events.jsonl` is acceptable v0.1 observability. | Q-17 Dashboard Choice | If live UI is required, Phase 11 needs a separate dashboard/server authority review. |
| A3 | TTT can be implemented without adding app dependencies beyond existing React/Tauri stack. | STRESS-09 | If the model needs dependencies, the `pnpm add` allowlist must include only those exact packages. |
| A4 | Full 500-run/20-session/100-fault stress gates should be manual or scheduled, while PR CI runs small mock smokes. | Validation Architecture | If full stress must run on every PR, CI time/cost and flake budgets change substantially. |

## Open Questions (RESOLVED)

1. **Which hosted provider must be first-class in Phase 11?**
   - Resolution: implement `hosted-openai-compatible` first, using the existing OpenAI-compatible chat/completions shape from LM Studio as the protocol baseline.
   - Native Anthropic Messages streaming is deferred from Phase 11; do not add Anthropic SDK/provider-specific streaming in this phase.

2. **Who creates immutable toy repo verification files?**
   - Resolution: Phase 11 includes an explicit non-autonomous operator-authored setup/gate before final factory delivery.
   - The files `../protostar-toy-ttt/e2e/ttt.spec.ts` and `../protostar-toy-ttt/tests/ttt-state.property.test.ts` must exist and be recorded as operator-authored evidence before the final TTT delivery run.
   - Factory-generated plans must never edit those files; admission/preflight may check them and must refuse if they are missing or targeted for mutation.

3. **How much stress belongs in normal CI?**
   - Resolution: PR CI gets fast mock-backed smokes only.
   - Full sustained-load, concurrency, and fault-injection caps are manual/scheduled phase-gate evidence and must not run on every PR.
   - The final Phase 11 evidence gate records the full-cap command outputs before STATE/ROADMAP may mark Phase 11 complete.

## Sources

### Primary (HIGH confidence)

- `AGENTS.md` - package tiers, authority boundaries, no-fs/no-net rules, development gates.
- `.planning/PROJECT.md` - milestone constraints, out-of-scope locks, runtime dependency posture.
- `.planning/STATE.md` - recent Phase 10.1 state and Phase 11 pending status.
- `.planning/ROADMAP.md` - Phase 11 scope and success criteria.
- `.planning/REQUIREMENTS.md` - requirement and traceability style.
- `.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md` - locked Phase 11 decisions.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/TESTING.md` - codebase structure and testing conventions.
- `packages/intent/src/archetypes.ts`, `admission-paths.ts`, `capability-admission.ts`, `capability-envelope.ts` - archetype/admission/budget implementation.
- `packages/fixtures/src/seeds/index.ts` and `seed-library.test.ts` - existing seed library.
- `packages/repo/src/subprocess-*` - command authority and subprocess schemas.
- `packages/execution/src/adapter-contract.ts` - existing execution adapter boundary.
- `packages/lmstudio-adapter/src/*` - current local LLM backend and config.
- `apps/factory-cli/src/*` - CLI composition, config loading, dogfood/status/prune/artifact writers.
- `packages/artifacts/src/*` - canonical JSON and artifact exports.
- `packages/admission-e2e/src/*` - authority, tier, dogfood, prune contracts.
- `../protostar-toy-ttt/*` - toy repo package/scripts/CI/current source.

### External / Current (MEDIUM-HIGH confidence)

- npm registry - `@playwright/test@1.59.1`, `fast-check@4.7.0`, `openai@6.35.0`, `@anthropic-ai/sdk@0.91.1`, local `zod@3.25.76`.
- Playwright docs - CI and test web server usage: `https://playwright.dev/docs/ci`, `https://playwright.dev/docs/test-webserver`.
- fast-check docs - property/model-based testing: `https://fast-check.dev/docs/`.
- Tauri v2 docs - WebDriver testing: `https://v2.tauri.app/develop/tests/webdriver/`.
- GitHub Actions docs - workflow events, security hardening, self-hosted runners: `https://docs.github.com/en/actions`.
- OpenAI API docs - Chat Completions / structured JSON: `https://platform.openai.com/docs/api-reference/chat`.
- Anthropic API docs - Messages API and streaming: `https://docs.anthropic.com/en/api/messages`.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH for repo-local stack and package versions; hosted provider details are resolved for Phase 11 as `hosted-openai-compatible` first.
- Architecture: HIGH because package boundaries and authority tiers are explicit and contract-tested.
- Pitfalls: HIGH for repo landmines found by direct file inspection; MEDIUM for CI/hosted-runner operational risks.
- Validation: HIGH for internal commands/tests; MEDIUM for final toy repo CI because required verification files are absent today.

**Research date:** 2026-04-29  
**Valid until:** 2026-05-29 for repo-local architecture; 2026-05-06 for npm/provider version recommendations.
