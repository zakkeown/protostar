# Phase 12: Authority Boundary Stabilization — Seed

**Captured:** 2026-04-29
**Source:** Post-v1 review findings + architecture read (operator-supplied)
**Status:** Awaiting `/gsd-discuss-phase 12` and `/gsd-plan-phase 12`

## Findings (verbatim)

### Blocker — CI gate is red while local verify is green

`pnpm run verify` passed, but `pnpm run verify:full` failed in `@protostar/mechanical-checks`. CI runs `verify:full` in `.github/workflows/verify.yml:31`, while local `verify` skips many package tests in `package.json:11`. The failure is the no-net contract: `packages/mechanical-checks/src/no-net.contract.test.ts:43` forbids `isomorphic-git`, but production imports it in `packages/mechanical-checks/src/diff-name-only.ts:1`. This should be fixed before more roadmap work.

### High — mechanical review bypasses the hardened subprocess boundary

Config accepts arbitrary mechanical argv strings in `packages/lmstudio-adapter/src/factory-config.schema.json:187`, `configuredMechanicalCommands` returns them directly in `apps/factory-cli/src/wiring/review-loop.ts:214`, and the CLI runs them through raw `spawn` in `apps/factory-cli/src/main.ts:1892`. That bypasses `@protostar/repo`'s allowlist / schema / refusal evidence. It also inherits `process.env`, so a target repo's `pnpm verify` can print tokens into persisted logs. This is the hairiest authority issue I saw.

### High — child process env is leaky by default

The hardened runner also defaults child env to `process.env` in `packages/repo/src/subprocess-runner.ts:33` and `packages/repo/src/subprocess-runner.ts:85`. Since delivery uses `PROTOSTAR_GITHUB_TOKEN` from process env in `apps/factory-cli/src/main.ts:1198`, repo-owned commands should get a tiny explicit env, not the factory's whole bloodstream.

### Medium — applyChangeSet trusts display metadata separately from the real write target

The cosmetic one-file guard counts `PatchRequest.path` in `packages/repo/src/apply-change-set.ts:65`, but reads/writes `patch.op` in `packages/repo/src/apply-change-set.ts:82` and `packages/repo/src/apply-change-set.ts:114`. Current CLI wiring derives both from the same entry, but the exported repo API does not enforce that invariant. Add a mismatch refusal test and validate path, op path, and parsed diff filenames agree.

### Medium — boundary tests are drifting from the manifest source of truth

The project guide says `@protostar/mechanical-checks` is pure in `AGENTS.md:26`, and its manifest agrees in `packages/mechanical-checks/package.json:36`, but the implementation is doing git workspace inspection. Also, `@protostar/evaluation-runner` declares `"network"` in `packages/evaluation-runner/package.json:37`, while the authority-boundary test treats it as pure in `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts:76`. The boundary model is good; the duplicated encoding is starting to wobble.

## Architecture Read

Keep the monorepo, keep domain packages, keep Protostar as the authority boundary and Dogpile as bounded coordination. That decision is aging well.

The next pressure point is decomposition inside the biggest files: `packages/planning/src/index.ts:1` is 5701 lines and `apps/factory-cli/src/main.ts:1` is 3429 lines. Do not split them for aesthetics yet, but **after the authority fixes**, pull out command execution wiring, review-loop wiring, and delivery wiring from `main.ts`.

## Recommended Unit

"Authority boundary stabilization" — fix `verify:full`, move mechanical diff/workspace inspection behind repo or injected evidence, route mechanical commands through the repo subprocess runner, and scrub env by default. That's the chunk that makes the rest of v1 feel much less haunted.
