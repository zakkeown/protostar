---
phase: 03-repo-runtime-sandbox
plan: 09
type: execute
wave: 2
depends_on: [01, 04, 08]
files_modified:
  - packages/repo/src/subprocess-runner.ts
  - packages/repo/src/subprocess-runner.test.ts
autonomous: true
requirements: [REPO-04]
must_haves:
  truths:
    - "runCommand spawns via spawn(cmd, argv, {shell: false}); never via exec/execSync"
    - "Stdout/stderr stream to file at the configured path AND a rolling tail buffer"
    - "Streams flush on exit (await stream.end) BEFORE resolving"
    - "Result includes argv, exitCode, durationMs, stdout/stderrPath, stdout/stderrTail, stdout/stderrBytes"
    - "Pre-spawn validates against effective allowlist + per-command schema + outer pattern guard (refuses before spawn)"
  artifacts:
    - path: "packages/repo/src/subprocess-runner.ts"
      provides: "Brand-consuming subprocess runner with stream-to-file + tail"
      exports: ["runCommand", "SubprocessResult", "RunCommandOptions"]
  key_links:
    - from: "packages/repo/src/subprocess-runner.ts"
      to: "packages/repo/src/argv-pattern-guard.ts"
      via: "applyOuterPatternGuard before spawn"
      pattern: "applyOuterPatternGuard"
---

<objective>
Implement the spawning half of REPO-04: `runCommand(op, options)` takes an `AuthorizedSubprocessOp` brand (Phase 2), runs the validators from Plan 08, then spawns via `node:child_process.spawn` array form (`shell: false`). Stream stdout/stderr to file paths AND keep a rolling tail buffer; flush before resolving (Pitfall 5).

