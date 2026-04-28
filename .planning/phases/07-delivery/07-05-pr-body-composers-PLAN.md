---
phase: 07-delivery
plan: 05
type: execute
wave: 1
depends_on: ["07-01"]
files_modified:
  - packages/delivery/src/pr-body/compose-run-summary.ts
  - packages/delivery/src/pr-body/compose-mechanical-summary.ts
  - packages/delivery/src/pr-body/compose-judge-panel.ts
  - packages/delivery/src/pr-body/compose-score-sheet.ts
  - packages/delivery/src/pr-body/compose-repair-history.ts
  - packages/delivery/src/pr-body/compose-artifact-list.ts
  - packages/delivery/src/pr-body/compose-footer.ts
  - packages/delivery/src/pr-body/compose-run-summary.test.ts
  - packages/delivery/src/pr-body/compose-mechanical-summary.test.ts
  - packages/delivery/src/pr-body/compose-judge-panel.test.ts
  - packages/delivery/src/pr-body/compose-score-sheet.test.ts
  - packages/delivery/src/pr-body/compose-repair-history.test.ts
  - packages/delivery/src/pr-body/compose-artifact-list.test.ts
  - packages/delivery/src/pr-body/compose-footer.test.ts
  - packages/delivery/src/pr-body/artifact-list-no-drift.contract.test.ts
  - packages/delivery/src/index.ts
autonomous: true
requirements: [DELIVER-03, DELIVER-06]
must_haves:
  truths:
    - "Seven pure per-section composers exist in packages/delivery/src/pr-body/"
    - "composeArtifactList(artifacts: readonly ArtifactRef[]): string takes the LIVE artifact list — no hardcoded filenames in source"
    - "composeJudgePanel uses composeScoreSheet (compact table + <details><summary> per rationale, BUT details OUTSIDE table cells per Pitfall 8)"
    - "composeFooter records screenshotStatus: 'deferred-v01' with rationale (Q-11)"
    - "composeArtifactList output equals JSON.stringify(artifacts)-derived markdown — drift contract test pins this"
    - "All composers are pure (deterministic over typed input; no Date.now, no Math.random, no I/O)"
  artifacts:
    - path: packages/delivery/src/pr-body/compose-artifact-list.ts
      provides: "Drift-by-construction artifact list composer"
      exports: ["composeArtifactList"]
    - path: packages/delivery/src/pr-body/artifact-list-no-drift.contract.test.ts
      provides: "Pinned drift contract — body equals input list"
    - path: packages/delivery/src/pr-body/compose-score-sheet.ts
      provides: "Q-12 compact table + <details><summary>"
      exports: ["composeScoreSheet"]
    - path: packages/delivery/src/pr-body/compose-footer.ts
      provides: "Q-11 screenshots-deferred footer"
      exports: ["composeFooter"]
  key_links:
    - from: packages/delivery/src/pr-body/compose-judge-panel.ts
      to: packages/delivery/src/pr-body/compose-score-sheet.ts
      via: "Composition of judge panel section uses score sheet helper"
      pattern: "composeScoreSheet"
---

<objective>
Land the seven per-section pure markdown composers (Q-13) that build the PR body section-by-section, plus the drift-by-construction contract test (DELIVER-06) that pins `composeArtifactList`'s output to the live input artifact list. Each composer takes typed inputs and returns a markdown string. `factory-cli` (Plan 07-11) orders them; this plan provides the pieces.

The strongest invariant after no-merge: `composeArtifactList(artifacts)` MUST take the live `readonly ArtifactRef[]` — no hardcoded filenames anywhere in `delivery/`. The drift contract test asserts every artifact line in the body resolves to an entry in the input list.

Purpose: Q-12, Q-13, Q-11, DELIVER-03, DELIVER-06 — all section composers + drift pin in one plan.
Output: Seven composers + seven snapshot tests + one drift contract test. Pure module.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/07-delivery/07-CONTEXT.md
@.planning/phases/07-delivery/07-RESEARCH.md
@.planning/phases/07-delivery/07-PATTERNS.md
@packages/delivery/src/index.ts
@packages/review/src/index.ts
@packages/artifacts/src/index.ts

<interfaces>
<!-- Score sheet (Q-12) — compact table + <details> OUTSIDE table per Pitfall 8. -->

