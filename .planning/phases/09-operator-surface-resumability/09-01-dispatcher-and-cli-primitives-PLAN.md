---
phase: 09-operator-surface-resumability
plan: 01
type: execute
wave: 2
depends_on: ["02"]
files_modified:
  - apps/factory-cli/package.json
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/commands/run.ts
  - apps/factory-cli/src/exit-codes.ts
  - apps/factory-cli/src/io.ts
  - apps/factory-cli/src/run-id.ts
  - apps/factory-cli/src/duration.ts
  - apps/factory-cli/src/exit-codes.test.ts
  - apps/factory-cli/src/io.test.ts
  - apps/factory-cli/src/run-id.test.ts
  - apps/factory-cli/src/duration.test.ts
  - .planning/PROJECT.md
autonomous: true
requirements: [OP-01, OP-07]
must_haves:
  truths:
    - "main.ts is a thin commander dispatcher; run logic lives in commands/run.ts as a behavior-preserving extraction (Q-01)"
    - "commander@14.0.3 + @commander-js/extra-typings@14.0.0 are pinned exact versions on apps/factory-cli (Q-02)"
    - "ExitCode const object exports 7 integers: Success=0, GenericError=1, UsageOrArgError=2, NotFound=3, Conflict=4, CancelledByOperator=5, NotResumable=6 (Q-03)"
    - "writeStdoutJson canonicalizes via sortJsonValue imported from @protostar/artifacts/canonical-json (Q-12; 09-02 lands in Wave 1, this plan now Wave 2 with depends_on: [02]) and writeStderr is the only progress channel (Q-04)"
    - "RUN_ID_REGEX is /^[a-zA-Z0-9_-]{1,128}$/; parseRunId rejects non-conforming input; assertRunIdConfined throws on path escapes (Q-19)"
    - "parseDuration accepts Ns/Nm/Nh/Nd/Nw and rejects malformed input (Q-06 helper, shared with prune in 09-10)"
    - "PROJECT.md Constraints lists commander family runtime-dep lock alongside isomorphic-git, diff, @dogpile/sdk, @octokit/*"
    - "Existing pnpm run factory smoke continues to stop at the workspace-trust gate (no behavior change in Plan 01)"
  artifacts:
    - path: apps/factory-cli/src/exit-codes.ts
      provides: "ExitCode const object (Q-03)"
      exports: ["ExitCode", "type ExitCodeValue"]
    - path: apps/factory-cli/src/io.ts
      provides: "stdout/stderr discipline (Q-04, Q-12)"
      exports: ["writeStdoutJson", "writeStderr"]
    - path: apps/factory-cli/src/run-id.ts
      provides: "Branded RunId + parse + path confinement (Q-19)"
      exports: ["RUN_ID_REGEX", "type RunId", "parseRunId", "assertRunIdConfined"]
    - path: apps/factory-cli/src/duration.ts
      provides: "parseDuration helper (Q-06)"
      exports: ["parseDuration"]
    - path: apps/factory-cli/src/commands/run.ts
      provides: "Extracted run command via commander; wraps existing runFactory body"
      exports: ["buildRunCommand"]
    - path: apps/factory-cli/src/main.ts
      provides: "Thin commander dispatcher with single process.exit site"
      contains: "program.addCommand(buildRunCommand())"
    - path: apps/factory-cli/package.json
      contains: '"commander": "14.0.3"'
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/commands/run.ts
      via: "buildRunCommand() composed onto root program"
      pattern: "addCommand\\(buildRunCommand"
    - from: apps/factory-cli/src/io.ts
      to: packages/artifacts/src/canonical-json.ts
      via: "import sortJsonValue (09-02 ships in Wave 1; this plan is Wave 2 dep)"
      pattern: "from .*canonical-json"
---

<objective>
Land the Phase 9 CLI scaffolding: commander-based dispatcher, ExitCode taxonomy, stdout/stderr IO discipline, branded RunId helpers, parseDuration shared helper, and a behavior-preserving extraction of the existing `runFactory` invocation into `commands/run.ts`. This is a no-op refactor at the public-CLI level — `pnpm run factory` continues to stop at the existing workspace-trust gate.

