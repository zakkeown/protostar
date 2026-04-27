# Coding Conventions

**Analysis Date:** 2026-04-26

## Module System

- **`type: "module"`** at every workspace root (`package.json`, `packages/*/package.json`, `apps/*/package.json`).
- **Pure ESM.** All relative imports include the `.js` extension even from `.ts` source (NodeNext resolution): `import { foo } from "./bar.js";`.
- **Cross-package imports use `@protostar/*` aliases** declared in `tsconfig.base.json` `paths`. Do not relative-traverse across packages.
- **Subpath exports** are declared per package (e.g. `@protostar/intent/draft`, `@protostar/policy/admission`). Public split exports are pinned by `*.contract.test.ts` files (e.g. `packages/intent/src/public-split-exports.contract.test.ts`).

## TypeScript Configuration (`tsconfig.base.json`)

- `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`.
- **Strict mode on, with extras:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `forceConsistentCasingInFileNames`.
- `composite: true` per package; root `tsconfig.json` is a project-references aggregator (`tsc -b`).
- Per-package convention: `rootDir: src`, `outDir: dist`, `types: ["node"]`, `include: ["src/**/*.ts"]`.

## Naming Patterns

**Files (`packages/*/src/`):**
- `kebab-case.ts` for all source files.
- Test files: `<unit-under-test>.test.ts` co-located next to source (e.g. `ambiguity-scoring.ts` ↔ `intent-ambiguity-scoring.test.ts`).
- Type-level shape pinning: `<topic>.contract.ts` (e.g. `packages/intent/src/intent-ambiguity.contract.ts`).
- Contract tests that pin runtime/public surface: `<topic>.contract.test.ts` (e.g. `packages/intent/src/public-split-exports.contract.test.ts`).
- Reusable test data: `<topic>.fixtures.ts` (e.g. `packages/intent/src/greenfield-ambiguity.fixtures.ts`).
- Cross-test helpers: `<topic>.test-support.ts` (e.g. `packages/policy/src/example-intent-fixtures.test-support.ts`).

**Identifiers:**
- Functions: `camelCase`, verb-first, intent-specific (`scoreConstraintsAmbiguity`, `assessIntentAmbiguity`, `promoteIntentDraft`, `validateCapabilityEnvelopeRepairLoopCount`).
- Types/interfaces: `PascalCase` (`IntentAmbiguityAssessment`, `IntentDraftCapabilityEnvelope`).
- Constants: `SCREAMING_SNAKE_CASE` for module-level frozen tables (`INTENT_AMBIGUITY_DIMENSION_WEIGHTS`, `CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS`, `AMBIGUOUS_REPOSITORY_WORKSPACE_VALUES`).
- Discriminated string unions are written as inline literal types (`"greenfield" | "brownfield"`), not enums.
- Type-template ids: backtick template literal types (`` `${IntentAmbiguityMode}-v1` ``).

**Packages:**
- Domain-first names. AGENTS.md mandates: avoid `utils`, `agents`, generic catch-alls. Each package owns one concept (`intent`, `planning`, `policy`, `execution`, `review`, `delivery`, `evaluation`, `repo`, `artifacts`, `dogpile-adapter`).

## Code Style

**Formatting:**
- No `.prettierrc`, `.editorconfig`, ESLint, or Biome config in repo. Style is enforced by convention + `tsc --strict`, not tooling.
- 2-space indentation throughout.
- Double quotes for all string literals.
- Trailing semicolons.
- Trailing commas omitted on the last element (e.g. final array entry, final object key).
- Long argument objects are line-broken one property per line.

**Linting:** None configured. The bar is "`pnpm run verify` (typecheck + targeted tests) passes."

## Import Organization

Observed pattern (e.g. `packages/intent/src/intent-ambiguity-scoring.test.ts`, `packages/policy/src/admission-control.test.ts`):

1. Node built-ins with `node:` prefix: `import assert from "node:assert/strict";`, `import { describe, it } from "node:test";`.
2. Blank line.
3. Cross-package `@protostar/*` imports, grouped by package.
4. Blank line.
5. Local `./` imports (always `.js` extension).
6. `import type { ... }` is preferred for type-only; mixed value+type imports inline `type` modifier per identifier (e.g. `import { foo, type Bar } from "./baz.js";`).

**Path aliases:** Defined only in `tsconfig.base.json` `paths`. There is no runtime resolver — production resolution relies on workspace `package.json` `exports` maps + pnpm `workspace:*` deps.

## Public API Discipline

