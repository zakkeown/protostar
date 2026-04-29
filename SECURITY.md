# Security Policy

Protostar is a dark software factory control plane that can mutate real GitHub
repositories. This document describes the v0.1 trust posture and how to report
vulnerabilities.

## Trust Assumptions

- The factory operator authors and confirms intent. After confirmation, autonomy
  is governed by capability envelopes, policy, and stop gates documented in
  `packages/policy/`.
- Filesystem authority lives only in `apps/factory-cli` and `packages/repo`.
  The `@protostar/paths` package has a narrow path-resolution carve-out; see
  [AGENTS.md](./AGENTS.md).
- Network authority lives only in `packages/dogpile-adapter` for local LM Studio
  coordination, `packages/delivery-runtime` for GitHub delivery, and the
  explicitly selected hosted execution adapter for OpenAI-compatible endpoints.
- All other domain packages are pure: no filesystem authority and no network
  authority.

## Capability Envelope

Every confirmed intent carries a typed `capabilityEnvelope`; see
`packages/intent/src/capability-envelope.ts`. The envelope bounds repository
scopes, tool permissions, write budgets, network hosts, and repair-loop counts.
Authority decisions intersect the envelope with policy through the
`PrecedenceDecision` brand in `packages/authority/`.

## Secret Handling

- GitHub tokens are read from the environment at delivery time and must never be
  logged. Phase 7 added redaction for delivery-runtime failures.
- LM Studio is local-only in v0.1; no cloud LLM credentials are required.
- Hosted execution reads `PROTOSTAR_HOSTED_LLM_API_KEY` from the environment
  only. Values must never be logged, written to run bundles, stress
  `events.jsonl`, stress reports, or refusal evidence.
- The dogfood fine-grained PAT is scoped to the single toy repository
  `zakkeown/protostar-toy-ttt`.
- Refusal and evidence logs should contain redacted failure context, not raw
  secret values.

## Reporting

Email zak.keown@outlook.com with subject `[protostar-security]`. Please do not
open public issues for unpatched vulnerabilities.

## Supported Versions

The most recent `0.1.x` release on npm is the supported line. Prior versions are
not patched.
