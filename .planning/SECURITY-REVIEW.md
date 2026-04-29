# Phase 10 Security Review (DOG-08)

**Date:** 2026-04-29
**Reviewer:** operator
**Scope:** Pre-v0.1 audit of authority boundaries, secret handling, subprocess
surface, network egress, refusal-pipe integrity, prune safety, branch-name
validation, and capability-envelope enforcement.

## Per-surface checklist

| # | Surface | What was reviewed | Status | Notes |
|---|---------|------------------|--------|-------|
| 1 | Subprocess args | `packages/repo/src/subprocess-runner.ts` allowlist and array-form spawn (`shell: false`) | Pass | Phase 3 P-08/P-09 contracts cover command and argv gating |
| 2 | Filesystem writes | Filesystem authority limited to `apps/factory-cli`, `packages/repo`, and the scoped `@protostar/paths` sentinel carve-out | Pass | Enforced by package contracts plus DOG-08 authority-boundary contract |
| 3 | Network egress | `packages/dogpile-adapter` for local LM Studio and `packages/delivery-runtime` for GitHub delivery | Pass | Delivery-runtime owns Octokit; dogpile-adapter has no filesystem authority |
| 4 | Env-var reads | `GITHUB_TOKEN`, `PROTOSTAR_DOGFOOD_PAT`, and `LMSTUDIO_*` usage | Pass | Values are read at adapter/CLI boundaries and not serialized as evidence |
| 5 | PAT scope | Dogfood PAT scoped to `zakkeown/protostar-toy-ttt` | Pass | DOG-01/DOG-03 evidence uses the toy repo only |
| 6 | Branch-name validation | Delivery branch construction and push path | Pass | Delivery-runtime tests cover branch templates and push failures |
| 7 | Prune safety | Active-status guard, run-directory confinement, lineage preservation, and dogfood scope | Pass | Phase 9 prune plus 10-02 dogfood config handling |
| 8 | Refusal log integrity | Append-only `.protostar/refusals.jsonl` and refusal evidence shape | Pass | Prune preserves refusal history; DOG-03 attempts are durable evidence |
| 9 | Capability envelope | Workspace scopes, network permissions, write budgets, and repair-loop bounds | Pass | Intent, authority, execution, and review tests cover the envelope path |
| 10 | Two-key launch | Workspace trust and signed confirmed-intent handoff | Pass | Phase 2/9 contracts keep trusted launch explicit |

## Authority-boundary contract scope

`packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts`
scans production source files under `packages/*/src/**/*.ts`. Ordinary
`*.test.ts`, `*.contract.test.ts`, `*.test-support.ts`, and
`internal/test-fixtures/` files are excluded because they are test harnesses, not
runtime authority surfaces. Package-local production contract files such as
`*.contract.ts` remain in scope.

## Authority-exception ledger

Each entry corresponds to a `// authority-exception: <reason>` comment in
source. The DOG-08 contract fails if an exception comment appears without a
matching file path in this ledger.

| File | Reason | Approved by | Date |
|------|--------|-------------|------|
| (none yet) | | | |

## Findings

- No outstanding findings as of the signoff date.
- Future findings are appended below with date, finding, and disposition.

## Signoff

- **Audit completed:** 2026-04-29
- **Sign-off:** operator
- **Next review:** before any v1.0 release, or upon any new env-var read, new
  subprocess binary, new network egress path, or change to an authority tier.
