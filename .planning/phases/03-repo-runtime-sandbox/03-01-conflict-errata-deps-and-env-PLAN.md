---
phase: 03-repo-runtime-sandbox
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - .planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
  - .planning/PROJECT.md
  - .planning/codebase/CONCERNS.md
  - .gitignore
  - .env.example
  - packages/repo/package.json
autonomous: true
requirements: [REPO-09]
must_haves:
  truths:
    - "Q-10 mechanism erratum is recorded as a dated note in 03-CONTEXT.md without rewriting the locked Q&A"
    - "PROJECT.md acknowledges TWO runtime-dep carve-outs (isomorphic-git + diff)"
    - ".env.example documents GITHUB_PAT, LM_STUDIO_ENDPOINT, LM_STUDIO_CODER_MODEL, LM_STUDIO_JUDGE_MODEL with phase annotations"
    - ".protostar/workspaces/ is gitignored"
    - "@protostar/repo declares isomorphic-git@1.37.6 and diff@9.0.0 as runtime deps"
  artifacts:
    - path: ".env.example"
      provides: "Forward-look env var documentation for Phases 3-7"
      contains: "GITHUB_PAT"
    - path: ".gitignore"
      provides: "Workspace tombstone exclusion"
      contains: ".protostar/workspaces/"
    - path: "packages/repo/package.json"
      provides: "isomorphic-git + diff dep declaration"
      contains: "isomorphic-git"
  key_links:
    - from: ".planning/PROJECT.md"
      to: ".planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md"
      via: "errata cross-reference"
      pattern: "isomorphic-git.*diff"
---

<objective>
Wave 0 foundation: surface CONFLICT-01 (Q-10 mechanism error — `isomorphic-git` exposes no apply API) as a dated CONTEXT.md erratum, rephrase the PROJECT.md "zero external runtime deps" lock to acknowledge the two real carve-outs (`isomorphic-git` + `diff`), install both deps on `@protostar/repo`, and ship `.env.example` + `.gitignore` updates per Q-17 / Q-02.

Purpose: Every downstream Wave 0+ plan depends on these deps being installed and the project-level locks being honest. CONFLICT-01 must be in the audit trail before any code calls `diff.applyPatch` instead of the `isomorphic-git.apply` Q-10 named.
Output: Errata note, PROJECT.md edit, deps installed, env-example file, gitignore line, CONCERNS.md addendum on deps-lock break + tombstone disk-fill.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/codebase/CONCERNS.md
@packages/repo/package.json

CONFLICT-01 (RESEARCH.md, lines 79-116, load-bearing): `isomorphic-git@1.37.6` exposes 73 functions; none named `apply`/`applyPatch`/`patch`/`am`/`diff`. Q-10 ("apply via isomorphic-git's apply") is mechanism-incorrect. Resolution: adopt `diff@9.0.0` (kpdecker/jsdiff) as a SECOND runtime dep on `@protostar/repo`. The *intent* of Q-10 (unified-diff + pre-image SHA-256 + best-effort) is preserved; only the *mechanism* changes.