Purpose: Foundation every subsequent Phase 9 command depends on (Q-01/Q-02/Q-03/Q-04/Q-06/Q-19). Without this plan, no command module can be written.

Output: Six new modules + tests + amended PROJECT.md Constraints + amended package.json runtime deps. main.ts shrinks; the existing parseArgs / runFactory invocation lives behind `buildRunCommand`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-operator-surface-resumability/09-CONTEXT.md
@.planning/phases/09-operator-surface-resumability/09-RESEARCH.md
@AGENTS.md
@apps/factory-cli/package.json
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/cancel.ts

<interfaces>
<!-- Public surfaces this plan creates. Subsequent plans import from these modules. -->

```typescript
// apps/factory-cli/src/exit-codes.ts (Q-03)
export const ExitCode = {
  Success: 0,
  GenericError: 1,
  UsageOrArgError: 2,
  NotFound: 3,
  Conflict: 4,
  CancelledByOperator: 5,
  NotResumable: 6,
} as const;
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

// apps/factory-cli/src/io.ts (Q-04, Q-12)
export function writeStdoutJson(value: unknown): void;
export function writeStderr(line: string): void;

// apps/factory-cli/src/run-id.ts (Q-19)
export const RUN_ID_REGEX: RegExp; // /^[a-zA-Z0-9_-]{1,128}$/
declare const RunIdBrand: unique symbol;
export type RunId = string & { readonly [RunIdBrand]: true };
export function parseRunId(input: string):
  | { readonly ok: true; readonly value: RunId }
  | { readonly ok: false; readonly reason: string };
export function assertRunIdConfined(runsRoot: string, runId: RunId): void;

// apps/factory-cli/src/duration.ts (Q-06)
export function parseDuration(input: string):
  | { readonly ok: true; readonly ms: number }
  | { readonly ok: false; readonly reason: string };

// apps/factory-cli/src/commands/run.ts
import type { Command } from "@commander-js/extra-typings";
export function buildRunCommand(): Command<readonly string[], { /* run flags */ }>;
```
</interfaces>

<commander_pattern>
<!-- Cited from RESEARCH.md Pattern 1; required for Q-04 compliance and ExitCode taxonomy. -->

