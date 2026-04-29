---
plan: 12-07
phase: 12-authority-boundary-stabilization
status: complete
requirements: [AUTH-11, AUTH-12, AUTH-13]
threats_mitigated: [T-12-04]
recovery: orchestrator-completed
---

# 12-07 — Tier Conformance (Three-Way) Summary

Recovered after executor stalled at 600s watchdog right before SUMMARY.md.
Three commits had landed cleanly; orchestrator verified tests, wrote SUMMARY,
and finalized the plan.

## Commits

- `303d4c5` refactor(12-07): reclassify evaluation-runner as network in authority-boundary contract
- `aa5ff3b` test(12-07): add failing three-way tier conformance assertions (RED)
- `60e6718` feat(12-07): implement AGENTS.md tier parser for three-way conformance (GREEN)

## What landed

- `packages/admission-e2e/src/tier-conformance.contract.test.ts` — three-way
  assertion across every package: `package.json#protostar.tier` ≡ AGENTS.md
  tier-table label ≡ `authority-boundary.contract.test.ts` PACKAGE_RULES
  classification.
- AGENTS.md tier-table parser fails LOUD on any unrecognized tier label
  (Pitfall 6 defense).
- `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts`
  reclassifies `evaluation-runner` from `PURE_PACKAGE_RULE` to a network-shaped
  rule; manifest stays `network`. `mechanical-checks` remains `pure` everywhere
  (no isomorphic-git after 12-03).

## Verification

```
pnpm exec tsc -p tsconfig.json
node --test dist/tier-conformance.contract.test.js dist/contracts/authority-boundary.contract.test.js
# tests 12 / pass 12 / fail 0 (tier-conformance: 11; authority-boundary: 1 outer suite)
```

Pre-existing Phase 11 noise (mock-llm-adapter, hosted-llm-adapter,
execution-adapter.test source-file gaps) blocks the package-level
`pnpm test` script but is cross-phase; documented in `deferred-items.md`.

## Requirements

- AUTH-11 manifest tier source of truth — covered
- AUTH-12 AGENTS.md/contract conformance — covered
- AUTH-13 evaluation-runner network classification — covered
