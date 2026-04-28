# Protostar Factory Agent Guide

This repo is a dark software factory control plane. Keep the authority boundary explicit:

- Protostar owns lifecycle, policy, repository access, durable artifacts, verification, repair loops, and release gates.
- Dogpile is a bounded coordination cell for planning, review, and execution coordination. Do not make Dogpile the factory authority boundary.
- Human input is required to confirm intent. After confirmation, autonomy is governed by policy, capability envelopes, budgets, and stop gates.

## Package Boundaries

- `packages/intent`: confirmed intent, acceptance criteria, capability envelope.
- `packages/planning`: plan DAGs and plan validation.
- `packages/execution`: execution run plans and task status contracts.
- `packages/review`: review gates, findings, and pass/repair/block verdicts.
- `packages/policy`: autonomy policy and escalation decisions.
- `packages/artifacts`: run manifests, stages, and durable artifact references.
- `packages/repo`: workspace and repository access contracts.
- `packages/dogpile-adapter`: Dogpile presets only. No filesystem authority here.
- `apps/factory-cli`: operator surface and composition smoke path.

## Authority Tiers

- **fs-permitted, network-permitted (orchestration tier):** `apps/factory-cli`
- **fs-permitted, network-forbidden (filesystem tier):** `packages/repo`, `@protostar/paths` (scope-ceiled carve-out)
- **network-permitted, fs-forbidden (domain network tier):** `@protostar/dogpile-adapter` (Phase 6), `@protostar/delivery-runtime` (Phase 7)
- **pure (everything else):** all other packages. No filesystem, no network.

Filesystem authority is always `apps/factory-cli` plus `packages/repo`; network may live in domain packages with explicit no-fs contract tests. Each network-permitted package MUST contain a static `no-fs.contract.test.ts` that scans its `src/` for `node:fs` / `node:fs/promises` / `node:path` / `path` imports and asserts zero matches.

Phase 7 also requires `@protostar/delivery-runtime` to ship a `no-merge.contract.test.ts` enforcing zero `pulls.merge` / `pullRequests.merge` / `enableAutoMerge` / `merge_method` / `pulls.updateBranch` / `gh pr merge` / `git merge --` references in source. This is the strongest invariant in the phase (DELIVER-07).

## Development Rules

- Keep packages domain-first. Avoid generic `utils`, `agents`, or catch-all factory packages.
- Stage contracts should pass durable data forward; do not let later stages reach into private state from earlier stages.
- Side effects belong behind `repo`, `execution`, or caller-owned tool adapters, not in planning or review contracts.
- Run `pnpm run verify` before handing work back.
- Run `pnpm run factory` after changing stage composition or package exports.

## @protostar/paths Carve-Out (added 2026-04-27, Phase 3 Q-15)

AGENTS.md "domain-first only - avoid generic utils/agents/factory packages"
rule has one user-locked exception: `@protostar/paths`.

**Scope ceiling - path resolution only.** Permitted contents:
- Deterministic walks from a starting directory to a sentinel file
  (`pnpm-workspace.yaml`, future: `.git`, etc. only with explicit lock-revision).
- Pure-compute path manipulation (`node:path` `resolve` / `relative` / `dirname`).

**Forbidden:**
- I/O beyond `existsSync` / `statSync` for sentinel detection.
- Business logic (intent, planning, execution, review, evaluation, delivery, repo).
- Networking. Subprocess. JSON parsing. YAML parsing.

If a second consumer needs a path helper that doesn't fit the ceiling, split
`@protostar/paths` rather than expand it. The carve-out is one exception, not
a precedent for more.
