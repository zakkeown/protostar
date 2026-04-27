---
phase: 3
slug: repo-runtime-sandbox
status: planning-complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
---

# Phase 3 — Validation Strategy

Per-phase validation contract for feedback sampling during repo runtime and sandbox execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` built into Node 22; TypeScript compiled with project references before test execution |
| **Config file** | `tsconfig.json`, `tsconfig.base.json`, per-package `tsconfig.json` files |
| **Quick run command** | `pnpm --filter <pkg> test` for the affected package |
| **Full suite command** | `pnpm run verify:full` |
| **Estimated runtime** | ~15s for focused package tests; ~30s for the full suite on a warm install |

---

## Sampling Rate

Research sampling rate, carried from `03-RESEARCH.md`:

- **Per task commit:** run `pnpm --filter @protostar/{affected-package} test` for every affected package.
- **Per wave merge:** run `pnpm run verify:full`.
- **Phase gate:** `pnpm run verify:full` must be green before `/gsd-verify-work`.
- **Max feedback latency:** no three consecutive implementation tasks without automated verification.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | REPO-09 | T-03-01-03 | CONFLICT-01 mechanism revision is auditable and dependency posture is explicit. | docs/static | `rg -n "CONFLICT-01|isomorphic-git|diff" .planning PROJECT.md` | ✅ | ⬜ pending |
| 3-01-02 | 01 | 0 | REPO-09 | T-03-01-01 | Runtime deps are exact-pinned and workspace clone output is ignored. | install/static | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 0 | REPO-09 | T-03-01-02 | `.env.example` names future env vars without secret values. | static | `test -f .env.example && rg -n "GITHUB_PAT|LM_STUDIO" .env.example` | ✅ | ⬜ pending |
| 3-02-01 | 02 | 0 | REPO-07 | T-03-02-01 / T-03-02-02 | Workspace root resolution walks to `pnpm-workspace.yaml` without business logic. | unit | `pnpm --filter @protostar/paths test` | ✅ | ⬜ pending |
| 3-02-02 | 02 | 0 | REPO-07 | T-03-02-03 | AGENTS.md documents the narrow `@protostar/paths` exception. | static | `rg -n "@protostar/paths Carve-Out" AGENTS.md` | ✅ | ⬜ pending |
| 3-03-01 | 03 | 0 | REPO-06 | T-03-03-01 / T-03-03-02 | ConfirmedIntent schema hard-bumps to 1.2.0 and defaults `allowDirty: false`. | unit | `pnpm --filter @protostar/intent test` | ✅ | ⬜ pending |
| 3-03-02 | 03 | 0 | REPO-06 | T-03-03-03 | Intent fixtures and tests reject unknown workspace keys. | unit | `pnpm --filter @protostar/intent test` | ✅ | ⬜ pending |
| 3-03-03 | 03 | 0 | REPO-06 | T-03-03-01 | Factory/admission fixtures consume schemaVersion 1.2.0 consistently. | integration | `pnpm run verify:full` | ✅ | ⬜ pending |
| 3-04-01 | 04 | 0 | REPO-02 | T-03-04-01 / T-03-04-02 | Sacrificial repo fixture stays test-only and cleanup-aware. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-04-02 | 04 | 0 | REPO-02 | T-03-04-03 | Fixture self-tests prove git commits/branches/symlinks are deterministic. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-05-01 | 05 | 1 | REPO-03 | T-03-05-01 / T-03-05-02 | Failing fs-adapter tests cover traversal, symlinks, access mismatch, and canonicalization. | TDD red | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-05-02 | 05 | 1 | REPO-03 | T-03-05-03 / T-03-05-04 | FS adapter enforces brand access and re-canonicalizes before I/O. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-06-01 | 06 | 1 | REPO-03 | T-03-06-01 | Symlink audit tests refuse symlinks by entry type, not target content. | TDD red | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-06-02 | 06 | 1 | REPO-03 | T-03-06-02 / T-03-06-03 | `auditSymlinks` returns stable workspace-relative offending paths. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-07-01 | 07 | 2 | REPO-05 | T-03-07-01 / T-03-07-05 | Apply-change-set contract tests pin hash mismatch and binary refusal. | TDD red | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-07-02 | 07 | 2 | REPO-05 | T-03-07-03 / T-03-07-04 | `applyChangeSet` uses SHA-256 pre-image gates and best-effort evidence. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-08-01 | 08 | 1 | REPO-04 | T-03-08-01 / T-03-08-04 | Argv guard tests refuse metacharacters, whitespace, and disallowed flags. | TDD red | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-08-02 | 08 | 1 | REPO-04 | T-03-08-02 / T-03-08-03 | Allowlist and schemas keep baseline commands and exact-match flags. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-08-03 | 08 | 1 | REPO-04 | T-03-08-01 | Per-command schema tests pin git/pnpm/node/tsc command surfaces. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-09-01 | 09 | 2 | REPO-04 | T-03-09-01 / T-03-09-03 | Runner validates before spawn, uses argv array form, streams output, and kills on timeout. | integration | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-09-02 | 09 | 2 | REPO-04 | T-03-09-02 / T-03-09-05 | Integration tests prove tails, byte counts, and flush-on-exit evidence. | integration | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-10-01 | 10 | 2 | REPO-06 | T-03-10-04 | Dirty-worktree filter ignores untracked files and catches tracked divergence. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-10-02 | 10 | 2 | REPO-01 / REPO-06 | T-03-10-05 | Repo policy parser refuses recursive workspace roots and malformed config. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-10-03 | 10 | 2 | REPO-01 / REPO-02 | T-03-10-01 / T-03-10-02 / T-03-10-03 | Clone records auth mode without secret values and triggers symlink audit. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-11-01 | 11 | 3 | REPO-01 / REPO-02 / REPO-05 / REPO-06 / REPO-07 | T-03-11-01 / T-03-11-04 | Cleanup removes success workspaces and tombstones failed runs. | unit | `pnpm --filter @protostar/repo test` | ✅ | ⬜ pending |
| 3-11-02 | 11 | 3 | REPO-07 | T-03-11-02 | Factory CLI resolves workspace root through `@protostar/paths`. | integration | `pnpm --filter @protostar/factory-cli test` | ✅ | ⬜ pending |
| 3-11-03 | 11 | 3 | REPO-01 / REPO-02 / REPO-05 / REPO-06 | T-03-11-02 / T-03-11-03 | `runFactory` emits repo-runtime admission decisions and blocks before unsafe side effects. | integration | `pnpm run verify:full && pnpm run factory` | ✅ | ⬜ pending |
| 3-12-01 | 12 | 4 | REPO-03 / REPO-05 | T-03-12-01 | Admission-e2e pins hash-mismatch and best-effort patch evidence shapes. | contract | `pnpm --filter @protostar/admission-e2e test` | ✅ | ⬜ pending |
| 3-12-02 | 12 | 4 | REPO-03 / REPO-06 | T-03-12-01 / T-03-12-02 | Dirty-worktree and symlink refusal evidence is producer-backed. | contract | `pnpm --filter @protostar/admission-e2e test` | ✅ | ⬜ pending |
| 3-12-03 | 12 | 4 | REPO-04 | T-03-12-01 | Subprocess allowlist/argv refusal evidence is schema-backed. | contract | `pnpm --filter @protostar/admission-e2e test` | ✅ | ⬜ pending |
| 3-13-01 | 13 | 5 | REPO-08 | T-03-13-01 / T-03-13-02 | `@dogpile/sdk@0.2.0` is exact-pinned and shim re-exports from upstream. | build/unit | `pnpm --filter @protostar/dogpile-types test && pnpm --filter @protostar/dogpile-adapter test && ! grep -rn '"link:' packages apps 2>/dev/null` | ✅ | ⬜ pending |
| 3-13-02 | 13 | 5 | REPO-08 | T-03-13-01 / T-03-13-03 | Fresh install succeeds with sibling `~/Code/dogpile` moved aside and restored. | manual smoke | `pnpm install --frozen-lockfile && pnpm --filter @protostar/dogpile-types why @dogpile/sdk && pnpm run verify:full` | ✅ | ⬜ pending |
| 3-13-03 | 13 | 5 | REPO-08 | T-03-13-02 | Validation document is filled and marked nyquist-compliant. | static | `head -10 .planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md | grep -q 'nyquist_compliant: true'` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts` — Plan 04 sacrificial repo builder for clone/dirty/symlink/branch tests.
- [x] `packages/repo/internal/test-fixtures/index.ts` — Plan 04 private subpath barrel.
- [x] `packages/repo/internal/test-fixtures/build-sacrificial-repo.test.ts` — Plan 04 fixture self-test.
- [x] `packages/paths/src/resolve-workspace-root.test.ts` — Plan 02 workspace-root sentinel coverage.
- [x] Intent schema cascade updates — Plan 03 schemaVersion `1.2.0`, `allowDirty` default, fixtures, and downstream admission/factory test updates.
- [x] `.env.example` — Plan 01 Phase 3-7 forward-look env var names without real secrets.
- [x] `packages/repo/package.json` `./internal/test-fixtures` export — Plan 04 test-only fixture access.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fresh install with no sibling `~/Code/dogpile` | REPO-08 | Requires temporarily moving an operator-owned sibling directory and confirming it is restored. | Move `~/Code/dogpile` aside, remove dependency folders, run `pnpm install --frozen-lockfile`, verify `@dogpile/sdk@0.2.0` resolves under `@protostar/dogpile-types`, restore sibling, run `pnpm run verify:full`. Plan 13 Task 2 passed and is documented in `03-13-fresh-clone-smoke.md`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no three consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target documented; full-suite gate used for wave and phase completion.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** planning-complete 2026-04-27; actual completion gated on Plan 13 summary and final full-suite verification.
