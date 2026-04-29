---
phase: 12-authority-boundary-stabilization
plan: 04
subsystem: subprocess-runner + delivery redact
tags: [authority, secret-leak, subprocess, redact]
requires: []
provides:
  - "@protostar/delivery/redact subpath (TOKEN_PATTERNS + redactTokens)"
  - "subprocess-runner POSIX-baseline env default + required inheritEnv"
  - "SubprocessResult.inheritedEnvKeys field"
  - "env-empty-default.contract.test.ts (D-07 structural pin)"
affects:
  - "@protostar/delivery (new subpath export, version-bump-equivalent)"
  - "@protostar/delivery-runtime (drops local TOKEN_PATTERN; imports shared)"
  - "@protostar/repo (RunCommandOptions breaking change: inheritEnv required)"
  - "@protostar/admission-e2e (allowlist-refusal contract test updated; new env-empty-default test)"
tech-stack:
  added: []
  patterns:
    - "Read-side redaction at tail/result construction (raw on-disk logs may still contain tokens; redaction lives at the read boundary)"
    - "Per-call env allowlist (POSIX baseline ∪ inheritEnv ∩ defined-in-parent)"
key-files:
  created:
    - packages/delivery/src/redact.ts
    - packages/delivery/src/redact.test.ts
    - packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts
  modified:
    - packages/delivery/src/index.ts
    - packages/delivery/package.json
    - packages/delivery-runtime/src/map-octokit-error.ts
    - packages/delivery-runtime/src/index.ts
    - packages/delivery-runtime/README.md
    - packages/repo/src/subprocess-runner.ts
    - packages/repo/src/subprocess-runner.test.ts
    - packages/repo/package.json
    - packages/repo/tsconfig.json
    - packages/admission-e2e/src/repo-runtime-subprocess-allowlist-refusal.contract.test.ts
decisions:
  - "Tolerate macOS-injected __CF_USER_TEXT_ENCODING / __CFBundleIdentifier in child env assertions (OS-level, not factory authority)"
  - "Redaction at result construction (read boundary), not at write time (raw on-disk logs are tolerated)"
metrics:
  duration: ~25 minutes
  completed: 2026-04-29
  tasks: 4/4
---

# Phase 12 Plan 04: Subprocess Env + Redact Summary

Token never crosses the subprocess boundary; redaction lives at one shared site (`@protostar/delivery/redact`) so the runtime filter and the future secret-leak attack test (12-08) share one regex.

## What Shipped

- **Shared redact module** — `packages/delivery/src/redact.ts` exports `TOKEN_PATTERNS` (frozen array of GH PAT, Bearer, JWT regexes) and `redactTokens(value)`. Subpath export `@protostar/delivery/redact` wired in package.json.
- **delivery-runtime migration** — `map-octokit-error.ts` no longer declares a local `TOKEN_PATTERN`; it imports `redactTokens` from the shared module. The barrel + README drop the now-removed re-export.
- **subprocess-runner env default flip** — child env is now `POSIX baseline (PATH, HOME, LANG, USER) ∪ inheritEnv ∩ defined-in-parent`. `RunCommandOptions.inheritEnv` is REQUIRED (not optional). `SubprocessResult.inheritedEnvKeys` records exactly which keys crossed (sorted, deduped). `redactTokens` is applied to `stdoutTail`/`stderrTail` at result construction.
- **D-07 structural pin** — `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts` enforces (1) static scan: no `inheritEnv: [...]` literal in `apps/factory-cli/src` or `packages/repo/src` may contain `PROTOSTAR_GITHUB_TOKEN`; (2) runtime: empty `inheritEnv` plus a planted parent token does not leak the token to the child; (3) runtime: explicit `inheritEnv` extends baseline; (4) source-shape: `inheritEnv` field has no `?` and `POSIX_BASELINE_ENV_KEYS` is pinned literally.

## Commits

| # | Hash    | Message                                                              |
|---|---------|----------------------------------------------------------------------|
| 1 | 73c3402 | `feat(12-04): add shared @protostar/delivery/redact module`          |
| 2 | e2a1639 | `refactor(12-04): migrate delivery-runtime to shared redactTokens`   |
| 3 | c9064a3 | `feat(12-04): flip subprocess-runner to POSIX baseline + required inheritEnv` |
| 4 | 2ca26ec | `test(12-04): add env-empty-default contract test (D-07)`            |

## Verification

- `pnpm --filter @protostar/delivery test` — green (24 tests; 6 new redact tests when run directly).
- `pnpm --filter @protostar/delivery-runtime test` — green (86 tests).
- `pnpm --filter @protostar/repo test` — green (103 tests, +3 new for env-baseline / inheritEnv extend / PAT redaction).
- `pnpm --filter @protostar/admission-e2e test` — green (157 tests, +4 new env-empty-default subtests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] macOS auto-injected env keys break strict baseline assertion**
- **Found during:** Task 3 (and again in Task 4 contract test)
- **Issue:** macOS/CoreFoundation injects `__CF_USER_TEXT_ENCODING` (and sometimes `__CFBundleIdentifier`) into every child process regardless of the env passed to `spawn`. The plan's behavior contract said child env keys must be a strict subset of `[PATH, HOME, LANG, USER]`, which fails on Darwin.
- **Fix:** Tests assert child env keys are a subset of `factoryAllowed ∪ osInjected`, while `inheritedEnvKeys` (the factory's own ledger) remains a strict subset of `factoryAllowed`. The factory authority claim is still pinned exactly; OS-level injections are documented as out of factory scope.
- **Files modified:** `packages/repo/src/subprocess-runner.test.ts`, `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts`
- **Commits:** c9064a3, 2ca26ec

**2. [Rule 3 - Blocking] NODE_SCHEMA does not allow `-e` flag**
- **Found during:** Task 4
- **Issue:** Plan skeleton used `node -e "..."` for runtime checks, but `NODE_SCHEMA` only allows `--test` / `--enable-source-maps`. Subprocess runner refused before spawn.
- **Fix:** Wrote a minimal `dump-env.mjs` script into the sacrificial repo dir and ran `node <script>` instead.
- **Files modified:** `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts`
- **Commit:** 2ca26ec

## Deferred Issues (out of scope for 12-04)

- **`@protostar/mechanical-checks` no-net contract failing** — `diff-name-only.ts` and `create-mechanical-checks-adapter.ts` still import network APIs in the worktree base. This is the territory of plan 12-03 (`diff-name-only-relocate`); not introduced by 12-04. Pre-existing in the merge base.
- **`pnpm --filter @protostar/delivery test` glob** — `dist/**/*.test.js` only matches one level deep under sh/zsh without globstar, so top-level test files (`brands.test.js`, `redact.test.js`, etc.) are skipped from the package script. They DO run when invoked directly (`node --test dist/redact.test.js` confirmed all 6 redact tests green). Pre-existing pattern bug; not introduced by 12-04.

## Threat Mitigation

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-12-02 (env-secret leakage) | **Mitigated.** Token never reaches a subprocess: env default is POSIX baseline + per-call required inheritEnv; structural contract test refuses `inheritEnv` literals containing `PROTOSTAR_GITHUB_TOKEN`; shared `redactTokens` filters tail reads as defense-in-depth. |

## Self-Check: PASSED

- packages/delivery/src/redact.ts: FOUND
- packages/delivery/src/redact.test.ts: FOUND
- packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts: FOUND
- Commit 73c3402: FOUND
- Commit e2a1639: FOUND
- Commit c9064a3: FOUND
- Commit 2ca26ec: FOUND
