---
phase: 07-delivery
reviewed: 2026-04-28T15:57:30Z
depth: deep
files_reviewed: 17
files_reviewed_list:
  - packages/delivery-runtime/src/push-branch.ts
  - packages/delivery-runtime/src/push-branch.test.ts
  - packages/delivery-runtime/src/map-octokit-error.ts
  - packages/delivery-runtime/src/map-octokit-error.test.ts
  - packages/delivery-runtime/src/post-evidence-comment.ts
  - packages/delivery-runtime/src/post-evidence-comment.test.ts
  - packages/delivery-runtime/src/execute-delivery.ts
  - packages/delivery-runtime/src/execute-delivery.test.ts
  - packages/delivery/src/refusals.ts
  - packages/delivery/src/refusals.test.ts
  - packages/delivery/src/pr-body/compose-run-summary.ts
  - packages/delivery/src/pr-body/compose-run-summary.test.ts
  - apps/factory-cli/src/assemble-delivery-body.ts
  - apps/factory-cli/src/assemble-delivery-body.test.ts
  - apps/factory-cli/src/execute-delivery-wiring.ts
  - apps/factory-cli/src/execute-delivery-wiring.test.ts
  - apps/factory-cli/src/main.ts
findings:
  blocker: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-04-28T15:57:30Z
**Depth:** deep
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Re-reviewed Phase 7 Delivery after the blocker fixes, focusing on the prior BL-01 through BL-05 and WR-01 findings plus the live factory-cli PR body path. The five prior blockers are fixed in the current source and covered by targeted tests. I did not find a remaining blocker in the requested scope.

One prior warning remains: an individually oversized evidence section still throws during delivery body assembly instead of producing a typed delivery-blocked artifact or bounded comment.

## Prior Blocker Recheck

### BL-01: Fixed - Push failures are not misclassified as cancelled

**File:** `packages/delivery-runtime/src/push-branch.ts:109`

`pushBranch` now returns `cancelled` only when the signal is aborted or the thrown error is abort-like, and otherwise returns a `push-failed` refusal with a sanitized message. `readRemoteSha` applies the same distinction at `packages/delivery-runtime/src/push-branch.ts:155-162`.

### BL-02: Fixed - Generic Octokit failures map to non-cancelled redacted refusals

**File:** `packages/delivery-runtime/src/map-octokit-error.ts:42`

Unrecognized Octokit failures now return `github-api-error` with phase/status/message evidence instead of `cancelled`. The message path uses the shared sanitizer and a 500-character bound.

### BL-03: Fixed - PR-created plus initial CI capture failure still returns delivered

**File:** `packages/delivery-runtime/src/execute-delivery.ts:92`

After PR create/update, initial CI snapshot failures are caught and converted into a delivered outcome with an empty checks array and redacted `captureError`. This preserves the PR URL/number/head SHA in the delivery outcome.

### BL-04: Fixed - Comment failure reasons are redacted

**File:** `packages/delivery-runtime/src/post-evidence-comment.ts:54`

Evidence comment failures now return `sanitizeDeliveryErrorMessage(error)` instead of the raw error message, so `commentFailures` persisted by factory-cli no longer receive PAT-shaped tokens from this path.

### BL-05: Fixed - DeliveryAuthorization runId mismatch blocks delivery

**File:** `packages/delivery-runtime/src/execute-delivery.ts:64`

`executeDelivery` now checks `authorization.runId !== ctx.runId` before any push or GitHub PR action and returns `delivery-authorization-mismatch` on mismatch.

### CLI PR Body Path: Fixed

**File:** `apps/factory-cli/src/main.ts:1040`

The live delivery body now uses `critiquesFromLoop(loop)` and `deliveryIterationsFromLoop(loop)` instead of hardcoded empty arrays. `wireExecuteDelivery` also passes a finalizer at `apps/factory-cli/src/execute-delivery-wiring.ts:69-80`, and `executeDelivery` updates the PR body with the assigned PR URL at `packages/delivery-runtime/src/execute-delivery.ts:85-89`.

## Warnings

### WR-01: Oversized individual evidence comments still throw instead of degrading delivery

**File:** `apps/factory-cli/src/assemble-delivery-body.ts:110`

**Issue:** `assembleDeliveryBody` still validates the three standard evidence comments before it can spill the combined full body into an overflow comment. If any single section exceeds the 60 KB GitHub body/comment limit, `validateEvidenceComment` throws at `apps/factory-cli/src/assemble-delivery-body.ts:116-120`. This is still locked in by `apps/factory-cli/src/assemble-delivery-body.test.ts`, which expects the throw.

**Impact:** A very large judge rationale, mechanical finding set, or repair history can still crash delivery body assembly before `wireExecuteDelivery` can persist a typed `delivery-result.json`.

**Fix:** Convert oversized individual evidence comments into bounded/truncated comments, multiple comment chunks, or a typed delivery-blocked artifact. Add a `wireExecuteDelivery` test proving that this path persists a typed result instead of throwing out of the delivery stage.

## Verification

- `pnpm --filter @protostar/delivery-runtime test` passed: 86 tests.
- `pnpm --filter @protostar/delivery test` passed: 18 tests.
- `pnpm --filter @protostar/factory-cli test` passed: 187 tests.
- Initial attempt with `pnpm exec vitest ...` failed because `vitest` is not installed in this workspace; the package scripts use `node --test`.

## Final Status

**UNBLOCKED with one warning.** BL-01 through BL-05 are fixed. WR-01 remains and should be addressed before relying on delivery for unusually large review artifacts, but I do not consider it a blocker for the specific blocker-fix re-review.

---

_Reviewed: 2026-04-28T15:57:30Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
