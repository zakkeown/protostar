---
phase: 09-operator-surface-resumability
plan: 10
type: execute
wave: 4
depends_on: [01, 03, 04]
files_modified:
  - apps/factory-cli/src/commands/prune.ts
  - apps/factory-cli/src/commands/prune.test.ts
  - apps/factory-cli/src/main.ts
  - .planning/codebase/CONCERNS.md
autonomous: true
requirements: [OP-08, OP-07]
must_haves:
  truths:
    - "prune --older-than <duration> [--dry-run] [--archetype X] [--confirm] is a real subcommand (Q-22)"
    - "Default is --dry-run (no deletes); --confirm REQUIRED to actually delete (Q-22 safety posture)"
    - "Active-status guard: refuses to prune runs whose manifest.status is non-terminal: 'created' | 'running' | 'cancelling' | 'repairing' | 'ready-to-release' (Q-22)"
    - "Workspace-level append-only files NEVER touched: .protostar/refusals.jsonl, .protostar/evolution/{lineageId}.jsonl (Q-22 + Phase 6 Q-12 + Phase 8 Q-14 invariants)"
    - "stdout JSON output: {scanned, candidates: [{runId, mtimeMs, status, archetype}], protected: [{runId, reason: 'active-' + status}], deleted: [{runId}]} (Q-22)"
    - "--archetype filter matches manifest.archetype (case-sensitive)"
    - "Uses shared parseDuration (from 09-01) and listRuns (from 09-04) — no duplicated logic"
    - "Deletion uses fs.rm({recursive: true, force: true}) only on confirmed candidates"
    - "CONCERNS.md documents: 'prune does not consult lineage chains; lineage JSONL lines may reference snapshot files no longer on disk; readers must tolerate ENOENT'"
  artifacts:
    - path: apps/factory-cli/src/commands/prune.ts
      provides: "prune command (Q-22)"
      exports: ["buildPruneCommand"]
    - path: apps/factory-cli/src/commands/prune.test.ts
      provides: "Active-guard, dry-run-default, JSONL preservation tests"
  key_links:
    - from: apps/factory-cli/src/commands/prune.ts
      to: apps/factory-cli/src/duration.ts
      via: "imports parseDuration"
      pattern: "parseDuration"
    - from: apps/factory-cli/src/commands/prune.ts
      to: apps/factory-cli/src/run-discovery.ts
      via: "imports listRuns"
      pattern: "listRuns"
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/commands/prune.ts
      via: "addCommand(buildPruneCommand())"
      pattern: "addCommand\\(buildPruneCommand"
---

<objective>
Implement `protostar-factory prune --older-than <duration>` per Q-22. Real subcommand (not a documented `find` recipe) with `--dry-run` default, explicit `--confirm` to delete, optional `--archetype` filter, active-status guard, and the load-bearing invariant that workspace-level append-only files (`.protostar/refusals.jsonl`, `.protostar/evolution/{lineageId}.jsonl`) are NEVER touched.

Purpose: Closes OP-08. Operators expect a real subcommand; documented find recipe leaves them to memorize lineage-preservation rules and active-run guards on every invocation.
Output: One command module + tests covering active-guard, dry-run-default, --confirm path, and the JSONL-preservation invariant. CONCERNS.md note about lineage JSONL pointing at deleted snapshots.
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
@.planning/codebase/CONCERNS.md
@apps/factory-cli/src/io.ts
@apps/factory-cli/src/exit-codes.ts
@apps/factory-cli/src/run-id.ts
@apps/factory-cli/src/duration.ts
@apps/factory-cli/src/run-discovery.ts
@apps/factory-cli/src/main.ts
@packages/artifacts/src/index.ts

