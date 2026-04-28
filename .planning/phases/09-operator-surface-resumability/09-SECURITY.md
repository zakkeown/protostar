---
phase: 9
slug: operator-surface-resumability
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-28
---

# Phase 9 - Security

Per-phase security contract: threat register, accepted risks, and audit trail.

## Scope

Phase 9 added the public operator CLI surface (`run`, `status`, `resume`, `cancel`, `inspect`, `deliver`, `prune`) plus resumability and delivery retry contracts. This audit verifies only the threat mitigations declared in Phase 9 plans and summary threat flags.

Summary threat flags across all Phase 9 summaries were `None`. Delivery-related summaries explicitly state that reauthorization is the planned Q-20/Q-21 security boundary and that no merge authority was introduced.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| argv to command parser | Untrusted operator CLI input enters command modules before filesystem access. | runId, command flags, durations |
| runId to runs filesystem | Run IDs become `.protostar/runs/<id>` paths only after regex validation and confinement checks. | run bundle paths |
| stdout consumer | Automation expects stdout to contain machine-readable data only. | canonical JSON or table output |
| manifest writers | Cancel, deliver, and run-loop teardown update durable manifests. | manifest status and delivery state |
| cancel sentinel | Out-of-process cancel creates `runs/<id>/CANCEL`; resume may clear transient sentinels. | cancellation intent |
| journal to resume replay | Resume trusts Phase 4 journal reducers for orphan recovery. | task journal events and replay set |
| persisted delivery authorization | `delivery/authorization.json` is validator input, never a trusted brand. | reauthorization payload |
| operator to prune delete | Prune is the highest-blast-radius filesystem operation in this phase. | run directory deletion candidates |
| public CLI contracts | Downstream automation depends on help text, exit codes, schemas, and status unions. | public CLI surface |

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-09-01-01 | Tampering | argv to runId | mitigate | `RUN_ID_REGEX`, `parseRunId`, and `assertRunIdConfined`; covered by `run-id.test.ts`. | closed |
| T-09-01-02 | DoS-of-automation | stdout JSON discipline | mitigate | `writeStdoutJson` canonical single output and `writeStderr` diagnostics; covered by `io.test.ts` and admission stdout canonical tests. | closed |
| T-09-01-03 | Tampering | exit code mapping | mitigate | Commander `exitOverride()` maps parser errors to `ExitCode.UsageOrArgError`; exit-code contract test pins values. | closed |
| T-09-01-04 | Information Disclosure | help on stdout | mitigate | Commander output is configured to stderr; help snapshot contract asserts stdout is empty. | closed |
| T-09-02-01 | Tampering | canonical JSON divergence | mitigate | `sortJsonValue` single export from artifacts and cross-package stdout round-trip contract. | closed |
| T-09-02-02 | Information Disclosure | snapshot byte equality regression | mitigate | `serializeSnapshot` uses shared canonical JSON; canonical-json and stdout round-trip tests pin idempotency. | closed |
| T-09-03-01 | Tampering | FactoryRunStatus drift | mitigate | `FactoryRunStatus` union pinned by artifacts tests and admission-e2e exact-order contract. | closed |
| T-09-03-02 | Repudiation | manifest.status semantics | accept | Additive status widening accepted; documented in accepted risks log. | closed |
| T-09-04-01 | Tampering | `--run` path traversal | mitigate | Status command validates run IDs and confines paths before manifest lookup. | closed |
| T-09-04-02 | Information Disclosure | progress on stdout | mitigate | Status command writes diagnostics to stderr and data to single stdout payload. | closed |
| T-09-04-03 | Repudiation | crashed process shown as running | mitigate | `computeRunLiveness` derives `orphaned` from stale journals; tests cover stale and terminal states. | closed |
| T-09-04-04 | DoS | large runs directory | accept | v0.1 low-thousands scale bound accepted; documented in accepted risks log. | closed |
| T-09-05-01 | Tampering | inspect runId traversal | mitigate | Inspect command uses `parseRunId` and `assertRunIdConfined`. | closed |
| T-09-05-02 | Information Disclosure | trace inline or size explosion | mitigate | Inspect references trace artifacts by path and sha256 only; tests assert trace contents are not inlined. | closed |
| T-09-05-03 | Information Disclosure | inspect progress on stdout | mitigate | Inspect emits one canonical JSON value and diagnostics to stderr. | closed |
| T-09-06-01 | Tampering | cancel runId traversal | mitigate | Cancel command validates and confines run IDs before touching manifest or sentinel. | closed |
| T-09-06-02 | Tampering | torn manifest write | mitigate | Cancel command writes manifest via temp file plus rename; source and tests pin the atomic pattern. | closed |
| T-09-06-03 | Race / Lost Update | cancel write vs run-loop manifest write | accept | Non-strict ordering is explicitly accepted; documented in help, code comment, and accepted risks log. | closed |
| T-09-06-04 | DoS | repeated cancels | mitigate | Terminal or double-cancel returns exit 4 with terminal-status payload; sentinel write is idempotent. | closed |
| T-09-06-05 | Repudiation | resume past cancel | mitigate | Resume refuses `manifest.status='cancelled'` with `operator-cancelled-terminal`; admission contract pins behavior. | closed |
| T-09-07-01 | Tampering | resume past operator cancel | mitigate | Resume exits conflict for cancelled runs and leaves cancel sentinel intact. | closed |
| T-09-07-02 | Tampering / Repudiation | tampered journal.jsonl | accept | Resume intentionally trusts the Phase 4 append-only journal model; documented in accepted risks log. | closed |
| T-09-07-03 | DoS | transient cancel sentinel blocks resume | mitigate | Resume unlinks transient `CANCEL` when manifest is not cancelled, then proceeds fail-closed. | closed |
| T-09-07-04 | Information Disclosure | resume progress on stdout | mitigate | Resume routes progress to stderr and data/error payloads through canonical stdout JSON. | closed |
| T-09-08-01 | Elevation of Privilege | tampered authorization.json | mitigate | `reAuthorizeFromPayload` re-reads review decision and rechecks pass/pass gate state. | closed |
| T-09-08-02 | Tampering | torn authorization.json write | mitigate | Main run-loop writes delivery authorization payload with atomic JSON helper. | closed |
| T-09-08-03 | Tampering | mode override bypassing config | accept | CLI-over-config precedence is explicit operator authority; documented in accepted risks log. | closed |
| T-09-09-01 | Elevation of Privilege | bypass validator | mitigate | Deliver command imports and uses `reAuthorizeFromPayload`; test asserts no direct `mintDeliveryAuthorization` import. | closed |
| T-09-09-02 | Tampering | tampered authorization.json | mitigate | Deliver command loads persisted payload as untrusted input; review reauthorization rejects mismatches and non-pass gates. | closed |
| T-09-09-03 | Replay | re-deliver completed run | mitigate | Completed runs with existing delivery result return noop with existing PR URL. | closed |
| T-09-09-04 | Repudiation | partial delivery state | mitigate | Delivery retry honors durable result artifacts and does not duplicate completed delivery. | closed |
| T-09-10-01 | Denial of Service | accidental active-run deletion | mitigate | Prune protects active statuses and reports protected rows. | closed |
| T-09-10-02 | Tampering | delete append-only lineage/refusals | mitigate | Prune removes only `runs/<id>` subtrees; tests assert JSONL hashes remain byte-identical. | closed |
| T-09-10-03 | DoS | accidental wholesale delete | mitigate | Prune defaults to dry-run and requires `--confirm` to delete. | closed |
| T-09-10-04 | Repudiation | deleted live run dispute | mitigate | Prune emits candidates and protected rows, including active-status reasons, in stdout JSON. | closed |
| T-09-11-01 | Tampering | silent CLI surface regression | mitigate | Admission-e2e snapshots pin help, exit codes, stdout schema, inspect schema, resume matrix, and delivery reauthorization. | closed |
| T-09-11-02 | Information Disclosure | help exposes internal paths | mitigate | Help fixtures were manually inspected during creation and snapshot-tested; no PII expected. | closed |
| T-09-11-03 | Tampering | commander drift changes help | mitigate | Commander is pinned to exact `14.0.3`; help fixture drift fails contract tests. | closed |

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-09-01 | T-09-03-02 | `FactoryRunStatus` widening is additive; historical manifests will not contain new values, and TypeScript unions make new handling explicit. | Phase 9 plan | 2026-04-28 |
| R-09-02 | T-09-04-04 | v0.1 run directory scale is bounded to low thousands; revisit if dogfood usage saturates the operator surface. | Phase 9 plan | 2026-04-28 |
| R-09-03 | T-09-06-03 | `cancelling -> completed` is allowed if the run loop completes before observing the sentinel; the behavior is documented in help and source comments. | Phase 9 plan | 2026-04-28 |
| R-09-04 | T-09-07-02 | Resume uses the Phase 4 journal authority instead of inventing a second journal trust model. | Phase 9 plan | 2026-04-28 |
| R-09-05 | T-09-08-03 | CLI override precedence is operator-owned authority, not a config bypass, and is documented as CLI > config > default. | Phase 9 plan | 2026-04-28 |