Q-01 PROJECT.md break: research confirms TWO runtime deps land — `isomorphic-git@1.37.6` AND `diff@9.0.0`. Plus `@dogpile/sdk@0.2.0` lands on `dogpile-adapter` (Plan 12). PROJECT.md must rephrase the "zero external runtime deps" posture honestly.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Append CONFLICT-01 erratum to 03-CONTEXT.md + rephrase PROJECT.md deps-lock + add CONCERNS.md addendum</name>
  <files>.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md, .planning/PROJECT.md, .planning/codebase/CONCERNS.md</files>
  <action>
    Append (do NOT rewrite Q-10 Q&A) to `03-CONTEXT.md` a new bottom section:

    ```markdown
    ---

    ## Errata (added 2026-04-27 by /gsd-plan-phase)

    ### E-01 (Q-10 mechanism revision)

    Q-10 says "apply via isomorphic-git's apply with hash check". Verified against
    isomorphic-git@1.37.6's 73-function alphabetic index: no `apply`/`applyPatch`/
    `patch` API exists. The *intent* (unified-diff text + pre-image SHA-256 hash
    gate + best-effort partial apply per Q-12) is preserved. The *mechanism*
    revises to:

    - **Patch parse:** `diff.parsePatch(uniDiff)` from kpdecker/jsdiff
    - **Patch apply:** `diff.applyPatch(preImage, structured)` (returns `string | false`)
    - **Hash gate:** `node:crypto.createHash("sha256")` (we do this ourselves;
      `applyPatch` has no native hash check)

    `diff@9.0.0` lands as a SECOND runtime dep on `@protostar/repo` alongside
    `isomorphic-git`. PROJECT.md "zero external runtime deps" lock rephrases to
    acknowledge both carve-outs.

    Source: `.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md` §Constraint
    Conflicts CONFLICT-01.
    ```

    In `.planning/PROJECT.md`: locate the "zero external runtime deps" posture
    text (search for `zero external` or `zero-deps` or similar). Replace the lock
    statement with:

    > **Runtime dependency posture (rephrased Phase 3, 2026-04-27):** Protostar
    > maintains minimal external runtime deps. Phase 3 introduces two carve-outs
    > on `@protostar/repo` — `isomorphic-git@1.37.6` (Q-01: pure-JS git mechanics)
    > and `diff@9.0.0` (CONFLICT-01: unified-diff parse/apply mechanics). Plus
    > `@dogpile/sdk@0.2.0` on `@protostar/dogpile-adapter` (REPO-08). Any further
    > runtime-dep additions require an explicit lock-revision note here.

    If the existing lock text differs in wording or location, edit the closest
    equivalent paragraph and keep tone consistent with surrounding prose.

    In `.planning/codebase/CONCERNS.md`, append a new section under existing tech
    debt:

    ```markdown
    ## Phase 3 Concerns (added 2026-04-27)

    **Runtime-deps lock broken (intentional):**
    - Issue: PROJECT.md previously asserted "zero external runtime deps". Phase 3
      adds three: `isomorphic-git@1.37.6`, `diff@9.0.0` (both on `@protostar/repo`),
      `@dogpile/sdk@0.2.0` (on `@protostar/dogpile-adapter`). Locks rephrased
      explicitly; not a silent break.
    - Files: `packages/repo/package.json`, `packages/dogpile-adapter/package.json`
    - Impact: Operators evaluating dep posture must read the rephrased lock; the
      audit trail is in `03-CONTEXT.md` Errata E-01.

    **Tombstone disk-fill on stuck-run streak:**
    - Issue: Q-11 fresh-clone-per-run + tombstone-on-failure means a streak of
      100 failed runs accumulates 100 workspace dirs in `.protostar/workspaces/`.
      A small Tauri toy clone is ~50 MB; 100 streaks = 5 GB.
    - Mitigation: `tombstoneRetentionHours` (default 24) in `repo-policy.json`;
      operator runs `protostar-factory prune` (Phase 9) to reclaim.

    **`diff.applyPatch` is text-only (binary-not-supported):**
    - Issue: Cosmetic-tweak loop touching a `.png` icon will hit the
      `Binary files ... differ` patch placeholder. `applyChangeSet` records
      `{status: "skipped-error", error: "binary-not-supported"}` and the review
      pile decides.
    - Mitigation: Phase 3 v1 detects binary headers via `parsePatch` output and
      records as evidence. Binary-aware fallback deferred.
    ```
  </action>
  <verify>
    <automated>grep -c "Errata" .planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md | grep -v '^0$' &amp;&amp; grep -c "isomorphic-git.*diff\|diff.*isomorphic-git" .planning/PROJECT.md | grep -v '^0$' &amp;&amp; grep -c "Phase 3 Concerns" .planning/codebase/CONCERNS.md | grep -v '^0$'</automated>
  </verify>
  <done>03-CONTEXT.md has bottom Errata section with E-01 entry; PROJECT.md mentions both `isomorphic-git` and `diff` in the rephrased lock; CONCERNS.md has Phase 3 Concerns section with three subsections.</done>
</task>

<task type="auto">
  <name>Task 2: Add isomorphic-git + diff deps to @protostar/repo + update .gitignore</name>
  <files>packages/repo/package.json, .gitignore</files>
  <action>
    Run from repo root:

    ```bash
    pnpm --filter @protostar/repo add isomorphic-git@1.37.6 diff@9.0.0
    ```

    Verify the resulting `packages/repo/package.json` `dependencies` block
    contains:
    ```json
    "@protostar/authority": "workspace:*",
    "diff": "1.37.6",      // wait — verify exact pinned version landed
    "isomorphic-git": "1.37.6"
    ```
    (pnpm sorts alphabetically; pin must be `diff: "9.0.0"` and
    `isomorphic-git: "1.37.6"`.) If pnpm picked a higher patch, edit
    `package.json` to the exact pin and re-run `pnpm install`.

    Append to `.gitignore` (root) — only if not already present:
    ```
    .protostar/workspaces/
    ```
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo exec node -e 'const p=require("./package.json"); if(p.dependencies["isomorphic-git"]!=="1.37.6")process.exit(1); if(p.dependencies["diff"]!=="9.0.0")process.exit(2);' &amp;&amp; grep -q '\.protostar/workspaces/' .gitignore</automated>
  </verify>
  <done>`packages/repo/package.json` pins `isomorphic-git: "1.37.6"` and `diff: "9.0.0"`; `pnpm-lock.yaml` updated; `.gitignore` excludes `.protostar/workspaces/`.</done>
</task>