```typescript
import type { JudgeCritique } from "@protostar/review";

export function composeScoreSheet(critiques: readonly JudgeCritique[]): string;
```

Output (rendered):
```markdown
## Judge Panel

| Judge | Model | Verdict | Mean Score |
|-------|-------|---------|------------|
| j1 | qwen3 | pass | 4.20 |

<details>
<summary>j1 rationale</summary>

{rationale text here}

Rubric:
- coherence: 4
- correctness: 5
</details>
```

Ordering: highest verdict-severity first (block > repair > pass), then judgeId alphabetical.

<!-- Artifact list (DELIVER-06) — drift-by-construction. -->

```typescript
import type { StageArtifactRef } from "@protostar/artifacts";

export function composeArtifactList(artifacts: readonly StageArtifactRef[]): string;
```

Output: a markdown bullet list of relative paths from each ArtifactRef. Zero hardcoded filenames in source.

<!-- Footer (Q-11) — screenshots-deferred. -->

```typescript
export function composeFooter(input: { readonly screenshotStatus: 'deferred-v01' | 'captured' }): string;
```

For 'deferred-v01': returns `"_Screenshots: deferred until Phase 10 dogfood (toy repo not yet scaffolded)._"`
For 'captured': renders the trace list (forward-compat for Phase 10).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Compose run-summary, mechanical-summary, repair-history, footer (4 simple composers)</name>
  <read_first>
    - packages/delivery/src/index.ts (existing `createPrBody` lines 72–95 — string-concat patterns informing run-summary composer)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-13 (per-section composers list) + Q-11 (screenshots deferred)
    - .planning/phases/07-delivery/07-PATTERNS.md §"packages/delivery/src/pr-body/compose-mechanical-summary.ts"
  </read_first>
  <behavior>
    - composeRunSummary({ runId, prUrl?, target }): renders top-of-body block:
      ```
      # Protostar Factory Run

      - Run: `{runId}`
      - Target: `{target.owner}/{target.repo}@{target.baseBranch}`
      ```
      (PR URL omitted from this composer — added post-creation by factory-cli when known.)
    - composeMechanicalSummary({ verdict: 'pass'|'fail', findings: readonly Finding[] }):
      - On pass: `## Mechanical Review\n\n✅ All checks passed.\n`
      - On fail: heading + bulleted finding list + each finding's rule + evidence excerpt
    - composeRepairHistory({ iterations: readonly ReviewIteration[] }):
      - Empty iterations → `## Repair History\n\n_No repair iterations._\n`
      - Non-empty → numbered list with iteration count, mechanical verdict, model verdict per iteration
    - composeFooter({ screenshotStatus }): per Q-11 (see <interfaces>)
    - All four composers: deterministic, pure, no Date.now / Math.random
    - Each composer has a snapshot test pinning the exact markdown output for a representative input
  </behavior>
  <files>packages/delivery/src/pr-body/compose-run-summary.ts, packages/delivery/src/pr-body/compose-mechanical-summary.ts, packages/delivery/src/pr-body/compose-repair-history.ts, packages/delivery/src/pr-body/compose-footer.ts, packages/delivery/src/pr-body/compose-run-summary.test.ts, packages/delivery/src/pr-body/compose-mechanical-summary.test.ts, packages/delivery/src/pr-body/compose-repair-history.test.ts, packages/delivery/src/pr-body/compose-footer.test.ts</files>
  <action>
    1. **RED:** Create the four `.test.ts` files. Each has 2-3 test cases (representative input + edge case + snapshot). Example for compose-footer:
       ```typescript
       it("renders screenshots-deferred footer with verbatim Q-11 rationale", () => {
         const out = composeFooter({ screenshotStatus: 'deferred-v01' });
         assert.equal(out, "_Screenshots: deferred until Phase 10 dogfood (toy repo not yet scaffolded)._");
       });
       ```
    2. **GREEN:** Implement each composer per the behavior above. Use template literals; avoid string concat with implicit `undefined`. Each function takes a typed input object and returns `string`.
    3. **REFACTOR:** Extract any shared helpers (e.g., `markdownEscape`, `bulletList`) into `packages/delivery/src/pr-body/internal/markdown.ts`. Keep helpers small and pure.
    4. Headings use `##` (level-2) so they nest correctly under the level-1 run-summary heading.
    5. Verbatim Q-11 footer text MUST match the contract test exactly (not paraphrased).
    6. Snapshot pins are inline assertions (not jest snapshot files) — `assert.equal(actual, expected)` against the literal expected markdown.
    7. Re-export each composer from `packages/delivery/src/index.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery test --run compose-run-summary && pnpm --filter @protostar/delivery test --run compose-mechanical-summary && pnpm --filter @protostar/delivery test --run compose-repair-history && pnpm --filter @protostar/delivery test --run compose-footer</automated>
  </verify>
  <acceptance_criteria>
    - 4 composer files exist + 4 corresponding test files
    - Each composer is a `function` or `const = (...) =>` with explicit return type `string`
    - composeFooter('deferred-v01') returns the verbatim Q-11 string
    - All composers exported from `packages/delivery/src/index.ts` barrel
    - Tests green (~12 test cases total: 3 per composer)
    - `grep -c 'Math.random\|Date.now\|new Date(' packages/delivery/src/pr-body/` returns zero (purity)
  </acceptance_criteria>
  <done>4 simple composers + tests green; Q-11 footer text pinned verbatim.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: composeScoreSheet + composeJudgePanel (Q-12 with Pitfall 8 mitigation)</name>
  <read_first>
    - .planning/phases/07-delivery/07-CONTEXT.md Q-12 (compact table + <details>)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 8: <details> rendering inside markdown tables breaks GitHub rendering" — <details> goes OUTSIDE table cells
    - packages/review/src/index.ts (JudgeCritique type — verify shape: judgeId, model, verdict, rubric, rationale)
  </read_first>
  <behavior>
    - composeScoreSheet renders a compact 4-column table (`Judge | Model | Verdict | Mean Score`) followed by `<details>` blocks (one per critique) — NEVER `<details>` inside table cells (Pitfall 8).
    - Mean Score = arithmetic mean of `rubric` numeric values, rounded to 2 decimals.
    - Empty critiques list → `## Judge Panel\n\n_No judge critiques._\n`
    - Critique ordering:
      1. By verdict severity (block > repair > pass) — block first
      2. Within same verdict, alphabetical by judgeId (deterministic snapshot)
    - composeJudgePanel({ critiques }): wraps composeScoreSheet output with the section heading; returns the same string (composeJudgePanel is the public-facing composer; composeScoreSheet is internal but re-exported for testing).
    - Tests:
      - 0 critiques → empty-state markdown
      - 1 critique → table with 1 row + 1 details block
      - 3 critiques mixed verdicts → ordering deterministic (block, repair, pass; alphabetical within tier)
      - Rubric mean = (4+5)/2 = 4.50 (2-decimal format)
      - Snapshot pins exact output for the 3-critique case
  </behavior>
  <files>packages/delivery/src/pr-body/compose-score-sheet.ts, packages/delivery/src/pr-body/compose-judge-panel.ts, packages/delivery/src/pr-body/compose-score-sheet.test.ts, packages/delivery/src/pr-body/compose-judge-panel.test.ts</files>
  <action>
    1. **RED:** Write tests covering ordering, empty case, mean computation, and snapshot-style assertion for the 3-critique case.
    2. **GREEN:** Implement `composeScoreSheet`:
       ```typescript
       export function composeScoreSheet(critiques: readonly JudgeCritique[]): string {
         if (critiques.length === 0) return "## Judge Panel\n\n_No judge critiques._\n";
         const VERDICT_ORDER = { 'block': 0, 'repair': 1, 'pass': 2 } as const;
         const sorted = [...critiques].sort((a, b) =>
           VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || a.judgeId.localeCompare(b.judgeId)
         );
         const tableRows = sorted.map(c => {
           const mean = Object.values(c.rubric).reduce((s, v) => s + v, 0) / Object.values(c.rubric).length;
           return `| ${c.judgeId} | ${c.model} | ${c.verdict} | ${mean.toFixed(2)} |`;
         }).join("\n");
         const details = sorted.map(c => {
           const rubricLines = Object.entries(c.rubric).map(([k, v]) => `- ${k}: ${v}`).join("\n");
           return `<details>\n<summary>${c.judgeId} rationale</summary>\n\n${c.rationale}\n\nRubric:\n${rubricLines}\n</details>`;
         }).join("\n\n");
         return `## Judge Panel\n\n| Judge | Model | Verdict | Mean Score |\n|-------|-------|---------|------------|\n${tableRows}\n\n${details}\n`;
       }
       ```
    3. `composeJudgePanel` is a thin wrapper:
       ```typescript
       export function composeJudgePanel({ critiques }: { critiques: readonly JudgeCritique[] }): string {
         return composeScoreSheet(critiques);
       }
       ```
       (The wrapper exists so factory-cli imports the named composer per Q-13's named-section convention; it can later diverge if compose-judge-panel adds extra rendering around the table.)
    4. **REFACTOR:** Add a comment in compose-score-sheet.ts citing Pitfall 8 ("<details> blocks are SIBLINGS of the table, never inside table cells").
    5. The mean is naive (no weighting); document this is fine for v0.1 — Phase 8 may calibrate.
    6. If `JudgeCritique.rubric` shape from `@protostar/review` differs from `Record<string, number>`, adapt the iteration accordingly. Read the type from `packages/review/src/index.ts`. If unsure of exact shape at the time of execution, define a local `RubricRecord = Record<string, number>` and convert.
    7. Snapshot test for the 3-critique case asserts:
       - Table appears once
       - Three `<details>` blocks appear, in the expected order
       - No `<details>` token appears between `|` characters (Pitfall 8 safety check via regex: `assert.equal(/\|.*<details>.*\|/.test(out), false)`)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery test --run compose-score-sheet && pnpm --filter @protostar/delivery test --run compose-judge-panel</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '<details>' packages/delivery/src/pr-body/compose-score-sheet.ts` ≥ 1
    - `grep -c 'Pitfall 8' packages/delivery/src/pr-body/compose-score-sheet.ts` ≥ 1 (rationale comment)
    - Test asserts no `<details>` appears inside a table cell (regex check above)
    - 3-critique snapshot test pins ordering: block first, then alphabetical within verdict
    - Mean computation tested at 2-decimal precision
  </acceptance_criteria>
  <done>Score sheet + judge panel composers green; Pitfall 8 mitigation in place; ordering deterministic.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: composeArtifactList + drift-by-construction contract test (DELIVER-06)</name>
  <read_first>
    - packages/artifacts/src/index.ts (StageArtifactRef shape — confirm it has `path` or `uri` field)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-13 (drift-by-construction) + DELIVER-06 verbatim
    - .planning/phases/07-delivery/07-VALIDATION.md Required Contract Test #4 (drift-by-construction)
    - .planning/phases/07-delivery/07-RESEARCH.md §"DELIVER-06 drift-by-construction prevention"
  </read_first>
  <behavior>
    - `composeArtifactList(artifacts: readonly StageArtifactRef[])`:
      - Empty list → `"## Artifacts\n\n_No artifacts._\n"`
      - Non-empty → heading + bulleted markdown list of artifact identifiers (use `path` or `uri`, whichever the type provides)
      - Output is deterministic over input order
    - Drift contract test:
      - Build a synthetic `artifacts: StageArtifactRef[]` with N entries
      - Call `composeArtifactList(artifacts)`
      - For each entry's identifier, assert it appears in the output exactly once
      - Conversely, parse the markdown bullets back to a list of identifiers — assert it equals the input list
      - Crucially: `grep` the source file `compose-artifact-list.ts` for any hardcoded filename strings (e.g., `delivery-result.json`, `manifest.json`, `pr-body.md`) — assert ZERO matches. The composer must derive every filename from input. (This is the strongest pin against drift.)
  </behavior>
  <files>packages/delivery/src/pr-body/compose-artifact-list.ts, packages/delivery/src/pr-body/compose-artifact-list.test.ts, packages/delivery/src/pr-body/artifact-list-no-drift.contract.test.ts</files>
  <action>
    1. **RED:** Write tests:
       - Empty list test
       - 3-entry list test (snapshot the exact output)
       - Round-trip test (parse bullets back, assert equality with input)
       - Drift contract test (grep source for hardcoded filenames)
    2. **GREEN:** Implement composeArtifactList:
       ```typescript
       import type { StageArtifactRef } from "@protostar/artifacts";

       export function composeArtifactList(artifacts: readonly StageArtifactRef[]): string {
         if (artifacts.length === 0) return "## Artifacts\n\n_No artifacts._\n";
         const lines = artifacts.map(a => `- \`${getArtifactIdentifier(a)}\``).join("\n");
         return `## Artifacts\n\n${lines}\n`;
       }

       function getArtifactIdentifier(a: StageArtifactRef): string {
         // Adapt to the StageArtifactRef shape — use `path`, `uri`, or the most stable identifier field
         return ('path' in a && typeof a.path === 'string') ? a.path : (a as { uri: string }).uri;
       }
       ```
       Read the actual `StageArtifactRef` shape from `packages/artifacts/src/index.ts` and pick the right field.
    3. **DRIFT CONTRACT TEST** (`artifact-list-no-drift.contract.test.ts`):
       ```typescript
       import { describe, it } from "node:test";
       import assert from "node:assert/strict";
       import { readFile } from "node:fs/promises";
       import { fileURLToPath } from "node:url";
       import { dirname, resolve } from "node:path";
       import { composeArtifactList } from "./compose-artifact-list.js";

       const __dirname = dirname(fileURLToPath(import.meta.url));
       const SOURCE_PATH = resolve(__dirname, "compose-artifact-list.ts");

       const KNOWN_RUNTIME_FILENAMES = [
         "delivery-result.json",
         "ci-events.jsonl",
         "manifest.json",
         "pr-body.md",
         "review-decision.json",
         "review.jsonl"
       ];

       describe("composeArtifactList — drift-by-construction (DELIVER-06)", () => {
         it("source contains zero hardcoded runtime filenames", async () => {
           const src = await readFile(SOURCE_PATH, "utf8");
           const stripped = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
           const offenders = KNOWN_RUNTIME_FILENAMES.filter(name => stripped.includes(name));
           assert.deepEqual(offenders, [], `Hardcoded filename(s) in compose-artifact-list.ts: ${offenders.join(", ")}`);
         });

         it("output is exactly derived from input artifact identifiers", () => {
           const artifacts = [
             { path: "runs/r1/a.json" },
             { path: "runs/r1/b.txt" }
           ] as const;
           const out = composeArtifactList(artifacts as any);
           // Every input path appears exactly once in output
           for (const a of artifacts) {
             const matches = out.match(new RegExp(a.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? [];
             assert.equal(matches.length, 1, `Expected ${a.path} exactly once`);
           }
           // Output line count matches input length + heading lines
           const bulletCount = (out.match(/^- /gm) ?? []).length;
           assert.equal(bulletCount, artifacts.length);
         });
       });
       ```
    4. The drift test (1) reads its own source, strips comments, then grep-checks. (2) builds a typed input and asserts the output is mechanically derived. Both together pin DELIVER-06.
    5. **REFACTOR:** Re-export `composeArtifactList` from `packages/delivery/src/index.ts`.
    6. Run all tests; confirm green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery test --run compose-artifact-list && pnpm --filter @protostar/delivery test --run artifact-list-no-drift</automated>
  </verify>
  <acceptance_criteria>
    - File `compose-artifact-list.ts` exists; `grep -v '^[[:space:]]*//' packages/delivery/src/pr-body/compose-artifact-list.ts | grep -c -E 'delivery-result.json|ci-events.jsonl|manifest.json|pr-body.md'` returns 0 (no hardcoded filenames after stripping line comments)
    - Drift contract test green
    - Round-trip test green (output's bullet list equals input's identifiers)
    - composeArtifactList exported from barrel
    - Empty-list case returns the empty-state heading
  </acceptance_criteria>
  <done>composeArtifactList drift-pinned; DELIVER-06 enforced at compile + test time.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-cli → composers | factory-cli supplies typed inputs; composers cannot widen scope. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-05-01 | Tampering | compose-artifact-list.ts | mitigate | Drift contract test asserts zero hardcoded filenames + round-trip equality. |
| T-07-05-02 | Information Disclosure | compose-judge-panel.ts | accept | Judge rationales are operator-facing evidence; rendered as-is in PR body. |
| T-07-05-03 | Tampering | compose-score-sheet.ts | mitigate | Pitfall 8 mitigation: `<details>` outside table cells; regex-asserted in test. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery test`
- Drift contract test green
</verification>

<success_criteria>
- 7 composers + 7 unit tests + 1 drift contract test
- Pitfall 8 mitigation enforced via regex check
- Q-11 footer text pinned verbatim
- DELIVER-06 zero-drift contract green
- All composers pure (no Date.now / Math.random / I/O)
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-05-SUMMARY.md` listing the 7 composers + drift contract status.
</output>
