---
phase: 11-headless-mode-e2e-stress
plan: 07
subsystem: execution-adapter
tags: [headless-mode, hosted-backend, openai-compatible, execution-adapter, network-tier]

requires:
  - phase: 11-headless-mode-e2e-stress/11-06
    provides: "Default-preserving LLM backend selector and typed unavailable hosted/mock branches."
provides:
  - "Network-tier @protostar/hosted-llm-adapter workspace package with local no-fs contract."
  - "OpenAI-compatible chat/completions client using Node 22 fetch and env-referenced API keys."
  - "Hosted ExecutionAdapter implementation with fake-secret redaction and timeout handling."
  - "Factory-cli/package/project references for later selector wiring."
affects: [11-09, 11-13, 11-15, factory-cli, hosted-llm-adapter]

tech-stack:
  added: []
  patterns:
    - "Hosted provider access stays in a network-tier package with no filesystem/path authority."
    - "Secrets enter through apiKeyEnv and are redacted as <redacted:ENV_NAME> in errors and events."
    - "Factory-cli keeps hosted selection fail-closed while type-referencing the hosted config for package-boundary readiness."

key-files:
  created:
    - packages/hosted-llm-adapter/README.md
    - packages/hosted-llm-adapter/package.json
    - packages/hosted-llm-adapter/tsconfig.json
    - packages/hosted-llm-adapter/src/index.ts
    - packages/hosted-llm-adapter/src/hosted-openai-client.ts
    - packages/hosted-llm-adapter/src/hosted-openai-client.test.ts
    - packages/hosted-llm-adapter/src/coder-adapter.ts
    - packages/hosted-llm-adapter/src/coder-adapter.test.ts
    - packages/hosted-llm-adapter/src/no-fs.contract.test.ts
  modified:
    - AGENTS.md
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - apps/factory-cli/src/wiring/execution-adapter.ts
    - packages/admission-e2e/src/tier-conformance.contract.test.ts
    - pnpm-lock.yaml
    - tsconfig.base.json
    - tsconfig.json

key-decisions:
  - "Used Node 22 fetch directly and did not add OpenAI, Anthropic, or other provider SDK dependencies."
  - "Kept hosted runtime selection unavailable in factory-cli until Plan 11-15, while making the package reference real via a hosted config type import."
  - "Reused LM Studio prompt/diff/SSE parsing patterns instead of creating a generic provider abstraction."

requirements-completed: [STRESS-08]

duration: 25 min
completed: 2026-04-29
---

# Phase 11 Plan 07: Hosted OpenAI-Compatible Adapter Summary

**Network-tier hosted OpenAI-compatible execution adapter with env-secret redaction and factory package readiness.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-29T18:26:26Z
- **Completed:** 2026-04-29T18:51:06Z
- **Tasks:** 2
- **Files modified:** 17 implementation, test, config, lockfile, and planning files

## Accomplishments

- Added `@protostar/hosted-llm-adapter` as a workspace network package with Node `>=22`, build/test/typecheck scripts, package README, and no provider SDK dependencies.
- Added package-local no-fs coverage plus admission-e2e tier conformance for the new network package.
- Implemented `callHostedOpenAiCompatibleChatStream` against `/chat/completions`, supporting both OpenAI-compatible JSON and SSE response shapes.
- Implemented `createHostedOpenAiCompatibleCoderAdapter` on the existing `ExecutionAdapter` contract with API key lookup through `PROTOSTAR_HOSTED_LLM_API_KEY` by default.
- Added tests for success, HTTP 401 redaction, timeout abort, malformed response handling, and fake-secret absence from adapter event payloads.
- Wired factory-cli manifest/project references plus root tsconfig/path aliases and the AGENTS.md authority-tier mirror.

## Task Commits

Each task or TDD gate was committed atomically:

1. **Task 1 RED: Hosted adapter tier sentinel** - `33aafad` (test)
2. **Task 1 GREEN: Scaffold hosted adapter package** - `b4070e3` (feat)
3. **Task 2 RED: Hosted adapter behavior tests** - `71f21fb` (test)
4. **Task 2 GREEN: Hosted OpenAI-compatible adapter** - `5a29632` (feat)
5. **Rule 3 fix: Consume hosted package reference** - `be77771` (fix)

## Files Created/Modified

