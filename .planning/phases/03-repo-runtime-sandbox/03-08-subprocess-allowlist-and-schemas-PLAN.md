---
phase: 03-repo-runtime-sandbox
plan: 08
type: tdd
wave: 1
depends_on: [01]
files_modified:
  - packages/repo/src/subprocess-allowlist.ts
  - packages/repo/src/subprocess-allowlist.test.ts
  - packages/repo/src/argv-pattern-guard.ts
  - packages/repo/src/argv-pattern-guard.test.ts
  - packages/repo/src/subprocess-schemas/git.ts
  - packages/repo/src/subprocess-schemas/pnpm.ts
  - packages/repo/src/subprocess-schemas/node.ts
  - packages/repo/src/subprocess-schemas/tsc.ts
  - packages/repo/src/subprocess-schemas/index.ts
  - packages/repo/src/subprocess-schemas/schemas.test.ts
autonomous: true
requirements: [REPO-04]
must_haves:
  truths:
    - "Baseline allowlist [git, pnpm, node, tsc] is a deep-frozen const"
    - "intersectAllowlist(policyExt) returns baseline ∪ policy (never removes baseline)"
    - "argv-pattern-guard refuses '-' prefix flags not in allowedFlags; refuses ref-pattern violation"
    - "Per-command schemas (git, pnpm, node, tsc) export {allowedSubcommands, allowedFlags, refValuePattern}"
    - "Forced -- separator before user-controlled values is enforced by guard when schema demands"
  artifacts:
    - path: "packages/repo/src/subprocess-allowlist.ts"
      provides: "Baseline + intersect helper"
      exports: ["SUBPROCESS_BASELINE_ALLOWLIST", "intersectAllowlist"]
    - path: "packages/repo/src/argv-pattern-guard.ts"
      provides: "Outer flag/ref pattern check"
      exports: ["applyOuterPatternGuard", "ArgvViolation"]
    - path: "packages/repo/src/subprocess-schemas/index.ts"
      provides: "Per-command schema barrel"
      exports: ["GIT_SCHEMA", "PNPM_SCHEMA", "NODE_SCHEMA", "TSC_SCHEMA"]
  key_links:
    - from: "packages/repo/src/argv-pattern-guard.ts"
      to: "packages/repo/src/subprocess-schemas/git.ts"
      via: "schema-driven validation"
      pattern: "allowedFlags\\|refValuePattern"
---

<objective>
Build the pure-data + pure-compute half of the subprocess sandbox: baseline allowlist, intersect helper, argv pattern guard, and per-command schemas for git/pnpm/node/tsc. No spawning here — that's Plan 09. This plan is pure validation logic; ideal TDD subject.

Purpose: Q-07 + Q-08 mandate two-layer argv defense. Splitting validation (this plan) from execution (Plan 09) lets the validation be exhaustively tested in isolation, and lets Plan 09 consume the validators without re-deriving them.
Output: Five source files (allowlist, guard, four schemas) + barrel + comprehensive tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/authority/src/repo-policy/parse.ts
@packages/authority/src/authorized-ops/subprocess-op.ts

Q-07 lock: Baseline `[git, pnpm, node, tsc]` in `@protostar/repo`. Repo-policy
`commandAllowlist?: string[]` may extend, never remove.

Q-08 lock: Two layers.
- **Outer pattern guard:** refuse args starting with `-` unless in allowedFlags
  (literal or `--flag=value` form); ref-like args match `[a-zA-Z0-9._/-]+`;
  force `--` separator before user-controlled values.
- **Inner per-command schema:** `{allowedSubcommands, allowedFlags, refValuePattern}`.

PATTERNS.md analogs:
- Frozen-const: `packages/authority/src/repo-policy/parse.ts:155-165` `deepFreeze`.
- Reject-unknown: `parse.ts:138-149` `rejectUnknownKeys`.
- Existing shell-metachar guard: `subprocess-op.ts:30-32` (reuse the regex idiom).

RESEARCH.md Pattern 2 (lines 365-409): full reference impls for guard + git schema.

