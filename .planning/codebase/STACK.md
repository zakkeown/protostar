# Technology Stack

**Analysis Date:** 2026-04-26

## Languages

**Primary:**
- TypeScript ^6.0.3 — All packages and the CLI app

**Secondary:**
- JSON — Stage artifacts, fixtures (`examples/intents/*.json`, `examples/planning-results/*.json`), tsconfig
- Markdown — Documentation, generated PR bodies (`delivery/pr-body.md`)

## Runtime

**Environment:**
- Node.js >=22 (declared in root `package.json` `engines.node`)
- ECMAScript target: ES2022 (`tsconfig.base.json`)
- Module system: ESM (`"type": "module"` in every package; `module: "NodeNext"`)

**Package Manager:**
- pnpm 10.33.0 (pinned via `packageManager` in root `package.json`)
- Workspace defined in `pnpm-workspace.yaml` (`apps/*`, `packages/*`)
- Lockfile: `pnpm-lock.yaml` (lockfileVersion 9.0) — present and committed

## Frameworks

**Core:**
- No application framework. The CLI in `apps/factory-cli/src/main.ts` is a pure Node.js command-line program built on `node:fs/promises`, `node:path`, `node:url`, and `node:child_process` standard modules.

**Testing:**
- `node:test` (Node.js built-in test runner) — used by every package with a `test` script (`packages/intent`, `packages/planning`, `packages/policy`, `packages/review`, `packages/execution`, `packages/dogpile-adapter`, `apps/factory-cli`)
- `node:assert/strict` for assertions
- Pattern: `pnpm run build && node --test dist/*.test.js` (tests run against compiled output)

**Build/Dev:**
- TypeScript 6.0.3 compiler (`tsc -b`) — project-references build, no bundler
- Composite TypeScript projects orchestrated from root `tsconfig.json` (references each package and `apps/factory-cli`)

## Key Dependencies

**Workspace (internal):**
- `@protostar/artifacts` — run manifests, stage records, artifact refs
- `@protostar/intent` — drafts, ambiguity, acceptance criteria, clarification report, confirmed intent (subpath exports: `/draft`, `/ambiguity`, `/acceptance-criteria`, `/clarification-report`, `/confirmed-intent`)
- `@protostar/policy` — admission, archetypes, capability envelope, artifacts (subpath exports: `/admission`, `/archetypes`, `/capability-envelope`, `/artifacts`)
- `@protostar/planning` — plan DAG schema and artifacts (subpath exports: `/schema`, `/artifacts`)
- `@protostar/execution` — execution run plans, dry-run executor
- `@protostar/review` — mechanical review gate
- `@protostar/evaluation` — evaluation report and evolution decision
- `@protostar/delivery` — GitHub PR delivery plan generator
- `@protostar/repo` — workspace/repo boundary contracts
- `@protostar/dogpile-adapter` — Dogpile pile presets

**External (production):**
- `@dogpile/sdk` — linked via `link:../../../dogpile` (sibling checkout, NOT a published npm package). Used only in `packages/dogpile-adapter/src/index.ts` (`budget`, `convergence`, `firstOf`, `AgentSpec`, `DogpileOptions`).

**Critical (dev):**
- `typescript` ^6.0.3 — only root devDependency besides types
- `@types/node` ^22.19.17 — Node 22 typings (transitively pulls `undici-types` 6.21.0)

**Notable:** Zero external runtime dependencies inside `node_modules` other than the linked sibling Dogpile SDK. The factory is intentionally dependency-light; all runtime behavior uses Node standard library.

## Configuration

**TypeScript (`tsconfig.base.json`):**
- `target: ES2022`, `lib: [ES2022, DOM]`
- `module: NodeNext`, `moduleResolution: NodeNext`
- Strict mode on, plus `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `forceConsistentCasingInFileNames: true`
- Declarations + sourcemaps emitted (`declaration`, `declarationMap`, `sourceMap`)
- `paths` aliases for every workspace package and subpath, pointing at `src/index.ts` for editor resolution

**Root `tsconfig.json`:**
- Solution-style: `files: []`, `references` to all 10 packages and `apps/factory-cli`

**Per-package `tsconfig.json`:**
- Each package compiles to `dist/` and is consumed via `main: ./dist/index.js`, `types: ./dist/index.d.ts`, with `exports` map for ESM
- All packages declare `sideEffects: false`

**Environment:**
- No `.env` files present. `.gitignore` reserves `.env`, `.env.*` (allows `.env.example`) but no example file exists yet.
- No environment variables are read by current code (CLI takes only flags).

**Build:**
- `pnpm run build` → `tsc -b` (full workspace)
- `pnpm run typecheck` → `tsc -b --pretty false`
- `pnpm run verify` → typecheck + intent tests + factory-cli tests
- `pnpm run factory` → build then runs `@protostar/factory-cli start -- run --draft examples/intents/scaffold.draft.json --out .protostar/runs`

## Platform Requirements

**Development:**
- Node.js >= 22
- pnpm 10.33.0
- Sibling checkout of Dogpile at `../dogpile` (relative to repo root) — required for `@protostar/dogpile-adapter` to install/link
- macOS/Linux assumed (no Windows-specific code; uses POSIX paths in scripts)

**Production:**
- Not applicable — the factory currently runs locally as a CLI. There is no deploy target. Output is written to `.protostar/runs/<runId>/` on the local filesystem.

---

*Stack analysis: 2026-04-26*
