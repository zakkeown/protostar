---
phase: 2
slug: authority-governance-kernel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, ESM, Node 22) |
| **Config file** | none — per-package `tsconfig.json` + workspace `package.json` test scripts |
| **Quick run command** | `pnpm run verify` (fast, scoped) |
| **Full suite command** | `pnpm run verify:full` (recursive, all 9+ workspaces) |
| **Estimated runtime** | ~30s quick / ~90s full |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run verify`
- **After every plan wave:** Run `pnpm run verify:full`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90s

---

## Per-Task Verification Map

> Filled by planner. Reference table maps each task ID to its automated verify command and the requirement/threat it samples. Populated as plans land.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-XX-XX | XX | N | GOV-XX | T-2-XX / — | {expected secure behavior} | unit/contract | `pnpm --filter @protostar/{pkg} test` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/authority/` workspace skeleton (package.json, tsconfig.json, src/index.ts, test scaffold)
- [ ] `packages/authority/test/` — `node:test` stubs for precedence-kernel + brand mints
- [ ] `packages/admission-e2e/test/authority-*.contract.test.ts` — contract test files for the 6 new brands
- [ ] Schema files: `packages/{authority,intent,planning,repo}/schema/*-admission-decision.schema.json`

*Existing `pnpm run verify:full` infrastructure (from Phase 1 Plan 01) covers test discovery once new workspaces are wired into the root package.json.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two-key launch UX (`--trust trusted` requires `--confirmed-intent`) | GOV-04 | CLI ergonomics + error message clarity | Invoke `pnpm factory --trust trusted` without `--confirmed-intent`; assert refusal artifact + non-zero exit; assert error message names the missing flag |
| `escalate` verdict marker artifact readability | GOV-04 (Q-12) | Operators read this in Phase 9; format must be human-scannable | Trigger an escalate-producing condition in a test fixture; manually inspect `runs/{id}/escalation-marker.json` for clarity |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