```typescript
// In main.ts
import { Command, CommanderError } from "@commander-js/extra-typings";
import { ExitCode } from "./exit-codes.js";
import { buildRunCommand } from "./commands/run.js";

async function main(argv: readonly string[]): Promise<number> {
  const program = new Command("protostar-factory")
    .exitOverride()
    .configureOutput({
      writeOut: (s) => process.stderr.write(s),
      writeErr: (s) => process.stderr.write(s),
    });
  program.addCommand(buildRunCommand());

  try {
    await program.parseAsync([...argv], { from: "user" });
    return process.exitCode ?? ExitCode.Success;
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
        return ExitCode.Success;
      }
      return ExitCode.UsageOrArgError;
    }
    process.stderr.write(`unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    return ExitCode.GenericError;
  }
}
```
</commander_pattern>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create ExitCode + io.ts + run-id.ts + duration.ts primitives with tests</name>
  <read_first>
    - apps/factory-cli/src/main.ts (existing parseArgs at line ~2836, console.log call sites for stderr conversion)
    - apps/factory-cli/package.json (devDependencies layout, exports field)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-03, Q-04, Q-06, Q-19)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pattern 3 branded RunId)
    - packages/execution/src/snapshot.ts (sortJsonValue source — 09-02 lifts this in Wave 1 BEFORE this plan runs; this task imports from @protostar/artifacts/canonical-json directly, no fallback path needed since 09-02 is a hard depends_on)
  </read_first>
  <files>apps/factory-cli/src/exit-codes.ts, apps/factory-cli/src/io.ts, apps/factory-cli/src/run-id.ts, apps/factory-cli/src/duration.ts, apps/factory-cli/src/exit-codes.test.ts, apps/factory-cli/src/io.test.ts, apps/factory-cli/src/run-id.test.ts, apps/factory-cli/src/duration.test.ts</files>
  <behavior>
    - exit-codes.test: ExitCode.Success === 0; UsageOrArgError === 2; NotFound === 3; Conflict === 4; CancelledByOperator === 5; NotResumable === 6; GenericError === 1; Object.keys(ExitCode).length === 7.
    - io.test: writeStdoutJson({ b: 2, a: 1 }) writes `{"a":1,"b":2}\n` to stdout (key-sorted via sortJsonValue from canonical-json); writeStderr("hi") writes `hi\n` to stderr.
    - io.test: writeStdoutJson(null) → `null\n`; writeStdoutJson([{ b: 1, a: 2 }]) → `[{"a":2,"b":1}]\n`.
    - run-id.test: parseRunId("abc-123_XYZ") returns ok=true; parseRunId("../etc") returns ok=false; parseRunId("") returns ok=false; parseRunId("a".repeat(129)) returns ok=false; parseRunId("a".repeat(128)) returns ok=true.
    - run-id.test: assertRunIdConfined("/tmp/runs", parsed("abc")) does not throw; assertRunIdConfined with a hypothetically-resolving-outside id throws (use a regex-passing id whose path.resolve exits the root via symlink-like manipulation — practical test: stub via path.resolve check directly).
    - duration.test: parseDuration("24h") → ok=true, ms=86_400_000; "7d" → 604_800_000; "30m" → 1_800_000; "10s" → 10_000; "2w" → 1_209_600_000; "abc" → ok=false; "" → ok=false; "24" → ok=false; "24x" → ok=false.
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/exit-codes.ts` with the verbatim `const ExitCode = { Success: 0, GenericError: 1, UsageOrArgError: 2, NotFound: 3, Conflict: 4, CancelledByOperator: 5, NotResumable: 6 } as const;` plus `export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];`.
    2. Create `apps/factory-cli/src/io.ts`:
       - `import { sortJsonValue } from "@protostar/artifacts/canonical-json";` (this import target ships in 09-02, which is a hard `depends_on` for this plan via Wave 1 → Wave 2 ordering; no fallback path).
       - `export function writeStdoutJson(value: unknown): void { process.stdout.write(JSON.stringify(sortJsonValue(value)) + "\n"); }`
       - `export function writeStderr(line: string): void { process.stderr.write(line + "\n"); }`
    3. Create `apps/factory-cli/src/run-id.ts` matching the verbatim shape in `<interfaces>`. Use `path.resolve(runsRoot, runId)` and check `resolved.startsWith(path.resolve(runsRoot) + path.sep)`. Throw `Error` with message: `runId ${runId} resolves outside runs root`.
    4. Create `apps/factory-cli/src/duration.ts`:
       - regex `/^(\d+)(s|m|h|d|w)$/`
       - units: s=1000, m=60_000, h=3_600_000, d=86_400_000, w=604_800_000
       - reject on regex miss with `reason: "duration must match <integer><s|m|h|d|w>, got " + JSON.stringify(input)`
    5. Write the corresponding test files using `node:test` + `node:assert/strict`. For io.test, redirect stdout/stderr by spawning a subprocess OR by stubbing `process.stdout.write` / `process.stderr.write` (preserve and restore). Match the existing factory-cli test pattern (see `apps/factory-cli/src/cancel.test.ts` for a precedent if it exists; otherwise mirror Phase 6 main.test.ts spawn pattern).
    6. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test` — must pass.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^(exit-codes|io|run-id|duration)'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'Success: 0' apps/factory-cli/src/exit-codes.ts` is 1
    - `grep -c 'UsageOrArgError: 2' apps/factory-cli/src/exit-codes.ts` is 1
    - `grep -c 'NotResumable: 6' apps/factory-cli/src/exit-codes.ts` is 1
    - `grep -cE 'export function writeStdoutJson' apps/factory-cli/src/io.ts` is 1
    - `grep -cE 'export function writeStderr' apps/factory-cli/src/io.ts` is 1
    - `grep -c 'RUN_ID_REGEX' apps/factory-cli/src/run-id.ts` is at least 1
    - `grep -cE '\^\[a-zA-Z0-9_-\]\{1,128\}\$' apps/factory-cli/src/run-id.ts` is at least 1
    - `grep -cE 'export function parseDuration' apps/factory-cli/src/duration.ts` is 1
    - `pnpm --filter @protostar/factory-cli build` exits 0
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>Four primitive modules + four test files exist; all tests pass; no behavior change to main.ts yet.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add commander deps + extract runFactory dispatch into commands/run.ts</name>
  <read_first>
    - apps/factory-cli/package.json (existing dependencies + scripts shape)
    - apps/factory-cli/src/main.ts (FULL FILE — particularly lines around `parseArgs` (~2836), `runFactory` body (~233), `bin` entrypoint (~3104), and every `console.log` for progress that must move to writeStderr)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pattern 1, Pitfall 3, Pitfall 4 — exitOverride + configureOutput required)
    - .planning/PROJECT.md (Constraints — runtime-dep lock format precedent)
    - apps/factory-cli/src/commands/ (DOES NOT EXIST yet — this task creates it)
  </read_first>
  <files>apps/factory-cli/package.json, apps/factory-cli/src/main.ts, apps/factory-cli/src/commands/run.ts, .planning/PROJECT.md</files>
  <behavior>
    - After this task: `node apps/factory-cli/dist/main.js run --confirmed-intent <path> ...` works exactly as `node apps/factory-cli/dist/main.js --confirmed-intent <path> ...` did before — no behavior change.
    - `node apps/factory-cli/dist/main.js --help` writes to stderr (Q-04) and exits 0.
    - `node apps/factory-cli/dist/main.js bogus-subcommand` exits with `ExitCode.UsageOrArgError` (2).
    - `node apps/factory-cli/dist/main.js run --help` writes the run command's help to stderr and exits 0.
    - All existing main.ts integration tests (e.g., `main.test.ts` 4 integration cases from Phase 6 Plan 07) continue to pass.
    - `pnpm run factory` builds and stops at the workspace-trust gate (existing behavior).
  </behavior>
  <action>
    1. Run `pnpm --filter @protostar/factory-cli add commander@14.0.3 @commander-js/extra-typings@14.0.0` (exact pins per PROJECT.md lock posture). Confirm package.json shows `"commander": "14.0.3"` and `"@commander-js/extra-typings": "14.0.0"` — NOT `^14`.
    2. Create `apps/factory-cli/src/commands/run.ts`:
       - Import `Command` from `@commander-js/extra-typings`.
       - Export `buildRunCommand(): Command`.
       - Re-implement the existing argv shape that `parseArgs` accepts (read main.ts:~2836 verbatim). Every existing flag (e.g., `--confirmed-intent`, `--intent-draft`, `--planning-mode`, `--review-mode`, `--exec-coord-mode`, `--lineage`, `--evolve-code`, `--generation`, `--semantic-judge-model`, `--consensus-judge-model`, `--from-fixture`, etc.) is added with `.option(...)`. Use `.exitOverride()` and `.configureOutput({writeOut: (s) => process.stderr.write(s), writeErr: (s) => process.stderr.write(s)})`.
       - In the `.action(async (opts) => { ... })` callback, delegate to the existing `runFactory(...)` function (or whatever main.ts already exports as the run-loop entrypoint). Translate commander opts back into the existing `RunCommandOptions` shape. Set `process.exitCode = ExitCode.Success` on success; `ExitCode.GenericError` on a thrown error from runFactory (after writing the error to stderr).
       - Preserve the existing exit-2 workspace-trust escalation marker behavior — propagate non-success codes from runFactory if it returns one (or via existing CliExitError throws).
    3. Refactor `apps/factory-cli/src/main.ts`:
       - Remove the old `parseArgs`-based router (or stub it to throw — the dispatcher replaces it).
       - Replace the bin entrypoint (~line 3104) with the dispatcher from `<commander_pattern>` above. Keep main.ts under 3000 LoC; long-term shrinking is fine (Phase 10 may extract more).
       - Replace all `console.log(` progress calls in the run-loop body with `writeStderr(...)` from io.ts (Q-04). Do NOT change error-throwing or final-summary writes — those become writeStdoutJson if they were already JSON; otherwise leave the existing behavior in place for this no-op refactor and document any divergence in the SUMMARY.
       - Single `process.exit(code)` site lives in the dispatcher's tail: `void main(process.argv.slice(2)).then((code) => process.exit(code));`.
       - All existing exports from main.ts that other files import (composition deps, etc.) MUST remain exported.
    4. Amend `.planning/PROJECT.md` Constraints section. Find the line: `**Runtime dependency posture (rephrased Phase 3, 2026-04-27):**`. Add to the same paragraph (or as a new bullet immediately after): `Plus \`commander@14.0.3\` + \`@commander-js/extra-typings@14.0.0\` on \`apps/factory-cli\` (Phase 9 Q-02: subcommand DSL + auditable --help output).`
    5. Run `pnpm install`, `pnpm --filter @protostar/factory-cli build`, `pnpm --filter @protostar/factory-cli test`, and `pnpm run factory` (must build then stop at workspace-trust gate).
    6. If A1 from RESEARCH (commander ESM-from-CJS interop) fails at build time, switch the import to `import commander from "commander"; const { Command, CommanderError } = commander;` — document in commit message.
  </action>
  <verify>
    <automated>pnpm install && pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"commander": "14.0.3"' apps/factory-cli/package.json` is 1
    - `grep -c '"@commander-js/extra-typings": "14.0.0"' apps/factory-cli/package.json` is 1
    - `grep -c 'commander@14.0.3' .planning/PROJECT.md` is at least 1
    - `test -f apps/factory-cli/src/commands/run.ts` returns 0
    - `grep -c 'export function buildRunCommand' apps/factory-cli/src/commands/run.ts` is 1
    - `grep -c '.exitOverride()' apps/factory-cli/src/commands/run.ts` is at least 1
    - `grep -c 'configureOutput' apps/factory-cli/src/commands/run.ts` is at least 1
    - `grep -c 'addCommand(buildRunCommand' apps/factory-cli/src/main.ts` is 1
    - `grep -cE '^\s*console\.log\(' apps/factory-cli/src/main.ts` is 0 (all progress now stderr)
    - `pnpm --filter @protostar/factory-cli build` exits 0
    - `pnpm --filter @protostar/factory-cli test` exits 0
    - `pnpm run factory` exits with the existing workspace-trust gate (exit code 2)
  </acceptance_criteria>
  <done>Dispatcher live; run command extracted; commander deps pinned; PROJECT.md amended; no behavior regression.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| argv → command parser | Untrusted operator input crosses into commander; runId arguments validated by parseRunId before any fs touch |
