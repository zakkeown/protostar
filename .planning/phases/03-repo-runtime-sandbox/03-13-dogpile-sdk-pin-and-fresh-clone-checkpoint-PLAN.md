---
phase: 03-repo-runtime-sandbox
plan: 13
type: execute
wave: 5
depends_on: [11, 12]
files_modified:
  - packages/dogpile-adapter/package.json
  - packages/dogpile-types/package.json
  - packages/dogpile-types/src/index.ts
  - .planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md
autonomous: false
requirements: [REPO-08]
must_haves:
  truths:
    - "@dogpile/sdk@0.2.0 pinned in @protostar/dogpile-adapter (or @protostar/dogpile-types) per RESEARCH retain-as-shim recommendation"
    - "No 'link:' references remain in any package.json under packages/"
    - "On a fresh-clone machine with NO sibling ~/Code/dogpile, pnpm install succeeds (REPO-08 success-criterion)"
    - "03-VALIDATION.md filled with per-task verification map and frontmatter nyquist_compliant: true"
  artifacts:
    - path: "packages/dogpile-adapter/package.json"
      provides: "Pinned @dogpile/sdk dep (or via dogpile-types shim)"
      contains: "@dogpile/sdk"
  key_links:
    - from: "packages/dogpile-types/src/index.ts"
      to: "@dogpile/sdk"
      via: "type re-export shim"
      pattern: "from \"@dogpile/sdk"
---

<objective>
Three loosely-related Wave 5 cleanups: (1) pin `@dogpile/sdk@0.2.0` per Q-16 (and verify no sibling `link:` survives — CONFLICT-03 from prompt); (2) keep `dogpile-types` as a re-export shim per RESEARCH recommendation; (3) fill in `03-VALIDATION.md` with the per-task verification map and flip `nyquist_compliant: true`. (4) Execute the REPO-08 fresh-clone checkpoint as a `checkpoint:human-verify` task.

Purpose: REPO-08 closure + final-mile validation document + dogfeed shim hygiene.
Output: Pinned @dogpile/sdk, retained shim, filled VALIDATION.md, REPO-08 checkpoint passed by user.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@.planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md
@packages/dogpile-adapter/package.json
@packages/dogpile-types/package.json

Q-16 lock: `@dogpile/sdk@0.2.0` published; pin a version. RESEARCH recommends
**retain `dogpile-types` as a re-export shim** (preserves authority-boundary
indirection per AGENTS.md ARCH lock).

CONFLICT-03 (PATTERNS.md, lines 547-552 and confirmed in planner-time grep):
the original prompt referenced `link:../../../dogpile` at
`packages/dogpile-adapter/package.json:21` — that line is NOT in the current
manifest. So the change degenerates to: where does `@dogpile/sdk` belong?