<interfaces>
```typescript
// subprocess-allowlist.ts
export const SUBPROCESS_BASELINE_ALLOWLIST: readonly string[] =
  Object.freeze(["git", "pnpm", "node", "tsc"]);

/**
 * Baseline ∪ policyExtension. Never removes baseline. De-duped, sorted.
 */
export function intersectAllowlist(policyExtension?: readonly string[]): readonly string[];

// argv-pattern-guard.ts
export class ArgvViolation extends Error {
  constructor(public readonly reason: "flag-not-allowed" | "ref-pattern-violation" | "shell-metachar", message: string) { /* ... */ }
}

export interface OuterGuardSchema {
  readonly allowedFlagPrefixes: readonly string[];   // e.g., ["--depth", "--single-branch"]
  readonly refValuePattern: RegExp;                  // e.g., /^[a-zA-Z0-9._/-]+$/
}

/**
 * Walk argv. Each token must:
 *  - if starts with "-" (and we haven't seen "--"): match an allowed flag prefix exactly OR with =value form
 *  - else: match refValuePattern
 *  - "--" toggles separator-seen mode (post-separator tokens still match refValuePattern)
 *  - shell metachars in any token (` ; & | $ < > \``) → throw shell-metachar
 */
export function applyOuterPatternGuard(argv: readonly string[], schema: OuterGuardSchema): void;

// subprocess-schemas/{git,pnpm,node,tsc}.ts each export:
export interface CommandSchema {
  readonly command: string;                             // e.g., "git"
  readonly allowedSubcommands: readonly string[];       // e.g., ["clone","checkout","branch","status"]
  readonly allowedFlags: Readonly<Record<string, readonly string[]>>; // {clone: ["--depth", ...], ...}
  readonly refValuePattern: RegExp;
}

export const GIT_SCHEMA: CommandSchema;
// ... same for PNPM_SCHEMA, NODE_SCHEMA, TSC_SCHEMA