| stdout consumer (jq pipe) | Downstream automation consumes JSON; any progress text on stdout breaks pipelines |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-01-01 | Tampering | argv → runId | mitigate | RUN_ID_REGEX at parse layer rejects path-traversal class before any fs access (Q-19 belt). |
| T-09-01-02 | DoS-of-automation | stdout JSON discipline | mitigate | All progress routed through writeStderr; writeStdoutJson is single-shot per command (Q-04). |
| T-09-01-03 | Tampering | exit code mapping | mitigate | commander.exitOverride() + dispatcher catch maps CommanderError → ExitCode.UsageOrArgError; no silent process.exit (Pitfall 3). |
| T-09-01-04 | Information Disclosure | --help on stdout | mitigate | configureOutput routes --help to stderr (Pitfall 4). |
</threat_model>

<verification>
- `pnpm install` clean
- `pnpm --filter @protostar/factory-cli build` clean
- `pnpm --filter @protostar/factory-cli test` clean (existing tests + 4 new primitive test files)
- `pnpm run factory` builds and stops at the workspace-trust gate (exit 2) — same behavior as Phase 8
- `pnpm run verify` clean (or only known-flake clusters from STATE.md)
</verification>

<success_criteria>
- Six new modules exist (exit-codes, io, run-id, duration, commands/run, dispatcher in main)
- commander pinned at exact 14.0.3
- PROJECT.md Constraints includes commander runtime-dep lock entry
- No behavior change at the public CLI surface for the run command
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-01-SUMMARY.md` summarizing the dispatcher refactor, the four primitive modules, the commander pinning, the PROJECT.md amendment, and confirmation that `pnpm run factory` stops at the workspace-trust gate (no behavior change).
</output>
