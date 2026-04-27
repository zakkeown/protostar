---
phase: 01-intent-planning-admission
plan: 10
type: execute
wave: 4
depends_on: [01, 02, 03, 04, 05, 06, 07, 08, 09]
files_modified:
  - .github/workflows/verify.yml
autonomous: true
requirements:
  - PLAN-A-03
must_haves:
  truths:
    - ".github/workflows/verify.yml runs `pnpm install --frozen-lockfile && pnpm run verify:full` on PR and push to main (Q-12)"
    - "The workflow is a required check on main (configured in repo settings — flagged in SUMMARY for operator action since GH Actions YAML alone cannot self-require)"
    - "Workflow uses Node 22 (matches engines.node) and the pinned pnpm version 10.33.0 from package.json packageManager"
    - "Workflow exists and passes given Plan 01 (verify:full script) and Plan 02 (dogpile-types shim removed sibling-link blocker)"
    - "Phase 10 hardening (matrix builds, security scanning, dogfood) deliberately deferred — this is the minimum gate per Q-12"
  artifacts:
    - path: .github/workflows/verify.yml
      provides: "GitHub Actions workflow gating PR + main with pnpm run verify:full"
      contains: "verify:full"
  key_links:
    - from: .github/workflows/verify.yml
      to: package.json scripts.verify:full
      via: "pnpm run verify:full"
      pattern: "verify:full"
---

<objective>
Ship the minimum CI gate required by Phase 1's literal success criterion ("in CI"). The workflow runs the tiered verify (`verify:full`) on every PR and on push to main. Per Q-12. Depends on Plan 01 (verify:full script exists) and Plan 02 (dogpile-types shim — without this, `pnpm install --frozen-lockfile` fails on GH-hosted runners since no sibling dogpile/ directory exists).

Purpose: Close PLAN-A-03 in CI so admission contracts cannot regress silently. Phase 10 will harden this with matrix builds + security scanning + dogfood; Plan 10's job is to land the irreducible minimum.