- `packages/hosted-llm-adapter/src/hosted-openai-client.ts` - OpenAI-compatible chat client, response parser, timeout handling, and redaction helpers.
- `packages/hosted-llm-adapter/src/coder-adapter.ts` - Hosted `ExecutionAdapter` implementation using existing prompt and diff parser patterns.
- `packages/hosted-llm-adapter/src/*.test.ts` - Behavior and secret-leak coverage for client and adapter paths.
- `packages/hosted-llm-adapter/src/no-fs.contract.test.ts` - Network-tier no-fs/no-path contract.
- `apps/factory-cli/src/wiring/execution-adapter.ts` - Type-references hosted adapter config while leaving hosted selection fail-closed for Plan 11-15.
- `AGENTS.md`, `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `tsconfig.json`, `tsconfig.base.json`, `pnpm-lock.yaml` - Workspace, authority-tier, and project-reference wiring.
- `packages/admission-e2e/src/tier-conformance.contract.test.ts` - Adds hosted adapter to machine-readable tier conformance.

## Decisions Made

- Hosted backend support is a sibling network package, not a new generic `llm` authority boundary.
- Secrets are represented by env var names at configuration boundaries; exact key values are redacted before any error/event payload leaves the hosted adapter.
- Native Anthropic support remains out of Phase 11; no Anthropic/OpenAI SDK dependency was added.
- Factory-cli still throws the typed hosted unavailable branch until selector/runtime wiring lands in Plan 11-15.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a package README for the new workspace**
- **Found during:** Task 1 (Scaffold hosted adapter package and tier wiring)
- **Issue:** Existing package documentation coverage expects every workspace package to ship a README.
- **Fix:** Added `packages/hosted-llm-adapter/README.md` documenting tier, authority, and public surface.
- **Verification:** `pnpm --filter @protostar/admission-e2e test`
- **Committed in:** `b4070e3`

**2. [Rule 3 - Blocking] Consumed the factory-cli hosted package dependency**
- **Found during:** Post-Task 2 static verification
- **Issue:** Targeted `knip` flagged `@protostar/hosted-llm-adapter` as an unused factory-cli dependency because selector import wiring is deferred.
- **Fix:** Added a type-only hosted adapter config import to the factory selector input while preserving the fail-closed runtime branch.
- **Verification:** `pnpm --filter @protostar/factory-cli run typecheck`, `pnpm --filter @protostar/factory-cli test`, targeted `pnpm knip` over touched workspaces.
- **Committed in:** `be77771`

**Total deviations:** 2 auto-fixed (2 Rule 3)

## Issues Encountered

- `pnpm run verify` fails outside this plan in `@protostar/mechanical-checks` because its existing no-network contract flags existing source/test files. Recorded in `deferred-items.md`.
- Plain root `pnpm knip --no-config-hints` also sees unrelated untracked `.claude/worktrees/...` files when concurrent worktrees are present. Targeted knip for the touched workspaces passed after the factory selector type-reference fix.
- `pnpm run factory` built successfully and stopped at the expected workspace-trust gate with exit 2. The generated `.protostar/refusals.jsonl` verification residue was reverted.

## Known Stubs

- `apps/factory-cli/src/wiring/execution-adapter.ts` still throws `hosted-backend-package-missing` and `mock-backend-package-missing`. This is intentional from Plan 11-06/11-07: the hosted package exists now, but selector runtime wiring is reserved for Plan 11-15.

## Threat Flags

None. The hosted external API surface, env-secret boundary, network-tier no-fs invariant, and timeout mitigation were all covered by the plan threat model.

## Verification

- `pnpm --filter @protostar/hosted-llm-adapter test` - passed.
- `pnpm --filter @protostar/admission-e2e test` - passed.
- `pnpm --filter @protostar/factory-cli run typecheck` - passed.
- `pnpm --filter @protostar/factory-cli test` - passed after the selector type-reference fix.
- `pnpm --filter @protostar/delivery-runtime test` - passed.
- `pnpm knip --no-config-hints --workspace @protostar/hosted-llm-adapter --workspace @protostar/admission-e2e --workspace @protostar/factory-cli` - passed after the selector type-reference fix.
- `pnpm run factory` - built and stopped at the expected workspace-trust gate.
- `pnpm run verify` - failed in pre-existing `@protostar/mechanical-checks` no-network contract, deferred as out of scope.
- Acceptance greps confirmed `PROTOSTAR_HOSTED_LLM_API_KEY`, `<redacted:PROTOSTAR_HOSTED_LLM_API_KEY>`, and `chat/completions`; provider SDK dependency checks found no OpenAI or Anthropic SDK dependency.

## TDD Gate Compliance

- RED gate commits exist for Task 1 (`33aafad`) and Task 2 (`71f21fb`).
- GREEN gate commits exist for Task 1 (`b4070e3`) and Task 2 (`5a29632`).

## Next Phase Readiness

Plan 11-15 can now import `@protostar/hosted-llm-adapter` from factory-cli without manifest, tsconfig, tier, or authority drift. Plan 11-13 can use the redaction and no-fs contracts as its hosted security-gate inputs.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/11-headless-mode-e2e-stress/11-07-SUMMARY.md`
- Hosted adapter files exist: `packages/hosted-llm-adapter/src/hosted-openai-client.ts`, `packages/hosted-llm-adapter/src/coder-adapter.ts`, `packages/hosted-llm-adapter/src/no-fs.contract.test.ts`
- Task and fix commits found: `33aafad`, `b4070e3`, `71f21fb`, `5a29632`, `be77771`
- Requirement and roadmap state updated for `STRESS-08` / `11-07-hosted-and-mock-adapters-PLAN.md`
- Out-of-scope verify blockers recorded in `deferred-items.md`

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
