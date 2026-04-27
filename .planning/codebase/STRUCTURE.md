# Codebase Structure

**Analysis Date:** 2026-04-26

## Directory Layout

```
protostar/
├── apps/
│   └── factory-cli/                # Operator surface and composition smoke path
│       ├── src/
│       │   ├── main.ts             # CLI entry, runFactory composition
│       │   ├── main.test.ts        # End-to-end composition smoke tests
│       │   ├── confirmed-intent-handoff.ts
│       │   └── confirmed-intent-handoff.contract.ts
│       ├── package.json            # bin: protostar-factory
│       └── tsconfig.json
├── packages/
│   ├── intent/                     # Draft, ambiguity, AC normalization, ConfirmedIntent
│   ├── policy/                     # Admission, archetypes, capability envelope, policy artifacts
│   ├── planning/                   # Plan DAG schema + planning admission + AdmittedPlan
│   ├── execution/                  # ExecutionRunPlan, dry-run, lifecycle events
│   ├── review/                     # Mechanical review gate + repair loop
│   ├── evaluation/                 # Mechanical/Semantic/Consensus eval + evolution
│   ├── delivery/                   # GitHub PR delivery plan
│   ├── artifacts/                  # FactoryRunManifest, StageRecord, StageArtifactRef
│   ├── repo/                       # WorkspaceRef, RepoChangeSet contracts
│   └── dogpile-adapter/            # Pile presets over @dogpile/sdk (no authority)
├── examples/
│   ├── intents/                    # Sample IntentDraft / ConfirmedIntent fixtures
│   │   ├── greenfield/
│   │   └── brownfield/
│   └── planning-results/           # Deterministic planning-pile-result fixtures
├── .protostar/
│   └── runs/<runId>/               # Durable run bundles produced by `pnpm run factory`
├── .planning/codebase/             # GSD codebase-map output (this directory)
├── .ouroboros/                     # Ouroboros workflow state
├── .claude/                        # Claude Code settings
├── AGENTS.md                       # Authority boundary + package-boundary rules
├── CLAUDE.md                       # Ouroboros workflow guide for Claude
├── README.md                       # Factory shape, spine, run instructions
├── package.json                    # Workspace root, scripts (build/typecheck/verify/factory)
├── pnpm-workspace.yaml             # apps/* + packages/*
├── pnpm-lock.yaml
├── tsconfig.base.json              # Strict ESM/NodeNext + path aliases
└── tsconfig.json                   # Project references for tsc -b
```

## Directory Purposes

**`apps/factory-cli/`:**
- Purpose: The only composition root. Every cross-stage wiring lives here.
- Contains: CLI parser, `runFactory`, run-bundle writers, smoke tests.
- Key files: `apps/factory-cli/src/main.ts`, `apps/factory-cli/src/confirmed-intent-handoff.ts`.

**`packages/intent/`:**
- Purpose: All intent-domain types and admission helpers up to (and including) `ConfirmedIntent`.
- Contains: draft validation, ambiguity scoring, acceptance-criteria normalization, capability-envelope structure, clarification questions/report, ConfirmedIntent assertion. Multiple subpath exports (`./draft`, `./ambiguity`, `./acceptance-criteria`, `./clarification-report`, `./confirmed-intent`).
- Key files: `packages/intent/src/index.ts`, `models.ts`, `confirmed-intent.ts`, `ambiguity-scoring.ts`, `clarification.ts`, `draft-validation.ts`, `capability-envelope.ts`, `acceptance-criteria.ts`.

**`packages/policy/`:**
- Purpose: Autonomy policy, archetype tables, draft admission gate, capability admission, repo-scope admission, admission-decision artifact.
- Contains: `archetypes.ts`, `admission.ts`, `admission-contracts.ts`, `admission-paths.ts`, `archetype-autotag.ts`, `capability-admission.ts`, `capability-grant-admission.ts`, `capability-normalization.ts`, `repo-scope-admission.ts`. Subpath exports `./admission`, `./archetypes`, `./capability-envelope`, `./artifacts`.
- Key files: `packages/policy/src/admission.ts`, `packages/policy/src/artifacts/index.ts`.

**`packages/planning/`:**
- Purpose: PlanGraph schema, candidate-plan parsing, planning admission, AdmittedPlan handoff artifact.
- Contains: `schema/index.ts` (CandidatePlanGraph parsing), `artifacts/index.ts` (AdmittedPlan + planning admission artifact), per-rule contracts (`plan-task-coverage`, `task-required-capabilities`, `task-risk-declaration`, etc.) and matching `*.test.ts` files.
- Key files: `packages/planning/src/index.ts`, `packages/planning/src/artifacts/index.ts`, `packages/planning/src/schema/index.ts`.