// subprocess-schemas/index.ts barrel re-exports all four + CommandSchema
```

Schema content guidance (extend per Phase 4-7 actual usage; v1 covers cosmetic-tweak loop):

GIT_SCHEMA:
- subcommands: clone, checkout, branch, status, rev-parse, log
- clone flags: --depth, --single-branch, --branch, --no-tags
- checkout flags: -b, --detach
- branch flags: --list, -D
- status flags: --porcelain, --untracked-files=no
- rev-parse flags: --show-toplevel, --abbrev-ref, HEAD (HEAD is technically a ref, not a flag — handled in outer guard)
- log flags: --oneline, -n
- refValuePattern: `/^[a-zA-Z0-9._/-]+$/`

PNPM_SCHEMA:
- subcommands: install, run, build, test, --filter, exec
- install flags: --frozen-lockfile, --no-frozen-lockfile, --force
- run flags: (none beyond positional script name)
- --filter flags: (no nested flags; takes a positional package selector)
- exec flags: -- (separator before exec-target)
- refValuePattern: `/^[a-zA-Z0-9._/-@]+$/` (allow @ for scoped packages)

NODE_SCHEMA:
- subcommands: (none — `node` takes a script path directly)
- allowedFlags (top-level): --test, --enable-source-maps
- refValuePattern: `/^[a-zA-Z0-9._/-]+$/`
- Note: `node`'s argv shape is unique (no subcommand). Schema layer accepts an
  empty subcommand set and validates `argv[0]` as the script path via refValuePattern.

TSC_SCHEMA:
- subcommands: (none — flag-driven)
- allowedFlags: -b, --build, --noEmit, --pretty
- refValuePattern: `/^[a-zA-Z0-9._/-]+$/`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (RED): Subprocess-allowlist + argv-pattern-guard tests</name>
  <files>packages/repo/src/subprocess-allowlist.test.ts, packages/repo/src/argv-pattern-guard.test.ts</files>
  <behavior>
    **subprocess-allowlist.test.ts** cases:
    - Baseline is exactly `["git","pnpm","node","tsc"]` and frozen.
    - `intersectAllowlist(undefined)` returns baseline.
    - `intersectAllowlist([])` returns baseline.
    - `intersectAllowlist(["cargo"])` returns baseline ∪ `["cargo"]` deduped, sorted.
    - `intersectAllowlist(["git"])` returns baseline (dedup, no growth).
    - Result is frozen / readonly type.

    **argv-pattern-guard.test.ts** cases:
    - Empty argv: no throw.
    - Single positional matching refValuePattern: no throw.
    - Allowed flag bare (`--depth`): no throw.
    - Allowed flag with value form (`--depth=1`): no throw.
    - Disallowed flag (`--upload-pack=bad`): throws ArgvViolation `flag-not-allowed`.
    - Ref-pattern violation positional (`a;b;c`): throws `shell-metachar` (preferred) or `ref-pattern-violation`.
    - Shell metachars in flag value (`--depth=$(rm -rf /)`): throws `shell-metachar`.
    - `--` separator: tokens after still match refValuePattern (positional rules).
    - Token with space (`a b`): throws `shell-metachar`.
  </behavior>
  <action>
    Write both test files. RED commit covering both.
    Verify `pnpm --filter @protostar/repo build` fails because the source files
    don't exist yet.
  </action>
  <verify>
    <automated>! pnpm --filter @protostar/repo build 2&gt;/dev/null</automated>
  </verify>
  <done>Two test files written; build red; RED commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN): Implement allowlist + guard + four schemas + barrel</name>
  <files>packages/repo/src/subprocess-allowlist.ts, packages/repo/src/argv-pattern-guard.ts, packages/repo/src/subprocess-schemas/git.ts, packages/repo/src/subprocess-schemas/pnpm.ts, packages/repo/src/subprocess-schemas/node.ts, packages/repo/src/subprocess-schemas/tsc.ts, packages/repo/src/subprocess-schemas/index.ts</files>
  <action>
    1. `subprocess-allowlist.ts`:
    ```typescript
    export const SUBPROCESS_BASELINE_ALLOWLIST: readonly string[] =
      Object.freeze(["git", "pnpm", "node", "tsc"]);

    export function intersectAllowlist(policyExtension?: readonly string[]): readonly string[] {
      const merged = new Set<string>(SUBPROCESS_BASELINE_ALLOWLIST);
      for (const cmd of policyExtension ?? []) merged.add(cmd);
      return Object.freeze([...merged].sort());
    }
    ```

    2. `argv-pattern-guard.ts`:
    ```typescript
    const SHELL_METACHARS = /[;&|`$<>\\\s]/;  // also catches whitespace

    export class ArgvViolation extends Error {
      constructor(public readonly reason: "flag-not-allowed"|"ref-pattern-violation"|"shell-metachar", message: string) {
        super(message); this.name = "ArgvViolation";
      }
    }

    export interface OuterGuardSchema {
      readonly allowedFlagPrefixes: readonly string[];
      readonly refValuePattern: RegExp;
    }

    export function applyOuterPatternGuard(argv: readonly string[], schema: OuterGuardSchema): void {
      let sawSeparator = false;
      for (const arg of argv) {
        if (SHELL_METACHARS.test(arg)) throw new ArgvViolation("shell-metachar", `arg "${arg}" contains shell metachar or whitespace`);
        if (arg === "--") { sawSeparator = true; continue; }
        if (!sawSeparator && arg.startsWith("-")) {
          const flagBody = arg.split("=")[0];
          if (!schema.allowedFlagPrefixes.includes(flagBody)) {
            throw new ArgvViolation("flag-not-allowed", `flag "${flagBody}" not in allowedFlagPrefixes`);
          }
          continue;
        }
        if (!schema.refValuePattern.test(arg)) {
          throw new ArgvViolation("ref-pattern-violation", `arg "${arg}" does not match refValuePattern`);
        }
      }
    }
    ```

    3. Four schema files per `<interfaces>` content guidance. Each file Object.freeze
    on `allowedSubcommands`, `allowedFlags` (and inner arrays), and the schema
    object itself. RegExp is fine without freeze.

    4. `subprocess-schemas/index.ts`:
    ```typescript
    export { GIT_SCHEMA } from "./git.js";
    export { PNPM_SCHEMA } from "./pnpm.js";
    export { NODE_SCHEMA } from "./node.js";
    export { TSC_SCHEMA } from "./tsc.js";
    export type { CommandSchema } from "./git.js";  // pick canonical home
    ```

    Run `pnpm --filter @protostar/repo test`. All allowlist + guard tests green.
    Schema content tested in Task 3.

    Commit: `feat(03-08): subprocess allowlist + argv guard + per-command schemas`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>Allowlist + guard tests green. All four schemas exported.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3 (RED→GREEN): Per-command schema content tests</name>
  <files>packages/repo/src/subprocess-schemas/schemas.test.ts</files>
  <behavior>
    Single test file exercising each schema's surface:
    - GIT_SCHEMA.command === "git"; allowedSubcommands contains "clone","checkout","branch","status"; allowedFlags.clone contains "--depth"; refValuePattern accepts "main" and rejects "main; rm".
    - PNPM_SCHEMA accepts "@scope/pkg" via refValuePattern (scoped pkg).
    - NODE_SCHEMA has empty allowedSubcommands; allowedFlags top-level contains "--test".
    - TSC_SCHEMA has empty allowedSubcommands; allowedFlags top-level contains "-b".

    Plus integration: `applyOuterPatternGuard(["clone", "--depth", "1", "https://github.com/x/y.git"], { allowedFlagPrefixes: GIT_SCHEMA.allowedFlags.clone, refValuePattern: GIT_SCHEMA.refValuePattern })` does NOT throw.

    Wait — refValuePattern doesn't accept `https://...` if the pattern is
    `[a-zA-Z0-9._/-]+`. URLs need their own treatment; the URL goes to
    `isomorphic-git.clone()` directly, not via subprocess. So this assertion
    is moot for v1: `git clone` is NOT in the v1 subprocess matrix because
    we use `isomorphic-git`. Document that the schema covers `status`,
    `rev-parse`, `log` for diagnostic shellouts. Adjust test accordingly.
  </behavior>
  <action>
    Write the test file. Adjust assertions for v1 reality: `git clone` is
    isomorphic-git, not subprocess. Schemas exist for cases where Phase 4-7
    might shell out to system git for niche operations, but the cosmetic-tweak
    loop doesn't need it. RED then GREEN within this single task — the schemas
    are already in place from Task 2; this is verification.

    Commit: `test(03-08): pin per-command schema surfaces`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>Schema content tests pass. Documented in test file: `git clone` is via isomorphic-git, schemas cover diagnostic shell-outs only.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Argv (caller-controlled) → spawn (Plan 09) | Highest blast radius in Phase 3; this plan validates pre-spawn |
| Repo policy (operator-controlled) → effective allowlist | Policy can add but never remove from baseline |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-08-01 | Tampering | Argv injection via PR title / branch name | mitigate | Outer guard refuses shell metachars + flag-allowlist; refValuePattern bounds positional shape. Tests exercise. |
| T-03-08-02 | Elevation of Privilege | Policy removes baseline (e.g., `git`) → factory bricked | mitigate | `intersectAllowlist` is union, never subtraction. Test pins this. |
| T-03-08-03 | Tampering | Flag-injection via `--upload-pack=...` style | mitigate | Allowed-flag exact-match; unknown `--foo` rejected. Test exercises. |
| T-03-08-04 | Tampering | Whitespace in argv ("git status; rm -rf /") | mitigate | SHELL_METACHARS regex includes `\s`. Test exercises. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-04 (validation half; spawn integration in Plan 09).
- **Sample frequency:** RED + GREEN per file + per-task `pnpm --filter @protostar/repo test`.
- **Observability:** ArgvViolation has enumerated reason; test asserts on `.reason` not just throw.
- **Nyquist:** ~15 test cases across allowlist, guard, schemas. Pure compute; <1s wall.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green
- `node -e 'const a=require("./packages/repo/dist/subprocess-allowlist.js"); console.log(Object.isFrozen(a.SUBPROCESS_BASELINE_ALLOWLIST))'` prints `true`
- All four schemas importable from `./subprocess-schemas/index.js`
</verification>

<success_criteria>
- Baseline frozen, intersect helper correct
- ArgvViolation with three enumerated reasons
- Four per-command schemas exported via barrel
- Tests cover happy + each rejection reason + each schema surface
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-08-SUMMARY.md` with: schema-coverage table (which subcommands/flags landed per command), test count, any deferred-to-Phase-4-7 commands flagged.
</output>
