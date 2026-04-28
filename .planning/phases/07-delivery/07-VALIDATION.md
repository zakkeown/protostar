---
phase: 07
slug: delivery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (monorepo standard) |
| **Config file** | `vitest.config.ts` per package + root |
| **Quick run command** | `pnpm -w turbo run test --filter=@protostar/delivery-runtime --filter=@protostar/delivery --filter=@protostar/intent --filter=apps/factory-cli` |
| **Full suite command** | `pnpm -w turbo run typecheck test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command (filter to packages touched)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

To be populated by gsd-planner. One row per task: link to PLAN.md, requirement, threat ref, automated command, file-exists status.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/delivery-runtime/` workspace skeleton (package.json, tsconfig, vitest.config, src/index.ts)
- [ ] `packages/delivery-runtime/test/no-fs-imports.contract.test.ts` — static AST contract test (mirrors dogpile-adapter)
- [ ] `packages/delivery-runtime/test/no-merge-call.contract.test.ts` — repo-wide grep contract: zero `pulls.merge` / `pullRequests.merge` / `gh pr merge` references
- [ ] `packages/delivery-runtime/test/__fixtures__/nock/` — recorded fixture directory
- [ ] Schema bump: `confirmedIntent.schema.json` 1.4.0 → 1.5.0 (delivery.target + budget.deliveryWallClockMs)
- [ ] Signed-intent fixture cascade (`examples/intents/scaffold.json`, `examples/intents/bad/missing-capability.json`, plus 17 other 1.4.0 references)
- [ ] `factory-config.schema.json` adds `delivery.requiredChecks`
- [ ] AGENTS.md updated: `@protostar/delivery-runtime` listed in network-permitted tier
- [ ] nock 14 + Octokit 22 fetch interception smoke test (RESEARCH Pitfall 6) — proves replay works before any test depends on it; if broken, swap to msw before further plans land

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real PR opens against toy repo | DELIVER-01..07 end-to-end | Phase 10 dogfood dependency (toy repo doesn't exist yet); v0.1 rides nock fixtures | Deferred to Phase 10 |
| Screenshots in evidence bundle | DELIVER-03 | Q-11 explicitly defers Tauri capture pipeline | Deferred to Phase 10 |

---

## Required Contract Tests (Phase 7)

Every contract below MUST exist and pass before verification:

1. **No-fs static contract** — `packages/delivery-runtime` source contains zero `fs`/`node:fs` imports.
2. **No-merge contract** — repo-wide grep returns zero hits for `pulls.merge`, `pullRequests.merge`, `gh pr merge`, `git merge --` in source (test files exempted via explicit allowlist of THIS test only).
3. **Type-level brand-mint negative test** — `// @ts-expect-error` calling `executeDelivery(auth, { branch: 'foo' as string, … })` fails to compile.
4. **Drift-by-construction artifact list** — `composeArtifactList(artifacts)` output equals derived list from input; no hardcoded filenames in source.
5. **Secret-leak contract** — after a simulated run with `PROTOSTAR_GITHUB_TOKEN=ghp_FAKETESTTOKEN…`, recursive grep across `runs/{id}/**` returns zero matches for the token string.
6. **Schema cascade contract** — every signed fixture re-signs and validates against confirmedIntent 1.5.0; mocha-style "old 1.4.0 fixture rejected" assertion.
7. **Idempotency contract** — replay test runs `executeDelivery` twice with same runId; asserts: 1 PR, N evidence comments (not 2N).
8. **Branded refusal taxonomy** — every preflight refusal kind (`token-missing|token-invalid|repo-inaccessible|base-branch-missing`) has at least one fixture exercising it; refusal artifact JSON validates against schema.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] All 8 contract tests above wired into CI before verification
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