Purpose: The first real subprocess in factory history. All argv injection defenses + capture infrastructure live here. Plan 11 wires this into `runFactory`; Plan 12 builds admission-e2e contract tests.
Output: `runCommand` async function + comprehensive integration tests (using `node` itself as a sacrificial child since it's in the baseline allowlist).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/authority/src/authorized-ops/subprocess-op.ts
@packages/repo/src/subprocess-allowlist.ts
@packages/repo/src/argv-pattern-guard.ts
@packages/repo/src/subprocess-schemas/index.ts

Q-09 lock: stream to file in run dir + tail last N KB into admission-decision.
Defaults `subprocessTailBytes: { stdout: 8192, stderr: 4096 }` in repo-policy.
Streams MUST flush on exit (Pitfall 5: `child.on("exit")` fires before pipe→file
flush completes — must `await stream.end(callback)` for both streams).

PATTERNS.md `subprocess-runner.ts` analog (lines 196-222) + RESEARCH.md
Pattern 3 (lines 411-444): full reference impl.

Brand shape (`packages/authority/src/authorized-ops/subprocess-op.ts:5-13`):
```typescript
export interface AuthorizedSubprocessOpData {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly resolvedEnvelope: CapabilityEnvelope;
}
```

<interfaces>
```typescript
export interface RunCommandOptions {
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutTailBytes?: number;   // default 8192
  readonly stderrTailBytes?: number;   // default 4096
  /** Effective allowlist (baseline ∪ policy extension). */
  readonly effectiveAllowlist: readonly string[];
  /** Per-command schemas keyed by command name. */
  readonly schemas: Readonly<Record<string, CommandSchema>>;
  /** Optional explicit timeout in ms (kills child). Phase 4 plumbs this from envelope budget. */
  readonly timeoutMs?: number;
  /** Optional env override for child. Defaults to process.env. */
  readonly env?: NodeJS.ProcessEnv;
}

export interface SubprocessResult {
  readonly argv: readonly string[];
  readonly command: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly killed: boolean;             // true if timeout fired
}

export class SubprocessRefusedError extends Error {
  constructor(public readonly reason: "command-not-allowlisted" | "no-schema" | "argv-violation", message: string) { /* ... */ }
}

export async function runCommand(
  op: AuthorizedSubprocessOp,
  options: RunCommandOptions
): Promise<SubprocessResult>;
```

Pre-spawn validation (THROWS — does NOT return result):
1. `if (!options.effectiveAllowlist.includes(op.command))` → throw SubprocessRefusedError "command-not-allowlisted".
2. `const schema = options.schemas[op.command]; if (!schema)` → throw "no-schema".
3. `applyOuterPatternGuard(op.args, { allowedFlagPrefixes: flatten(schema.allowedFlags), refValuePattern: schema.refValuePattern })` — wrap any ArgvViolation in SubprocessRefusedError "argv-violation".
4. If `op.args[0]` is non-empty AND `schema.allowedSubcommands.length > 0`, verify `schema.allowedSubcommands.includes(op.args[0])`; else "argv-violation".

Spawn:
- `spawn(op.command, [...op.args], { shell: false, cwd: op.cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] })`
- Create write streams to stdoutPath/stderrPath (ensure parent dirs exist via `mkdir({recursive:true})`).
- Rolling tail buffer: keep last N bytes in memory; on each chunk push, slice to last N bytes.
- Track totalBytes received per stream.
- On `child.error` reject; on `child.exit(code, signal)`, await both stream `.end(cb)`s, then resolve.
- Timeout: `setTimeout(() => { child.kill("SIGTERM"); killed = true; }, options.timeoutMs)` if set; clear on exit.
- Wall-clock duration: `performance.now()` start/end.

Return SubprocessResult.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement subprocess-runner with pre-spawn validation + streaming + tail + flush-on-exit</name>
  <files>packages/repo/src/subprocess-runner.ts</files>
  <behavior>
    See `<interfaces>` for full contract. Tests in Task 2 cover:
    - command-not-allowlisted refusal
    - no-schema refusal
    - argv-violation refusal (flag, ref, metachar)
    - happy path: `node -e "console.log('hi')"` exits 0, stdout file has "hi\n", stdoutTail equals "hi\n", stdoutBytes == 3
    - large stdout: child writes 100KB; tail caps at 8KB; file has full 100KB; bytes == 100*1024
    - exit nonzero: child exits 1; result.exitCode === 1; no throw
    - timeout: child runs forever; `timeoutMs: 100`; result.killed === true; exitCode is signal-based or -1
    - flush-on-exit: file content equals stdoutTail content for small outputs (catches the Pitfall 5 race)
  </behavior>
  <action>
    Implement per `<interfaces>`. Imports:
    ```typescript
    import { spawn } from "node:child_process";
    import { createWriteStream } from "node:fs";
    import { mkdir } from "node:fs/promises";
    import { dirname } from "node:path";
    import { performance } from "node:perf_hooks";
    import { applyOuterPatternGuard, ArgvViolation } from "./argv-pattern-guard.js";
    import type { AuthorizedSubprocessOp } from "@protostar/authority";
    import type { CommandSchema } from "./subprocess-schemas/index.js";
    ```

    Rolling tail buffer impl: keep `Buffer.alloc(0)` and on each chunk
    `tail = Buffer.concat([tail, chunk]); if (tail.length > N) tail = tail.subarray(tail.length - N)`.

    "Flatten allowedFlags": gather all flag prefixes across all subcommands into
    a single array for the outer guard pre-spawn check. Subcommand-specific
    flag validation is a refinement; v1 takes the union (any allowed flag for
    any subcommand is allowed in argv). Document the simplification in a code
    comment; if Plan 12's contract tests demand stricter per-subcommand flag
    pinning, refine then.

    `flattenAllowedFlags(schema: CommandSchema): readonly string[]`:
    ```typescript
    return Object.values(schema.allowedFlags).flat();
    ```

    Plus: include allowedSubcommands as positional-allowlisted (subcommand is
    `argv[0]`; outer guard would treat it as positional and apply refValuePattern,
    which accepts `clone`, `status`, etc. without special handling — verify).

    Mkdir parents before opening write streams.

    Timeout: track `let killed = false; let timer: NodeJS.Timeout | undefined;`
    set timer when `timeoutMs` provided; clear in exit handler.

    On exit:
    ```typescript
    await Promise.all([
      new Promise<void>(r => stdoutStream.end(() => r())),
      new Promise<void>(r => stderrStream.end(() => r())),
    ]);
    ```
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo build</automated>
  </verify>
  <done>Source compiles. Implementation imports follow the pattern; no `exec`/`execSync` references.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Subprocess-runner integration tests</name>
  <files>packages/repo/src/subprocess-runner.test.ts</files>
  <behavior>
    Tests use `node` itself as the sacrificial child (it's in baseline allowlist
    + has NODE_SCHEMA). Helper `mkOp({command, args, cwd})` casts to
    AuthorizedSubprocessOp via type assertion (real mint may need full envelope
    setup — keep test surface narrow).

    Test cases listed in Task 1 behavior. Plus:
    - Tail is exactly the last N bytes when stdout > N (e.g., 100KB stdout, tail bytes 1024 → tail equals last 1024 bytes of the stream).
    - File-vs-tail consistency for small outputs.
    - argv with metachar (`--test "; rm -rf /"`) refused pre-spawn.

    Use `os.tmpdir()` for stdout/stderr paths. Cleanup with `t.after`.
  </behavior>
  <action>
    Write tests. Run `pnpm --filter @protostar/repo test`. All green.

    If timeout test is flaky, increase margin (e.g., child sleeps 10s, timeout
    100ms; some CI is slow). Note flakiness in SUMMARY if observed.

    Two commits: `test(03-09): subprocess-runner integration suite` and
    `feat(03-09): subprocess-runner with stream-to-file + tail + flush`.
    (Order can be GREEN-first since impl is more readable that way; TDD here
    is integration-flavored not RED-GREEN-strict.)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>~10 integration tests green. Streaming + tail + flush + timeout + refusal cases all covered.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| op.command + op.args → spawn | Pre-spawn validation is the gate; spawn array-form bypasses shell |
| Stdout/stderr stream → file | Stream content is process-output; could embed escape codes; downstream operator-display concern |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-09-01 | Tampering | Shell-string injection if `spawn(cmd+" "+args, {shell:true})` is used | mitigate | Hardcoded `shell: false`; argv array form. Test refuses metachar tokens. |
| T-03-09-02 | DoS | Child writes infinite stdout, fills disk | accept v1 | Stream-to-file is O(n). Tombstone retention (Plan 11) bounds total disk by run-count × tail. Phase 4 envelope budget caps wall-clock; Phase 9 prune cleans. |
| T-03-09-03 | DoS | Child runs forever | mitigate | `timeoutMs` option + SIGTERM kill; result.killed surfaced. |
| T-03-09-04 | Information Disclosure | Stream leaks env-var values via child output | accept | Operator-controlled child; envelope governs which envs propagate (Phase 4 concern). |
| T-03-09-05 | Tampering | Truncated logs (Pitfall 5 flush race) mislead reviewer | mitigate | Await `stream.end(cb)` on both streams before resolving. Test asserts file-vs-tail consistency. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-04 (subprocess invocation runner half).
- **Sample frequency:** Per-task `pnpm --filter @protostar/repo test`.
- **Observability:** SubprocessResult fields cover argv, exitCode, duration, paths, tail, bytes, killed.
- **Nyquist:** ~10 cases include happy, large stdout, exit nonzero, timeout, all three refusal reasons. Wall <30s (timeout case is the long pole).
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green
- `grep -E 'shell:\s*true|exec\(|execSync\(' packages/repo/src/subprocess-runner.ts | grep -v '^#'` returns nothing
- `grep -c "shell: false" packages/repo/src/subprocess-runner.ts` ≥ 1
</verification>

<success_criteria>
- `runCommand` enforces pre-spawn validation
- Stream-to-file + rolling tail + flush-on-exit
- Timeout + kill semantics surfaced via `killed` field
- Three SubprocessRefusedError reasons enumerated
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-09-SUMMARY.md` with: test count, any flaky tests + mitigation, "flatten allowedFlags" simplification note (if Plan 12 needs stricter, document the upgrade path).
</output>