Output: .github/workflows/verify.yml present and passing.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@package.json
@.planning/phases/01-intent-planning-admission/01-01-SUMMARY.md
@.planning/phases/01-intent-planning-admission/01-02-SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Author .github/workflows/verify.yml</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/package.json (engines.node = ">=22"; packageManager = "pnpm@10.33.0"; scripts.verify:full from Plan 01)
    - /Users/zakkeown/Code/protostar/.planning/phases/01-intent-planning-admission/01-01-SUMMARY.md (Plan 01 outcome — confirms verify:full was added and exit code from smoke run)
    - /Users/zakkeown/Code/protostar/.planning/phases/01-intent-planning-admission/01-02-SUMMARY.md (Plan 02 outcome — confirms sibling link removed and lockfile clean)
    - /Users/zakkeown/Code/protostar/pnpm-lock.yaml (must exist post-Plan-02; CI uses --frozen-lockfile)
  </read_first>
  <behavior>
    - Workflow file is valid YAML and parses by `yamllint` or equivalent (or by GH itself on push).
    - Triggered on: pull_request to main, push to main.
    - Single job "verify" runs on ubuntu-latest.
    - Steps in order: checkout, setup-pnpm@v4 (with version 10.33.0), setup-node@v4 (Node 22, pnpm cache), pnpm install --frozen-lockfile, pnpm run verify:full.
    - No environment secrets referenced (Phase 1 introduces no LM Studio / Octokit credentials).
  </behavior>
  <action>
    Create /Users/zakkeown/Code/protostar/.github/workflows/verify.yml. Exact content:

    ```yaml
    name: verify

    on:
      pull_request:
        branches: [main]
      push:
        branches: [main]

    jobs:
      verify:
        name: pnpm run verify:full
        runs-on: ubuntu-latest
        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Setup pnpm
            uses: pnpm/action-setup@v4
            with:
              version: 10.33.0

          - name: Setup Node.js
            uses: actions/setup-node@v4
            with:
              node-version: 22
              cache: pnpm

          - name: Install dependencies
            run: pnpm install --frozen-lockfile

          - name: Run verify:full
            run: pnpm run verify:full
    ```

    Notes:
    - pnpm version 10.33.0 matches package.json packageManager pin.
    - Node 22 matches engines.node.
    - --frozen-lockfile relies on pnpm-lock.yaml being clean post-Plan-02.
    - No matrix, no concurrency cancel, no secrets — Phase 10 will harden.

    Operator follow-up (record in SUMMARY, NOT a task acceptance gate since gh CLI configuration of branch protection is outside Claude's authority for this plan):
    - In GitHub repo settings → Branches → main, add "verify / pnpm run verify:full" as a required status check.
    - This step is human-only because it requires repo-admin auth that the workflow itself cannot self-grant.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && test -f .github/workflows/verify.yml && grep -c 'pnpm run verify:full' .github/workflows/verify.yml | xargs -I{} test {} -ge 1 && grep -c 'frozen-lockfile' .github/workflows/verify.yml | xargs -I{} test {} -ge 1 && grep -c 'node-version: 22' .github/workflows/verify.yml | xargs -I{} test {} -ge 1 && grep -c 'version: 10.33.0' .github/workflows/verify.yml | xargs -I{} test {} -ge 1 && (command -v node >/dev/null && node -e "const yaml=require('fs').readFileSync('.github/workflows/verify.yml','utf8'); if(!/^name:\s*verify/m.test(yaml)) process.exit(1); if(!/pull_request/.test(yaml)) process.exit(1); if(!/push/.test(yaml)) process.exit(1)")</automated>
  </verify>
  <acceptance_criteria>
    - .github/workflows/verify.yml exists.
    - File contains the literal string "pnpm run verify:full" (at least once).
    - File contains the literal string "frozen-lockfile" (at least once).
    - File contains "node-version: 22" (at least once).
    - File contains "version: 10.33.0" (at least once).
    - File contains both "pull_request" and "push" trigger declarations.
    - Local sanity (record in SUMMARY): running `pnpm install --frozen-lockfile && pnpm run verify:full` from a clean clone reproduces what CI will do. If this fails locally, fix the underlying cause (likely a Plan 02 / Plan 03 / Plan 06 / Plan 07 / Plan 08 / Plan 09 regression) BEFORE merging this plan — the workflow being green requires the full phase to be green.
  </acceptance_criteria>
  <done>verify.yml exists, parses, references the right scripts; SUMMARY records the operator follow-up for branch protection.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GH Actions runner ↔ repo source | The workflow runs untrusted-PR code; `--frozen-lockfile` prevents lockfile-drift attacks |
| Workflow YAML ↔ branch protection (admin-only setting) | Workflow alone cannot self-require; operator must mark it required |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-10-01 | Tampering | PR introduces a modified pnpm-lock.yaml | mitigate | --frozen-lockfile fails the install if lockfile and package.json diverge |
| T-01-10-02 | Elevation of Privilege | Workflow runs untrusted PR scripts with default GITHUB_TOKEN | accept | Phase 1 workflow has no secrets and no write permissions; default token's read-only contents access is acceptable. Phase 10 (DOG-08 security review) will revisit |
| T-01-10-03 | Repudiation | Workflow runs but is not a required check | accept | Operator action documented in SUMMARY; Phase 10 may automate via repo settings API |
</threat_model>

<verification>
- verify.yml present and valid.
- Locally, pnpm install --frozen-lockfile && pnpm run verify:full succeeds (proxies CI green).
- SUMMARY records operator branch-protection follow-up.
</verification>

<success_criteria>
PLAN-A-03 closed in CI: every PR and every push to main runs every package's tests via `pnpm run verify:full`.
</success_criteria>

<output>
After completion, create .planning/phases/01-intent-planning-admission/01-10-SUMMARY.md recording: workflow file path, the operator branch-protection follow-up reminder, and the local verify:full exit code from the final pre-merge run.
</output>