Decision (per RESEARCH retain-shim recommendation): pin `@dogpile/sdk@0.2.0`
on `@protostar/dogpile-types`; have `dogpile-types/src/index.ts` re-export
from `@dogpile/sdk`; `dogpile-adapter` continues to depend on `dogpile-types`
(no change to adapter's deps). This maintains the indirection.

REPO-08 success criterion: `pnpm install` on a fresh-clone machine with no
sibling `~/Code/dogpile/`. This is a checkpoint task — Claude can RUN the
sequence (move sibling aside, rm node_modules, pnpm install, restore
sibling) but the verification IS the user confirming the run was clean and
no link to a sibling resolution survived.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pin @dogpile/sdk@0.2.0 on dogpile-types + retain re-export shim</name>
  <files>packages/dogpile-types/package.json, packages/dogpile-types/src/index.ts</files>
  <action>
    1. Re-grep for any `link:` references first:
    ```bash
    grep -rn '"link:' packages apps 2>/dev/null
    ```
    Document the result in commit message. If `link:` survives anywhere, replace
    with appropriate published-version pin and document.

    2. Read existing `packages/dogpile-types/src/index.ts`. It currently
    encodes types (AgentSpec, DogpileOptions, budget, convergence, firstOf)
    locally. Replace with re-exports from `@dogpile/sdk`:
    ```typescript
    export type { AgentSpec, DogpileOptions } from "@dogpile/sdk/types";
    export { budget, convergence, firstOf } from "@dogpile/sdk";
    ```

    Verify the upstream surface matches. If the upstream `@dogpile/sdk@0.2.0`
    omits a name our shim previously exported, document the gap and either
    (a) ship a wrapper preserving the name, or (b) update consumers to use
    the upstream name. Prefer (a) in this plan to avoid scope creep.

    3. Add dep:
    ```bash
    pnpm --filter @protostar/dogpile-types add @dogpile/sdk@0.2.0
    ```
    Verify pin = exactly `0.2.0` (no `^` prefix).

    4. Run `pnpm --filter @protostar/dogpile-types build` and
    `pnpm --filter @protostar/dogpile-adapter test`. Both green.

    5. If type-mismatch errors appear in dogpile-adapter (signaling upstream
    surface drift), fix the adapter to match — document each diff in commit
    body.

    Commit: `feat(03-13): pin @dogpile/sdk@0.2.0 + retain dogpile-types as re-export shim`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-types build &amp;&amp; pnpm --filter @protostar/dogpile-adapter test &amp;&amp; ! grep -rn '"link:' packages apps 2&gt;/dev/null</automated>
  </verify>
  <done>`@dogpile/sdk@0.2.0` declared on `dogpile-types`; shim re-exports; no `link:` anywhere; both packages build + test green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: REPO-08 fresh-clone install smoke (checkpoint)</name>
  <what-built>
    Phase 3 dependency hygiene work (Plan 13 Task 1 + Plans 01-12). The
    factory should `pnpm install` cleanly on a machine with NO sibling
    `~/Code/dogpile/` directory — proving REPO-08.
  </what-built>
  <how-to-verify>
    Claude will execute the following sequence (operator: confirm or interrupt
    if any step looks wrong):

    ```bash
    # Move sibling aside if present
    if [ -d ~/Code/dogpile ]; then mv ~/Code/dogpile ~/Code/dogpile.bak.$$; fi

    # Clean install
    rm -rf node_modules packages/*/node_modules apps/*/node_modules
    pnpm install --frozen-lockfile

    # Verify @dogpile/sdk resolved from registry, not link
    pnpm why @dogpile/sdk

    # Restore sibling
    if [ -d ~/Code/dogpile.bak.$$ ]; then mv ~/Code/dogpile.bak.$$ ~/Code/dogpile; fi

    # Run the smoke suite
    pnpm run verify:full
    ```

    Operator confirms:
    1. `pnpm install` completed without errors.
    2. `pnpm why @dogpile/sdk` shows the registry source (e.g., a tarball URL),
       not a `link:` resolution.
    3. `pnpm run verify:full` is green.
    4. `~/Code/dogpile` is restored to its prior state.
  </how-to-verify>
  <resume-signal>Type `approved` if all four operator-checks pass; otherwise describe the failure.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Fill 03-VALIDATION.md with per-task verification map</name>
  <files>.planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md</files>
  <action>
    Replace the empty template with concrete content:

    - Frontmatter: flip `nyquist_compliant: false` → `true`,
      `wave_0_complete: false` → `true` (after Plans 01-04 execute), and update
      `created` to today's date if not already.

    - Test infrastructure: framework `node:test` (Node 22 built-in); per-package
      `pnpm --filter <pkg> test` with build → `node --test dist/**/*.test.js`;
      full suite `pnpm run verify:full`; estimated runtime ~30s.

    - Sampling rate: as per RESEARCH.md §Sampling Rate (lines 787-791).

    - Per-Task Verification Map: enumerate every <task> across Plans 01-13
      with: task ID (e.g., `3-01-01`), plan number, wave, requirement IDs,
      threat refs, automated command, file-exists status, status `⬜ pending`.
      Use the format from the template's example row. Roughly 25-30 rows.

    - Wave 0 Requirements: list:
      - `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts` (Plan 04)
      - `packages/paths/src/resolve-workspace-root.test.ts` (Plan 02)
      - intent test cascade updates (Plan 03)
      - .env.example (Plan 01)

    - Manual-Only Verifications: REPO-08 fresh-clone install smoke (Plan 13
      Task 2 checkpoint).

    - Validation Sign-Off checklist: tick all items as planning-complete; gate
      on Plan 12 / 13 final landing for actual completion.

    Commit: `docs(03-13): fill 03-VALIDATION.md per-task map`.
  </action>
  <verify>
    <automated>head -10 .planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md | grep -q 'nyquist_compliant: true' &amp;&amp; grep -c '3-0[1-9]\|3-1[0-3]' .planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md | awk '$1 &gt;= 20 {exit 0} {exit 1}'</automated>
  </verify>
  <done>03-VALIDATION.md filled out: nyquist_compliant true; ≥20 task rows; Wave 0 Requirements section populated; Manual-Only section names the REPO-08 checkpoint.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry → install | Supply-chain trust hop for @dogpile/sdk |
| Operator filesystem (~/Code/dogpile) → fresh-clone test | Test mutates user-home dir; checkpoint contains restore |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-13-01 | Tampering | Sibling `link:` survives undetected | mitigate | Re-grep at task start; checkpoint script restores sibling. REPO-08 fresh-clone test detects link survival via `pnpm why` output. |
| T-03-13-02 | Tampering | @dogpile/sdk supply chain | mitigate | Pin exact `0.2.0`; pnpm-lock.yaml committed; advisor recommends future audit if version bumps land. |
| T-03-13-03 | Information Disclosure | Sibling restore step on hard interrupt | accept | Operator can manually `mv ~/Code/dogpile.bak.* ~/Code/dogpile` if interrupted; documented in checkpoint script. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-08 (fresh-clone install) + Phase 3 validation document.
- **Sample frequency:** Task 1 + 3 verify automated; Task 2 is operator-checkpoint.
- **Observability:** `pnpm why @dogpile/sdk` output; full-suite green; VALIDATION.md fronts the per-task map.
- **Nyquist:** REPO-08 is a one-shot smoke; the install is reproducible because the lockfile commits.
</validation_strategy>

<verification>
- `! grep -rn '"link:' packages apps 2>/dev/null`
- `node -e 'const p=require("./packages/dogpile-types/package.json"); if(p.dependencies["@dogpile/sdk"]!=="0.2.0")process.exit(1)'`
- Operator approves Task 2 checkpoint
- `head -10 .planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md` shows `nyquist_compliant: true`
- `pnpm run verify:full` green
</verification>

<success_criteria>
- `@dogpile/sdk@0.2.0` pinned; shim retained as re-export
- No `link:` anywhere in packages/ or apps/
- Operator confirms fresh-clone install works (REPO-08)
- 03-VALIDATION.md fully populated; nyquist_compliant: true
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-13-SUMMARY.md` with: dogpile-types diff, fresh-clone checkpoint operator-confirmation timestamp, VALIDATION.md row count, any upstream-surface-drift fixes shipped on the way.
</output>