**`packages/execution/`:**
- Purpose: ExecutionRunPlan, deterministic dry run, lifecycle events, evidence refs, admitted-plan input contract.
- Key files: `packages/execution/src/index.ts`, `packages/execution/src/admitted-plan-input.contract.ts`.

**`packages/review/`:**
- Purpose: Mechanical review gate, review-execute-review repair loop, review verdicts and findings.
- Key files: `packages/review/src/index.ts`, `packages/review/src/admitted-plan-input.contract.ts`.

**`packages/evaluation/`:**
- Purpose: Three-stage evaluation report stub and ontology-similarity evolution decision.
- Key files: `packages/evaluation/src/index.ts`.

**`packages/delivery/`:**
- Purpose: GitHub PR delivery plan and PR body for approved runs (does not call GitHub yet).
- Key files: `packages/delivery/src/index.ts`.

**`packages/artifacts/`:**
- Purpose: Run manifest schema, stage records, artifact refs, run-status transitions.
- Key files: `packages/artifacts/src/index.ts`.

**`packages/repo/`:**
- Purpose: Workspace and repo-changeset contracts. The only place workspace authority lives outside the CLI.
- Key files: `packages/repo/src/index.ts`.

**`packages/dogpile-adapter/`:**
- Purpose: Bounded Dogpile pile presets and re-exports of planning candidate parsers. NO filesystem authority.
- Key files: `packages/dogpile-adapter/src/index.ts`, `packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts`.

**`examples/intents/`:**
- Purpose: Sample `IntentDraft`/`ConfirmedIntent` fixtures used by the CLI and tests. Includes greenfield/brownfield subdirectories and intentionally-bad fixtures for admission tests.

**`examples/planning-results/`:**
- Purpose: Deterministic stand-ins for live Dogpile planning runs. `scaffold.json` is the default fixture for `pnpm run factory`; `bad-*` fixtures exercise admission failure paths.

**`.protostar/runs/<runId>/`:**
- Purpose: Generated. Per-run durable bundle of every stage artifact (`intent.json`, `plan.json`, `manifest.json`, `execution-*.json`, `review-*.json`, `evaluation-report.json`, `evolution-decision.json`, `delivery-plan.json`, `delivery/pr-body.md`, `execution-evidence/*.json`).

## Key File Locations

**Entry Points:**
- `apps/factory-cli/src/main.ts` — CLI + `runFactory` composition.
- Bin: `protostar-factory` → `apps/factory-cli/dist/main.js` (per `apps/factory-cli/package.json`).

**Configuration:**
- `package.json` — workspace root scripts (`build`, `typecheck`, `verify`, `factory`).
- `pnpm-workspace.yaml` — `apps/*`, `packages/*`.
- `tsconfig.base.json` — strict ESM/NodeNext, path aliases for every public/subpath export.
- `tsconfig.json` — project references for `tsc -b`.
- `AGENTS.md` — authority boundary and package-boundary rules.
- `CLAUDE.md` — Ouroboros workflow guidance.

**Core Logic:**
- `apps/factory-cli/src/main.ts` — spine composition.
- `packages/intent/src/confirmed-intent.ts` — ConfirmedIntent admission.
- `packages/policy/src/admission.ts` — draft promotion + autonomy verdict.
- `packages/planning/src/artifacts/index.ts` — planning admission + AdmittedPlan handoff.
- `packages/execution/src/index.ts` — dry-run execution.
- `packages/review/src/index.ts` — mechanical review loop.