- Every package's public surface is the `src/index.ts` barrel and any subpath barrels (`src/<area>/index.ts`).
- Barrels split exports into a `export { value, ... }` line followed by a separate `export type { Type, ... }` line.
- Subpath exports are mirrored 1:1 between `tsconfig.base.json` `paths` and per-package `package.json` `exports`.
- Surface drift is caught by `*public-split-exports.contract.test.ts` and shape contracts in `*.contract.ts` (compile-time `Assert<KeysEqual<...>>` guards).
- `sideEffects: false` is set on packages with no module-load side effects (e.g. `packages/intent/package.json`).

## Function Design

- **Pure functions are the default.** Scoring, validation, normalization, and admission helpers in `packages/intent`, `packages/policy`, and `packages/planning` are all pure: input → derived output, no I/O.
- **Side effects are isolated** to `apps/factory-cli` (CLI entry, fs, child_process) and the `repo`/`execution` adapters per `AGENTS.md`. Planning, intent, policy, review must remain pure.
- **Single object parameter** for functions with >1 logical input (`ScoreIntentAmbiguityDimensionInput`, `CreateClarificationReportInput`). Read-only via `readonly` on every field.
- Exported functions are typed at the boundary with explicit return types; locals rely on inference.
- Helper functions live in the same file as their consumer until reused; shared primitives go in `shared.ts` per package (e.g. `packages/intent/src/shared.ts` exports `roundScore`, `uniqueOrdered`, `isRecord`, `hasNonEmptyText`).

## Immutability

- **`readonly` everywhere on data shapes.** Every interface/type field uses `readonly`; arrays use `readonly T[]`.
- Constant tables use `as const satisfies Readonly<Record<...>>` to lock keys, value identity, and conform to the contract type. Example (`packages/intent/src/ambiguity-scoring.ts:42`):
  ```ts
  export const INTENT_AMBIGUITY_WEIGHTING_PROFILES = {
    greenfield: { id: "greenfield-v1", mode: "greenfield", ... },
    brownfield: { ... }
  } as const satisfies Readonly<Record<IntentAmbiguityMode, IntentAmbiguityWeightingProfile>>;
  ```
- A repo-wide `DeepReadonly` utility is exported from `@protostar/intent` for confirmed-intent data.

## Error Handling

- **Validation returns reports, doesn't throw.** Functions like `evaluateIntentDraftCompleteness`, `validateCapabilityEnvelopeRepairLoopCount`, `assessIntentAmbiguity` return discriminated result objects with `accepted`/`errors`/`missingFields`/`requiredClarifications` arrays.
- **Asserter helpers** (`assertIntentAmbiguityAccepted`, `assertConfirmedIntent`) wrap pure validators and `throw new Error(message)` only on the boundary when the caller wants a hard fail. Error messages concatenate human-readable sentences with `.` separators.
- **No custom Error subclasses observed.** Plain `Error` only.
- Parsing helpers return `{ ok, value, errors }`-shaped result records (e.g. `parseConfirmedIntent → ConfirmedIntentParseResult`) instead of nullable returns.
- `errors: string[]` is threaded as a mutable accumulator into low-level readers (`readString`, `readOptionalString` in `packages/intent/src/shared.ts:50`).

## Logging

- No logging framework. The CLI (`apps/factory-cli`) writes to stdout/stderr; library packages emit no logs.

## Determinism Conventions

- All numeric scores are rounded through `roundScore` (`Math.round(value * 1000) / 1000`, clamped to `[0, 1]`) so test assertions can use exact equality (`assert.equal(...0.298)`).
- String hashing uses an explicit FNV-1a in `packages/intent/src/shared.ts:24` (`stableHash`) — not `crypto`-dependent — to keep ids reproducible.
- Set/array dedup uses `uniqueOrdered` to preserve insertion order.
- Regex/lookup tables for "ambiguous"/"concrete" phrases are declared at module scope, frozen by `as const`, and exhaustively unit-tested.

## Comments

- Production code is sparsely commented; meaning is carried by names + types.
- No JSDoc/TSDoc convention. `rationale` strings are embedded as data inside returned signals (e.g. `"Goal ambiguity is estimated from title and problem specificity."`) so they are surface-level artifacts, not source comments.

## Dependency Discipline

- **Zero runtime dependencies in libraries.** Packages depend only on other `@protostar/*` workspace packages (`workspace:*`). Built-in `node:` modules are the only externals.
- **Devdeps live at root only:** `@types/node`, `typescript`. No test runner, no bundler, no transpiler.
- Node engine pinned: `engines.node: ">=22"`.
- Package manager pinned: `packageManager: "pnpm@10.33.0"`.

## Authority Boundary Conventions (`AGENTS.md`)

- Side effects only behind `repo`, `execution`, or caller-owned tool adapters — never inside `planning`, `policy`, `review`, or `intent`.
- Stage contracts pass forward durable data; later stages may not reach into earlier stages' private state.
- Dogpile (`packages/dogpile-adapter`) is a coordination cell only — no filesystem authority.

---

*Convention analysis: 2026-04-26*
