---
phase: 12
slug: authority-boundary-stabilization
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-29
updated: 2026-04-29
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` against compiled `dist/*.test.js` (built-in, no extra dep) |
| **Config file** | none — per-package `package.json:scripts.test` |
| **Quick run command** | `pnpm --filter @protostar/<package> test` for the single package under change |
| **Full suite command** | `pnpm run verify` (post-D-01 — single command for both local and CI) |
| **Estimated runtime** | ≈12 seconds for a single-package quick run; ≈3-5 minutes for full unified verify |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @protostar/<changed-package> test` (≤30s).
- **After every plan wave:** Run `pnpm run verify` (full unified, post-12-01).
- **Phase gate:** `pnpm run verify` green + `./scripts/dogfood.sh --runs 3` green + secret-leak-attack contract green; then `/gsd-verify-work`.
- **Max feedback latency:** 30 seconds per task commit; 5 minutes per wave merge.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | AUTH-01 | T-12-05 | Local + CI run identical verify script (no skip lists) | static | `grep -q '"verify":' package.json && ! grep -q 'verify:full' .github/workflows/verify.yml && pnpm run typecheck` | ✅ existing | ⬜ pending |
| 12-01-02 | 01 | 0 | AUTH-01, AUTH-16 | — | Phase 12 AUTH-NN block + traceability rows added to REQUIREMENTS.md | static | `grep -c '\| AUTH-[0-9]\+ \| Phase 12 \|' .planning/REQUIREMENTS.md` returns 16 | ✅ existing | ⬜ pending |
| 12-01-03 | 01 | 0 | AUTH-01 (gate) | T-12-05 | Wave 0 end-of-wave gate: 5x consecutive `pnpm run verify` green (Pitfall 7 — Plan 06-09 flake check) | smoke | `for i in 1 2 3 4 5; do pnpm run verify || exit 1; done` | ✅ existing (gate) | ⬜ pending |
| 12-02-01 | 02 | 0 | AUTH-04 | T-12-01 | Schema 1.6.0 const + mechanical.allowed closed enum; intent + authority compile | unit | `pnpm --filter @protostar/intent build && pnpm --filter @protostar/authority build` | ✅ existing (modify) | ⬜ pending |
| 12-02-02 | 02 | 0 | AUTH-04 | T-12-01 | All `1.5.0` literals cascaded to `1.6.0`; mechanical.allowed defaults injected per fixture | static | `! grep -rln '"1\.5\.0"' packages/ apps/ examples/` | ✅ existing (modify) | ⬜ pending |
| 12-02-03 | 02 | 0 | AUTH-04 | T-12-01 | Signed examples re-signed under c14n@1.0; signed-intent test renamed | unit | `pnpm --filter @protostar/admission-e2e test` | ✅ existing (rename) | ⬜ pending |
| 12-03-01 | 03 | 0 | AUTH-02 | T-12-04 (related) | computeDiffNameOnly + isomorphic-git relocated to @protostar/repo | static + unit | `! grep -q 'isomorphic-git' packages/mechanical-checks/package.json && pnpm --filter @protostar/repo test` | ❌ Wave 0 (file move) | ⬜ pending |
| 12-03-02 | 03 | 0 | AUTH-02 | T-12-04 (related) | mechanical-checks adapter consumes injected diffNameOnly; review-loop wires it | static + unit | `! grep -q 'isomorphic-git\|gitFs' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts && pnpm --filter @protostar/mechanical-checks test` | ✅ existing (modify) | ⬜ pending |
| 12-04-01 | 04 | 1 | AUTH-08 | T-12-02 | Shared TOKEN_PATTERNS + redactTokens in @protostar/delivery/redact | unit | `pnpm --filter @protostar/delivery test` | ❌ Wave 0 — `packages/delivery/src/redact.test.ts` | ⬜ pending |
| 12-04-02 | 04 | 1 | AUTH-08 | T-12-02 | delivery-runtime imports redactTokens (no inline regex) | static + unit | `! grep -q 'TOKEN_PATTERN = /' packages/delivery-runtime/src/map-octokit-error.ts && pnpm --filter @protostar/delivery-runtime test` | ✅ existing (modify) | ⬜ pending |
| 12-04-03 | 04 | 1 | AUTH-06 | T-12-02 | subprocess-runner default child env = POSIX baseline; required inheritEnv | unit | `pnpm --filter @protostar/repo test` | ✅ existing (modify) | ⬜ pending |
| 12-04-04 | 04 | 1 | AUTH-06, AUTH-07 | T-12-02 | env-empty-default contract: PROTOSTAR_GITHUB_TOKEN cannot appear in inheritEnv literal; runtime baseline-only | unit (static + runtime) | `pnpm --filter @protostar/admission-e2e test --test-name-pattern env-empty-default` | ❌ Wave 0 — `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts` | ⬜ pending |
| 12-05-01 | 05 | 1 | AUTH-10 | T-12-03 | canonicalizeRelativePath helper in @protostar/paths (pure compute over node:path/posix) | unit | `pnpm --filter @protostar/paths test` | ❌ Wave 0 — `packages/paths/src/canonicalize-relative-path.test.ts` | ⬜ pending |
| 12-05-02 | 05 | 1 | AUTH-09, AUTH-10 | T-12-03 | PatchRequest brand + mintPatchRequest refusals + applyChangeSet re-assertion | unit | `pnpm --filter @protostar/repo test` | ✅ existing (extend) | ⬜ pending |
| 12-05-03 | 05 | 1 | AUTH-09, AUTH-10 | T-12-03 | apply-change-set-mismatch contract: 3 mint refusals + round-trip + handcraft re-assertion | unit | `pnpm --filter @protostar/admission-e2e test --test-name-pattern apply-change-set-mismatch` | ❌ Wave 0 — `packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts` | ⬜ pending |
| 12-06-01 | 06 | 2 | AUTH-03 | T-12-01 | CLOSED_MECHANICAL_COMMAND_NAMES + bindings + MechanicalCommandRefusedError in @protostar/repo | unit | `pnpm --filter @protostar/repo test` | ❌ Wave 0 — `packages/repo/src/mechanical-commands.test.ts` | ⬜ pending |
| 12-06-02 | 06 | 2 | AUTH-03, AUTH-05, AUTH-14 | T-12-01 | wiring/{command-execution,delivery}.ts extracted; main.ts no child_process import; runSpawnedCommand deleted; config schema closed-enum | static + unit | `! grep -q 'node:child_process' apps/factory-cli/src/main.ts && pnpm --filter @protostar/factory-cli test` | ✅ existing (modify); ❌ new wiring files | ⬜ pending |
| 12-06-03 | 06 | 2 | AUTH-03, AUTH-05, AUTH-14 | T-12-01 | mechanical-via-repo contract: no spawn in main.ts, schema-enum agreement, token structural split, cwd === workspaceRoot | unit (static + runtime) | `pnpm --filter @protostar/admission-e2e test --test-name-pattern mechanical-via-repo` | ❌ Wave 0 — `packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts` | ⬜ pending |
| 12-07-01 | 07 | 3 | AUTH-13 | T-12-04 | evaluation-runner authority-boundary rule flips to network-shaped (manifest agreement) | unit | `pnpm --filter @protostar/admission-e2e test --test-name-pattern authority-boundary` | ✅ existing (modify) | ⬜ pending |
| 12-07-02 | 07 | 3 | AUTH-11, AUTH-12 | T-12-04 | tier-conformance three-way: manifest == AGENTS.md == authority-boundary; unrecognized labels fail loud | unit (static parse) | `pnpm --filter @protostar/admission-e2e test --test-name-pattern tier-conformance` | ✅ existing (extend) | ⬜ pending |
| 12-08-01 | 08 | 4 | AUTH-15 | T-12-02 | Sentinel token absent from persisted mechanical artifacts; shares TOKEN_PATTERNS with runtime filter | unit (offensive runtime) | `pnpm --filter @protostar/admission-e2e test --test-name-pattern secret-leak-attack` | ❌ Wave 0 — `packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts` | ⬜ pending |
| 12-08-02 | 08 | 4 | AUTH-15 | T-12-02 | Phase 10 dogfood loop ≥3 runs end-to-end on protostar-toy-ttt; ≥2/3 reach pr-ready | manual (operator) | `./scripts/dogfood.sh --runs 3` + record evidence in `12-08-DOGFOOD-EVIDENCE.md` | ❌ — checkpoint:human-verify | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Per AUTH-16: pre-phase orchestrator ordering check (no test artifact). AUTH-16 has no row above by design.*

---

## Wave 0 Requirements

New test files / scaffolds that MUST exist before their consuming task runs:

- [ ] `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts` — covers AUTH-06, AUTH-07 (created by 12-04 Task 4)
- [ ] `packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts` — covers AUTH-09, AUTH-10 (created by 12-05 Task 3)
- [ ] `packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts` — covers AUTH-03, AUTH-05, AUTH-14 (created by 12-06 Task 3)
- [ ] `packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts` — covers AUTH-15 attack half (created by 12-08 Task 1)
- [ ] `packages/delivery/src/redact.ts` + `redact.test.ts` — covers AUTH-08 (created by 12-04 Task 1)
- [ ] `packages/repo/src/mechanical-commands.ts` + `mechanical-commands.test.ts` — covers AUTH-03 (created by 12-06 Task 1)
- [ ] `packages/paths/src/canonicalize-relative-path.ts` + `.test.ts` — covers AUTH-10 (created by 12-05 Task 1)
- [ ] `packages/admission-e2e/src/signed-intent-1-6-0.test.ts` (renamed from 1-5-0) — covers AUTH-04 (renamed by 12-02 Task 3)

Test framework: `node --test` (built-in). No new framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phase 10 dogfood loop end-to-end on `protostar-toy-ttt` | AUTH-15 (operational half) | Requires real GitHub PAT + live network + real toy-repo state; not reproducible in CI | `PROTOSTAR_DOGFOOD_PAT=… ./scripts/dogfood.sh --runs 3`; record run IDs, verdicts, PR URLs in `12-08-DOGFOOD-EVIDENCE.md`. ≥2/3 must reach pr-ready terminal state. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (AUTH-15 operational half is the lone manual checkpoint)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (8 new test files enumerated above)
- [x] No watch-mode flags
- [x] Feedback latency < 30s per task commit
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — populated 2026-04-29