**Testing:**
- Per-package tests live next to source as `*.test.ts` and `*.contract.test.ts` and run via `node --test dist/*.test.js` after build (each package's `test` script). Composition smoke test: `apps/factory-cli/src/main.test.ts`.

## Naming Conventions

**Files:**
- Source files: kebab-case `.ts` (e.g. `confirmed-intent-handoff.ts`, `capability-grant-admission.ts`).
- Tests: kebab-case ending in `.test.ts` (e.g. `acceptance-criteria-normalization.test.ts`).
- Type-only contracts: `*.contract.ts` (compile-time assertions, e.g. `confirmed-intent-readonly.contract.ts`, `confirmed-intent-handoff.contract.ts`).
- Runtime contract tests: `*.contract.test.ts` (e.g. `public-split-exports.contract.test.ts`).
- Test fixtures: `*.fixtures.ts` and `*.test-support.ts` (e.g. `brownfield-ambiguity.fixtures.ts`, `example-intent-fixtures.test-support.ts`).
- Subpath barrels: `<subpath>/index.ts` (e.g. `packages/intent/src/ambiguity/index.ts`).

**Directories:**
- Workspaces: kebab-case (`factory-cli`, `dogpile-adapter`).
- Subpath modules inside a package: kebab-case (`acceptance-criteria/`, `capability-envelope/`, `clarification-report/`, `confirmed-intent/`, `admission/`, `archetypes/`).

**Packages:**
- Scope: `@protostar/<domain>` (e.g. `@protostar/intent`, `@protostar/policy`).
- Subpath imports: `@protostar/<pkg>/<subpath>` (e.g. `@protostar/intent/confirmed-intent`, `@protostar/policy/artifacts`).

**Identifiers:**
- Constants: `SCREAMING_SNAKE_CASE` (e.g. `INTENT_AMBIGUITY_THRESHOLD`, `PLANNING_ADMISSION_ARTIFACT_NAME`, `ONTOLOGY_CONVERGENCE_THRESHOLD`).
- Types/Interfaces: PascalCase (`ConfirmedIntent`, `AdmittedPlan`, `ReviewGate`, `FactoryRunManifest`).
- Functions: camelCase (`runFactory`, `admitCandidatePlan`, `createConfirmedIntentHandoff`).
- Run IDs: `run_YYYYMMDDHHMMSS_<intent_or_draft_suffix>` (see `createRunId` / `createDraftRunId` in `apps/factory-cli/src/main.ts:936-947`).
- Plan task IDs: branded `task-${string}` (`PlanTaskId` in `packages/planning/src/index.ts`).

## Where to Add New Code

**New stage helper that consumes `ConfirmedIntent`:**
- Primary code: inside the owning stage package (`packages/<stage>/src/<feature>.ts`).
- Public surface: re-export from `packages/<stage>/src/index.ts`. If the surface is large, add a new subpath export in the package's `package.json` AND add a matching `paths` entry in `tsconfig.base.json`.
- Tests: `packages/<stage>/src/<feature>.test.ts` (and `.contract.test.ts` for type-shape guarantees).

**New CLI flag or composition step:**
- Implementation: `apps/factory-cli/src/main.ts` (extend `RunCommandOptions`, `parseFlags`, `parseArgs`, `runFactory`).
- Default behavior: keep dependency injection via `FactoryCompositionDependencies` so tests can override.
- Tests: `apps/factory-cli/src/main.test.ts`.

**New durable artifact in the run bundle:**
- Schema/types: in the owning stage package (e.g. add a new artifact type in `packages/<stage>/src/artifacts/index.ts`).
- Manifest entry: extend the relevant stage block in `runFactory`'s `finalManifest` reducer (`apps/factory-cli/src/main.ts:338-448`) and the `artifacts:` array in `RunCommandResult`.
- Writer: add a `writeJson(...)` call inside `runFactory`'s persistence section (`apps/factory-cli/src/main.ts:451-484`).

**New policy / admission rule:**
- Implementation: `packages/policy/src/<rule>.ts` (capability rules in `capability-*.ts`, repo scope in `repo-scope-admission.ts`, archetype/autotag in `archetype-*.ts`).
- Contracts: types in `packages/policy/src/admission-contracts.ts`.
- Tests: `packages/policy/src/<rule>.test.ts`. For draft fixtures, prefer `example-intent-fixtures.test-support.ts`.

**New Dogpile pile preset:**
- Implementation: `packages/dogpile-adapter/src/index.ts` only. Do NOT add filesystem I/O. If you need to parse pile output into a typed candidate, expose the parser from the owning stage package (e.g. `@protostar/planning`) and re-export.

**New planning fixture (good or bad):**
- File: `examples/planning-results/<name>.json`.
- Drive it from a test or from the CLI via `--planning-fixture <path>`.

**New intent example:**
- File: `examples/intents/<name>.json` (confirmed) or `examples/intents/<name>.draft.json` (draft); place greenfield/brownfield variants under `examples/intents/<mode>/`.

**Shared workspace primitive:**
- Place in `packages/repo/src/index.ts` if it's about workspaces, or in `packages/artifacts/src/index.ts` if it's about run/stage records. Do NOT create a generic `utils` package.

## Special Directories

**`.protostar/runs/`:**
- Purpose: Durable run bundles produced by `pnpm run factory` / `protostar-factory run`.
- Generated: Yes.
- Committed: No (covered by `.gitignore`).

**`.ouroboros/`:**
- Purpose: Ouroboros workflow state (sessions, evaluations).
- Generated: Yes (by `ooo` commands).
- Committed: No.

**`.planning/codebase/`:**
- Purpose: GSD codebase-map output (this directory).
- Generated: By `/gsd-map-codebase`.
- Committed: Yes (project-tracked context for downstream GSD commands).

**`.claude/`:**
- Purpose: Claude Code project settings.
- Generated: Manually.
- Committed: Project-specific.

**`dist/` (per-package):**
- Purpose: TypeScript build output. Required because tests run via `node --test dist/*.test.js`.
- Generated: Yes (`pnpm run build` → `tsc -b`).
- Committed: No.

**`node_modules/`:**
- Purpose: pnpm-managed dependencies.
- Generated: Yes (`pnpm install`).
- Committed: No.

---

*Structure analysis: 2026-04-26*