<task type="auto">
  <name>Task 3: Create .env.example with Phase 3-7 forward-look env vars</name>
  <files>.env.example</files>
  <action>
    Create `.env.example` at repo root with the four locked env vars from Q-17 +
    one-line comments naming the consuming phase. Do NOT include real values; do
    NOT include reserved/commented-out names.

    File contents (verbatim):
    ```
    # Protostar Factory — environment variables
    # Forward-look set per /gsd-discuss-phase 03 Q-17.
    # Copy to .env (gitignored) and fill in real values before running the factory.

    # GitHub PAT used by Phase 3 clone-auth (via RepoTarget.credentialRef) and
    # Phase 7 PR delivery (via Octokit). Required for private-repo clones and PR
    # creation; public-repo clones may run anonymously.
    GITHUB_PAT=

    # LM Studio HTTP endpoint (OpenAI-compatible) consumed by the Phase 4
    # ExecutionAdapter and the Phase 6/8 judge adapters. Default below assumes
    # LM Studio running locally with the standard port.
    LM_STUDIO_ENDPOINT=http://127.0.0.1:1234/v1

    # LM Studio coder model name used by Phase 4 (Phase 5 repair re-uses it).
    LM_STUDIO_CODER_MODEL=Qwen3-Coder-Next-MLX-4bit

    # LM Studio judge model name used by Phase 6 (review pile) and Phase 8
    # (semantic + consensus eval).
    LM_STUDIO_JUDGE_MODEL=Qwen3-80B-Judge-MLX
    ```

    Do not commit a `.env` file. `.env` should be gitignored (verify; add if
    missing — common pattern is `*.env` or `.env`).
  </action>
  <verify>
    <automated>test -f .env.example &amp;&amp; grep -q '^GITHUB_PAT=' .env.example &amp;&amp; grep -q '^LM_STUDIO_ENDPOINT=' .env.example &amp;&amp; grep -q '^LM_STUDIO_CODER_MODEL=' .env.example &amp;&amp; grep -q '^LM_STUDIO_JUDGE_MODEL=' .env.example</automated>
  </verify>
  <done>`.env.example` exists at repo root with exactly the four locked env vars, each preceded by a single comment line naming the consuming phase. `.env` is gitignored (verify or add).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Repo source → npm registry | `pnpm add` fetches `isomorphic-git` and `diff` over HTTPS; supply-chain is the trust hop |
| Operator → `.env` file | Secrets live in `.env`; `.env.example` is the public template |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01-01 | Tampering | npm dep install | mitigate | Pin exact versions (`1.37.6`, `9.0.0`); pnpm-lock.yaml committed; review on `pnpm install` SHA changes |
| T-03-01-02 | Information Disclosure | `.env.example` | mitigate | File contains NO real values; only var names + Phase annotations; comment explicitly tells operator to copy to `.env` (gitignored) |
| T-03-01-03 | Repudiation | CONFLICT-01 silent switch | mitigate | E-01 erratum documents the mechanism revision with sources; PROJECT.md rephrase is auditable |

</threat_model>

<validation_strategy>
- **Coverage:** REPO-09 (`.env.example` documents Phase 3-7 vars).
- **Sample frequency:** Once per task commit via `<verify>` block; full-suite gate before `/gsd-verify-work`.
- **Observability:** All three artifacts are git-tracked; the erratum is greppable; deps land in `pnpm-lock.yaml`.
- **Nyquist:** No production code; no test scaffolding required. Wave 0 grep-and-presence checks suffice.
</validation_strategy>

<verification>
- `grep -c "Errata" .planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md` ≥ 1
- `grep -c "isomorphic-git" .planning/PROJECT.md` ≥ 1 AND `grep -c "diff@" .planning/PROJECT.md` ≥ 1 (or equivalent dep-name match)
- `grep -c "Phase 3 Concerns" .planning/codebase/CONCERNS.md` = 1
- `node -e 'const p=require("./packages/repo/package.json");if(p.dependencies["isomorphic-git"]!=="1.37.6"||p.dependencies["diff"]!=="9.0.0")process.exit(1)'`
- `grep -q '\.protostar/workspaces/' .gitignore`
- `test -f .env.example && grep -q '^GITHUB_PAT=' .env.example`
</verification>

<success_criteria>
- 03-CONTEXT.md Errata section with E-01 entry exists; locked Q-10 Q&A unchanged
- PROJECT.md runtime-deps posture rephrased to acknowledge `isomorphic-git` + `diff` carve-outs
- CONCERNS.md has Phase 3 Concerns section: deps-lock break, tombstone disk-fill, binary-not-supported
- `@protostar/repo` `package.json` declares `isomorphic-git@1.37.6` and `diff@9.0.0`
- `.gitignore` excludes `.protostar/workspaces/`
- `.env.example` documents the four locked env vars per Q-17
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-01-SUMMARY.md` documenting: erratum text added, PROJECT.md rephrase wording, deps installed (with pnpm-lock.yaml diff line count), .env.example var list, CONCERNS.md addendum.
</output>