<interfaces>
```typescript
// apps/factory-cli/src/commands/prune.ts
import type { Command } from "@commander-js/extra-typings";
export function buildPruneCommand(): Command;

interface PruneCandidate {
  readonly runId: string;
  readonly mtimeMs: number;
  readonly status: import("@protostar/artifacts").FactoryRunStatus | "unknown";
  readonly archetype: string | null;
}
interface PruneProtected {
  readonly runId: string;
  readonly reason: string;     // "active-running" | "active-cancelling" | ... | "manifest-unreadable"
}
interface PruneOutput {
  readonly scanned: number;
  readonly candidates: readonly PruneCandidate[];
  readonly protected: readonly PruneProtected[];
  readonly deleted: readonly { readonly runId: string }[];
  readonly dryRun: boolean;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: prune command — active-guard, dry-run default, --confirm delete, JSONL preservation</name>
  <read_first>
    - apps/factory-cli/src/duration.ts (Plan 09-01 — parseDuration)
    - apps/factory-cli/src/run-discovery.ts (Plan 09-04 — listRuns shape)
    - apps/factory-cli/src/io.ts, exit-codes.ts, run-id.ts (Plan 09-01)
    - apps/factory-cli/src/commands/run.ts (Plan 09-01 builder pattern)
    - packages/artifacts/src/index.ts (FactoryRunStatus union — terminal vs non-terminal classification per Q-22)
    - .planning/codebase/CONCERNS.md (existing format; pick the right section to append)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-22)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pitfall 7 — lineage JSONL preservation)
  </read_first>
  <files>apps/factory-cli/src/commands/prune.ts, apps/factory-cli/src/commands/prune.test.ts, apps/factory-cli/src/main.ts, .planning/codebase/CONCERNS.md</files>
  <behavior>
    - prune --older-than 7d (default --dry-run) against tmpdir with mixed-age runs:
      - All runs older than 7d AND with terminal status appear in candidates[].
      - Runs with manifest.status ∈ {'running','cancelling','repairing','ready-to-release','created'} appear in protected[] with reason='active-' + status.
      - deleted[] is empty (dry-run).
      - exit 0.
    - prune --older-than 7d --confirm against same tmpdir: actually deletes the candidate runs/<id>/ directories; deleted[] populated with the runIds; protected[] still excludes them.
    - prune --older-than 7d --confirm: .protostar/refusals.jsonl and .protostar/evolution/foo.jsonl exist before AND byte-identical after prune (assert via sha256 or readFile compare).
    - prune --older-than 7d --archetype cosmetic-tweak: filters candidates to manifest.archetype === 'cosmetic-tweak'.
    - prune --older-than bogus → exit 2; stderr contains parseDuration reject reason.
    - prune (no --older-than) → exit 2; stderr requires --older-than.
    - prune --older-than 24h against an empty .protostar/runs/: scanned=0, candidates=[], protected=[], deleted=[].
    - prune --older-than 7d --confirm against a run referenced in .protostar/evolution/lineage-X.jsonl: deletes the run dir; lineage JSONL byte-identical (Pitfall 7).
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/commands/prune.ts`:
       - Builder via `Command`. Options: `--older-than <duration>` (REQUIRED), `--dry-run` (default `true`), `--archetype <name>`, `--confirm`. Note: commander needs explicit handling for default-true + --no-dry-run negation; simplest is `.option('--confirm', 'actually delete (default is dry-run)')`. Compute `dryRun = !opts.confirm`.
       - `.exitOverride()`, `.configureOutput`.
       - `executePrune(opts)`:
         a. parseDuration(opts.olderThan); fail → ExitCode.UsageOrArgError.
         b. Resolve runsRoot (same path as status command).
         c. listRuns({runsRoot, all: true, runIdRegex: RUN_ID_REGEX}). Drop entries newer than threshold (mtimeMs > now - durationMs).
         d. For each remaining: read manifest. If manifest unreadable → push to protected[] with reason='manifest-unreadable'. Else:
            - If `opts.archetype` set AND manifest.archetype !== opts.archetype → skip entirely (not in candidates, not in protected).
            - If manifest.status ∈ {'created','running','cancelling','repairing','ready-to-release'} → push to protected[] with reason=`active-${status}`. (NOTE: 'orphaned' is non-terminal but it's a derived state for status display per Q-09; if a manifest writer ever sets it, it's still non-terminal — also protect it. Phase 9 v0.1 does not write 'orphaned' to manifests so this is defense-in-depth.)
            - Else (terminal: 'completed','blocked','cancelled','orphaned') → push to candidates[].
         e. If `dryRun`: writeStdoutJson({scanned: total, candidates, protected, deleted: [], dryRun: true}); return ExitCode.Success.
         f. Else (`--confirm`): for each candidate, `await fs.rm(path.join(runsRoot, runId), { recursive: true, force: true })`; build deleted[]. writeStdoutJson({scanned, candidates, protected, deleted, dryRun: false}); return ExitCode.Success.
       - **CRITICAL:** This module MUST NOT touch `.protostar/refusals.jsonl` or `.protostar/evolution/`. Add an explicit code comment near the fs.rm site: `// Phase 9 Q-22: prune ONLY removes runs/<id>/ subtrees. Workspace-level append-only files (.protostar/refusals.jsonl, .protostar/evolution/{lineageId}.jsonl) are NEVER touched. The active-status guard above + the path constructed via path.join(runsRoot, runId) ensures we cannot escape into them.`
    2. Wire into main.ts: `program.addCommand(buildPruneCommand());`.
    3. Append to `.planning/codebase/CONCERNS.md` under an appropriate heading (or add a new "Phase 9 Operator Surface" section if missing):
       ```markdown
       ## Phase 9 Prune Note (Q-22 / Pitfall 7)

       `protostar-factory prune` removes `.protostar/runs/<id>/` directories whose manifest.status is terminal AND mtime older than the configured threshold. It does NOT consult `.protostar/evolution/{lineageId}.jsonl`; lineage JSONL lines may reference `runs/<id>/evolution/snapshot.json` paths that no longer exist on disk after a prune. Readers of the lineage chain MUST tolerate `ENOENT` on these snapshot paths. The append-only invariant (Phase 8 Q-14) means the JSONL line itself survives byte-identical.

       Same applies to `.protostar/refusals.jsonl` (Phase 6 Q-12 sourceOfTruth discriminator); refusals continue to reference pruned runs by runId.
       ```
    4. Write `apps/factory-cli/src/commands/prune.test.ts` covering ALL `<behavior>` cases. Use a tmpdir layout:
       - `<tmpdir>/.protostar/runs/<id1>/manifest.json` (terminal, old)
       - `<tmpdir>/.protostar/runs/<id2>/manifest.json` (running, old)
       - `<tmpdir>/.protostar/runs/<id3>/manifest.json` (terminal, recent)
       - `<tmpdir>/.protostar/refusals.jsonl` with content
       - `<tmpdir>/.protostar/evolution/lineage-X.jsonl` referencing id1 (oldest, terminal — will be pruned)
       Assert before+after sha256 of refusals.jsonl and lineage-X.jsonl is unchanged after `--confirm`.
    5. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test` and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^prune'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildPruneCommand' apps/factory-cli/src/commands/prune.ts` is 1
    - `grep -c 'addCommand(buildPruneCommand' apps/factory-cli/src/main.ts` is 1
    - `grep -c 'parseDuration' apps/factory-cli/src/commands/prune.ts` is at least 1
    - `grep -c 'listRuns' apps/factory-cli/src/commands/prune.ts` is at least 1
    - `grep -cE "fs\\.rm" apps/factory-cli/src/commands/prune.ts` is at least 1
    - `grep -cE 'recursive: true' apps/factory-cli/src/commands/prune.ts` is at least 1
    - `grep -c 'refusals.jsonl' apps/factory-cli/src/commands/prune.ts` is at least 1  # documented in code comment
    - `grep -cE "active-(running|cancelling|repairing|ready-to-release|created)" apps/factory-cli/src/commands/prune.ts` is at least 1
    - `grep -c 'Phase 9 Prune Note' .planning/codebase/CONCERNS.md` is at least 1
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>prune command live; active-guard + dry-run-default + --confirm work; JSONL preservation invariant tested; CONCERNS.md documents the lineage caveat.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator → fs.rm | Highest blast-radius operation in the operator surface |
| Workspace-level append-only files | NEVER touched by prune; invariant tested |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-10-01 | Denial of Service | accidental delete of active run | mitigate | Active-status guard refuses non-terminal runs (Q-22). |
| T-09-10-02 | Tampering | delete append-only lineage/refusals | mitigate | Hard-coded scope to runs/<id>/ subtree only; before/after sha256 invariant test asserts JSONL byte-identical. |
| T-09-10-03 | DoS | accidental wholesale delete | mitigate | --dry-run default + explicit --confirm; safety posture matches delivery brand minting. |
| T-09-10-04 | Repudiation | "the script deleted my live run" | mitigate | Active-status guard + protected[] in stdout JSON output gives operator full visibility. |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` clean (new prune.test.ts + regression)
- `pnpm run verify` clean
- Manual: `protostar-factory prune --older-than 1h --dry-run` against a fixture tmpdir surfaces candidates/protected as expected
</verification>

<success_criteria>
- prune is a real subcommand
- --dry-run is default; --confirm required to delete
- Active-status guard refuses non-terminal runs
- Workspace-level append-only JSONLs survive byte-identical
- CONCERNS.md documents the lineage-pruning caveat
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-10-SUMMARY.md` summarizing the prune command, the active-guard matrix, the JSONL preservation invariant, and the CONCERNS.md note.
</output>
