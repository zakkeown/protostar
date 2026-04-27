---
phase: 2
slug: authority-governance-kernel
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-27
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This audit consolidates STRIDE entries from all 15 plans in
`.planning/phases/02-authority-governance-kernel/`, plus the gap-closure waves
recorded in `02-VERIFICATION.md` and `02-UAT.md`. De-duplication collapses
T-2-* identifiers that recur across plans into one entry per (component +
category). Verification was performed exclusively against the live code at
HEAD (commit a77f5f7) and its tests.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Workspace install boundary | New `@protostar/authority` workspace must not regress Phase 1 verify:full | TS sources, schemas |
| Authority package boundary | `packages/authority/src/**` MUST NOT import `node:fs` (structurally enforced) | n/a — pure module surface |
| AuthorizedOp brand surface | All callers obtain brands only via `authorize*Op` producers | Branded `AuthorizedWorkspaceOp` / `Subprocess` / `Network` / `Budget` |
| Repo-policy load boundary | `.protostar/repo-policy.json` is operator-controlled file read by factory-cli; absence defaults to DENY (A3) | RepoPolicy JSON |
| Precedence-tier boundary | Intersection is the only way to combine tiers; no tier widens | Capability grants per tier |
| Sign / verify boundary | Every stage acting on a `ConfirmedIntent` calls `verifyConfirmedIntentSignature` (Q-17) | ConfirmedIntent + SignatureEnvelope |
| Canonical form dispatch | Unknown `canonicalForm` tags fail-closed; never silently fall back | canonicalForm tag string |
| CLI argv boundary | Untrusted user-supplied argv validated before runFactory | `--trust`, `--confirmed-intent` |
| Stage-read boundary | All cross-stage reads go through `AuthorityStageReader` | Disk artifacts → branded objects |
| FS-adapter boundary | Authority package never imports fs; readers receive injected adapter | FsAdapter calls |
| Trust predicate boundary | One predicate (`assertTrustedWorkspaceForGrant`) — admission, runtime, and AuthorizedOp mint converge | WorkspaceRef.trust |
| Per-gate schema validation boundary | Stage readers validate disk artifacts against per-gate schemas before branding | JSON artifacts |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (code:line · test:line) | Status |
|-----------|----------|-----------|-------------|-------------------------------------|--------|
| T-2-1 | Tampering | ConfirmedIntent reaching execution | mitigate | Central helper `verifyConfirmedIntentSignature` (`packages/authority/src/signature/verify.ts:36`); stage reader `confirmedIntent()` rejects unverified before returning brand (`packages/authority/src/stage-reader/factory.ts:102-113,128`); split `readParsedConfirmedIntent` vs `confirmedIntent` (`factory.ts:33,38,97-100`); legacy 1.0.0 non-null-signature guard (`factory.ts:235`). Tests: `signature/sign-verify.test.ts:55-125` (tamper of intent body, envelope, snapshot); `admission-e2e/src/signed-confirmed-intent.e2e.test.ts` (sign→persist→mutate→verify); `stage-reader/factory.test.ts:198-206` (legacy guard). | closed |
| T-2-2 | Tampering / EoP | AuthorizedOp envelope widening between admission and execution | mitigate | Branded type with sole producer per brand: `workspace-op.ts:36` calls `hasWorkspaceGrant`; `subprocess-op.ts:36` calls `hasExecuteGrant`; `network-op.ts:39` calls `hasNetworkGrant`; `budget-op.ts:37` calls `hasBudgetGrant` (`packages/authority/src/authorized-ops/grant-checks.ts`). Negative tests: `authorized-ops.test.ts:86-96,150-152,193-194,241` reject empty `resolvedEnvelope`. Public-surface contract tests: `admission-e2e/src/authorized-{workspace,subprocess,network,budget}-op-mint.contract.test.ts`. | closed |
| T-2-3 | Tampering / Info Disclosure | Repo-policy.json absent → permissive default | mitigate | `DENY_ALL_REPO_POLICY` constant in `packages/authority/src/repo-policy/parse.ts`; compatibility wrapper `repoPolicyForCurrentCompatibility` fully removed (grep across `packages/`+`apps/` returns 0 hits); fail-closed branch at `apps/factory-cli/src/main.ts:278` halts on `precedenceDecision.status === "blocked-by-tier"` and writes blocking repo-scope evidence. Tests: `factory-cli` suite (82 tests) covers absent-repo-policy → exit-2 path; UAT Test 1 confirms cold-start `pnpm run factory` exits 2 with explicit deny message. | closed |
| T-2-4 | EoP | `escalate` verdict bypassed by inner gate returning admit | mitigate | Outcome literal is single source re-export in `packages/authority/src/admission-decision/outcome.ts` (verified by `admission-decision.test.ts:42`). Distinct exit codes wired in `apps/factory-cli/src/main.ts:162` (block=1) and `:182` (escalate=2); `writeEscalationMarker` produces durable evidence (`main.ts:69`). Tests: factory-cli escalation marker tests + `admission-e2e/src/parameterized-admission.test.ts`. | closed |
| T-2-5 | EoP | Hardcoded `trust: "trusted"` + missing runtime check | mitigate | Three-layer defense: (1) hardcoded `trust: "trusted"` literal removed from `apps/factory-cli/src/main.ts` (grep returns 0 hits); CLI-arg-driven `args.trust` propagated through runFactory. (2) Admission-time refusal via `assertTrustedWorkspaceForGrant` in `packages/authority/src/workspace-trust/predicate.ts:24` consumed at `authorized-ops/workspace-op.ts:30`. (3) Runtime layer in `packages/repo/src/workspace-trust-runtime.ts:38`. Two-key launch: any path no longer suffices — `verifyTrustedLaunchConfirmedIntent` (`apps/factory-cli/src/two-key-launch.ts:87`) parses, verifies signature, and matches body+snapshot before allowing trusted launch (called at `main.ts:350`). Tests: 7-subtest `two-key-launch.test.ts:144-310` (missing/malformed/invalid/unsigned/signature-mismatch/body-mismatch/success); `workspace-trust/predicate.test.ts`. | closed |
| T-2-6 | Tampering | Stage reader accepts wrong-schema artifact | mitigate | All 5 per-gate schemas use `additionalProperties: false` (`packages/intent/schema/{intent,capability,repo-scope}-admission-decision.schema.json`, `packages/planning/schema/planning-admission-decision.schema.json`, `packages/repo/schema/workspace-trust-admission-decision.schema.json`); reader validates schemaVersion + gate literal (`packages/authority/src/stage-reader/factory.ts`); writer/reader agreed on canonical `artifactPath` field with legacy `path` fallback (`factory.ts:247,251`). Repo-policy schema budget caps now have `minimum: 0` (`packages/authority/schema/repo-policy.schema.json:39-42`) for parser parity. Tests: admission-e2e suite (55 tests); per-gate writer suite (4); schema parity test in `packages/authority/src/repo-policy/repo-policy.test.ts`. | closed |
| T-2-7 | Tampering | Canonicalization ambiguity (different canonicalForm tags producing different hashes) | mitigate | Tag-registry single dispatch in `packages/authority/src/signature/canonical-form-registry.ts:6`; unknown tag fail-closes at `verify.ts:58-63` returning structured mismatch evidence; canonicalizer rejects NaN/±Inf/-0/undefined/bigint/Date/RegExp/Map (`canonicalize.ts` + 16 rejection tests in `canonicalize.test.ts:23-59`). Sub-hash narrowing (`SignatureEnvelope.intentHash`/`envelopeHash`/`policySnapshotHash`) deterministically identifies divergent field. Tests: `sign-verify.test.ts:103-115` (unknown canonicalForm tag end-to-end). | closed |
| T-Authority-Boundary | Structural Lock (cross-cutting) | `@protostar/authority` package | mitigate | Regression contract test `packages/admission-e2e/src/authority-no-fs.contract.test.ts` fails the suite if any future change introduces `node:fs` import in authority sources (4 grep checks). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Unregistered Flags

None. All 15 plan summaries reported either "None" or "None beyond planned trust-boundary surfaces" in their `## Threat Flags` sections. No new attack surface appeared during implementation that lacks a threat-register mapping.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-27 | 8 | 8 | 0 | gsd-secure-phase (Claude Opus 4.7) |

Audit notes:
- `02-VERIFICATION.md` (2026-04-27T16:55:51Z) recorded 6 BLOCKER gaps. Plans 02-11 through 02-15 closed all 6; UAT (`02-UAT.md`) re-verified 8/8 tests green on 2026-04-27.
- All mitigations verified by both code grep and negative-case test grep at HEAD (a77f5f7).
- No implementation files modified during audit (read-only).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (none)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-27