## Evidence

| Evidence | Result |
|----------|--------|
| `pnpm --filter @protostar/factory-cli test -- --test-name-pattern 'runId|io|status|inspect|cancel|resume|deliver|prune|liveness'` | PASS - 319 tests |
| `pnpm --filter @protostar/admission-e2e test -- --test-name-pattern 'FactoryRunStatus|stdout|status row|inspect schema|resume stage|delivery reauthorize|help|exit code|no-merge'` | PASS - 124 tests |
| `pnpm --filter @protostar/review test -- --test-name-pattern 'delivery authorization|reAuthorizeFromPayload'` | PASS - 69 tests |

Key implementation evidence:

- `apps/factory-cli/src/run-id.ts` validates run IDs and enforces runs-root confinement.
- `apps/factory-cli/src/io.ts` writes canonical stdout JSON and stderr diagnostics.
- `apps/factory-cli/src/commands/status.ts`, `inspect.ts`, `cancel.ts`, `resume.ts`, `deliver.ts`, and `prune.ts` implement the Phase 9 command boundaries.
- `apps/factory-cli/src/run-liveness.ts` derives orphaned status for stale running manifests.
- `packages/review/src/delivery-authorization.ts` re-mints delivery authorization only after re-reading strict pass/pass review evidence.
- `packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts` and `packages/delivery-runtime/src/no-merge.contract.test.ts` enforce zero merge authority surfaces.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-28 | 38 | 38 | 0 | Codex |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

Approval: verified 2026-04-28
