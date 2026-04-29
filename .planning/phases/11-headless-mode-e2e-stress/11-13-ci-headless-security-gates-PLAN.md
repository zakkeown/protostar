---
phase: 11-headless-mode-e2e-stress
plan: 13
type: execute
wave: 6
depends_on:
  - 11-05
  - 11-07
  - 11-10
  - 11-11
  - 11-12
  - 11-15
files_modified:
  - .github/workflows/verify.yml
  - .github/workflows/headless-stress.yml
  - packages/admission-e2e/src/no-interactive-prompts.contract.test.ts
  - packages/admission-e2e/src/headless-github-hosted.contract.test.ts
  - packages/admission-e2e/src/headless-self-hosted-runner.contract.test.ts
  - packages/admission-e2e/src/headless-local-daemon.contract.test.ts
  - packages/admission-e2e/src/hosted-secret-redaction.contract.test.ts
  - packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
  - packages/admission-e2e/package.json
  - packages/admission-e2e/tsconfig.json
  - SECURITY.md
  - .planning/SECURITY-REVIEW.md
  - .env.example
  - pnpm-lock.yaml
autonomous: true
requirements:
  - STRESS-14
  - STRESS-05
  - STRESS-06
  - STRESS-08
  - STRESS-09
  - STRESS-10
  - STRESS-12
  - STRESS-13
must_haves:
  truths:
    - "PR CI runs fast mock-backed headless smokes."
    - "Manual/scheduled stress workflow can run full phase-gate caps without making every PR pay that cost."
    - "Production source cannot introduce interactive prompts that wedge CI."
    - "Hosted API keys are documented as env-only and redacted from evidence."
    - "No merge/update-branch authority is introduced by Phase 11."
    - "Admission-e2e hosted adapter imports have explicit package.json, tsconfig, and lockfile wiring."
    - "Each locked Q-04 headless mode has an admission-e2e contract tied to its setup path."
  artifacts:
    - path: ".github/workflows/verify.yml"
      provides: "PR mock-backed headless stress smokes"
      contains: "stress:sustained"
    - path: ".github/workflows/headless-stress.yml"
      provides: "manual/scheduled full-cap headless stress workflow"
      contains: "workflow_dispatch"
    - path: "packages/admission-e2e/src/no-interactive-prompts.contract.test.ts"
      provides: "static no-prompt regression gate"
      contains: "process.stdin.on"
    - path: "packages/admission-e2e/src/headless-self-hosted-runner.contract.test.ts"
      provides: "self-hosted runner setup contract"
      contains: "docs/headless/self-hosted-runner.md"
    - path: "packages/admission-e2e/src/headless-local-daemon.contract.test.ts"
      provides: "local daemon setup contract"
      contains: "protostar-local-daemon.launchd.plist"
    - path: "packages/admission-e2e/package.json"
      provides: "test-only dependency wiring for hosted adapter contracts"
      contains: "@protostar/hosted-llm-adapter"
    - path: ".planning/SECURITY-REVIEW.md"
      provides: "Phase 11 security review rows"
      contains: "self-hosted runner"
  key_links:
    - from: ".github/workflows/headless-stress.yml"
      to: "scripts/stress.sh"
      via: "sustained-load mock smoke"
      pattern: "stress:sustained"
    - from: "packages/admission-e2e/src/no-interactive-prompts.contract.test.ts"
      to: "apps/factory-cli/src/commands/run.ts"
      via: "headless no-stdin enforcement"
      pattern: "no-prompt-exception"
    - from: "packages/admission-e2e/package.json"
      to: "packages/hosted-llm-adapter/package.json"
      via: "workspace dependency for hosted secret-redaction contract imports"
      pattern: "@protostar/hosted-llm-adapter"
    - from: "packages/admission-e2e/src/headless-github-hosted.contract.test.ts"
      to: ".github/workflows/headless-stress.yml"
      via: "GitHub-hosted setup contract validates workflow plus docs"
      pattern: "github-hosted"
    - from: "packages/admission-e2e/src/headless-local-daemon.contract.test.ts"
      to: "scripts/protostar-local-daemon.launchd.plist"
      via: "local-daemon setup contract validates sample daemon artifact"
      pattern: "local-daemon"
---

<objective>
Add CI/headless and security gates after the stress drivers exist.

Purpose: Phase 11 must prove headless operation cannot wedge on prompts, leak hosted keys, create dashboard/server surfaces, or gain merge authority.
Output: GitHub Actions workflow, static contracts, security docs, and env docs.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@SECURITY.md
@.planning/SECURITY-REVIEW.md
@.env.example
@.github/workflows/verify.yml
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
@packages/admission-e2e/src/no-dashboard-server.contract.test.ts
@scripts/stress.sh
@apps/factory-cli/src/scripts/stress.ts
@packages/admission-e2e/package.json
@packages/admission-e2e/tsconfig.json
@packages/hosted-llm-adapter/package.json
@docs/headless/github-hosted.md
@docs/headless/self-hosted-runner.md
@docs/headless/local-daemon.md
@scripts/protostar-local-daemon.launchd.plist
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add no-prompt, secret-redaction, and no-merge contracts</name>
  <read_first>
    - packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
    - packages/admission-e2e/src/no-dashboard-server.contract.test.ts
    - packages/hosted-llm-adapter/src/coder-adapter.test.ts
    - .planning/SECURITY-REVIEW.md
  </read_first>
  <files>packages/admission-e2e/package.json, packages/admission-e2e/tsconfig.json, packages/admission-e2e/src/no-interactive-prompts.contract.test.ts, packages/admission-e2e/src/headless-github-hosted.contract.test.ts, packages/admission-e2e/src/headless-self-hosted-runner.contract.test.ts, packages/admission-e2e/src/headless-local-daemon.contract.test.ts, packages/admission-e2e/src/hosted-secret-redaction.contract.test.ts, packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts, pnpm-lock.yaml</files>
  <action>
    Before adding hosted adapter imports, wire `@protostar/hosted-llm-adapter: "workspace:*"` into `packages/admission-e2e/package.json`, add `{ "path": "../hosted-llm-adapter" }` to `packages/admission-e2e/tsconfig.json` references, and run `pnpm install --lockfile-only` so `pnpm-lock.yaml` records the test-only dependency. Preserve the `@protostar/fixtures` wiring added by Plan 11-03.
    Add `no-interactive-prompts.contract.test.ts` scanning production `apps/*/src/**/*.ts` and `packages/*/src/**/*.ts`. Forbidden patterns: `from "node:readline"`, `from "readline"`, `prompts`, `inquirer`, `enquirer`, `@inquirer/`, `process.stdin.on`, and `.question(`. Allow only files with a top-of-file `// no-prompt-exception: <reason>` comment, and require a matching `.planning/SECURITY-REVIEW.md` ledger row.
    Add one admission-e2e contract per Q-04 headless mode:
    `headless-github-hosted.contract.test.ts` asserts `docs/headless/github-hosted.md` exists, references `.github/workflows/headless-stress.yml`, uses `--headless-mode github-hosted --non-interactive`, uses env-only hosted secrets, and the workflow contains `workflow_dispatch`.
    `headless-self-hosted-runner.contract.test.ts` asserts `docs/headless/self-hosted-runner.md` exists, uses `--headless-mode self-hosted-runner --non-interactive`, documents trusted single-tenant runner setup, LM Studio/local backend assumptions, residue cleanup/prune, and no checked-in secrets.
    `headless-local-daemon.contract.test.ts` asserts `docs/headless/local-daemon.md` exists, references `scripts/protostar-local-daemon.launchd.plist`, uses `--headless-mode local-daemon --non-interactive`, and the plist is sample-only and not installed by any script.
    Add `hosted-secret-redaction.contract.test.ts` proving the string `sk-test-protostar-leak-sentinel` does not appear in hosted adapter thrown errors, adapter events, stress report formatting, or event line formatting when fake failures are serialized.
    Extend or re-run the delivery no-merge contract to include Phase 11 source paths and patterns `pulls.updateBranch`, `merge_method`, `gh pr merge`, and `git merge --`.
  </action>
  <verify>
    <automated>pnpm install --lockfile-only && pnpm --filter @protostar/admission-e2e test && rg -n "@protostar/hosted-llm-adapter|packages/hosted-llm-adapter" packages/admission-e2e/package.json packages/admission-e2e/tsconfig.json pnpm-lock.yaml && rg -n "headless-github-hosted|headless-self-hosted-runner|headless-local-daemon|github-hosted|self-hosted-runner|local-daemon" packages/admission-e2e/src docs/headless scripts/protostar-local-daemon.launchd.plist</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "node:readline|process.stdin.on|no-prompt-exception|sk-test-protostar-leak-sentinel|pulls.updateBranch" packages/admission-e2e/src` finds contract coverage.
    - `rg -n "headless-github-hosted|headless-self-hosted-runner|headless-local-daemon" packages/admission-e2e/src` finds all three per-mode contracts.
    - Contracts pass with zero prompt exceptions unless a documented exception exists.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Add manual/scheduled headless stress workflow</name>
  <read_first>
    - .github/workflows/verify.yml
    - scripts/stress.sh
    - apps/factory-cli/src/scripts/stress.ts
    - package.json
  </read_first>
  <files>.github/workflows/verify.yml, .github/workflows/headless-stress.yml</files>
  <action>
    Update `.github/workflows/verify.yml` so PR CI keeps `pnpm run verify:full` and adds fast mock-backed smoke commands only: sustained-load one run, concurrency one or two sessions with mock, and fault-injection one mock timeout. Do not add full 500-run, 20-session, or 100-fault caps to PR CI.
    Create `.github/workflows/headless-stress.yml` with `workflow_dispatch` inputs `shape`, `runs`, `scenario`, `llm_backend`, and `headless_mode`, plus a weekly `schedule` using mock backend and one-run smokes. This workflow is the manual/scheduled place for full-cap phase-gate stress evidence.
    Use `actions/checkout@v4`, `pnpm/action-setup@v4` with version `10.33.0`, `actions/setup-node@v4` with Node `22`, `pnpm install --frozen-lockfile`, `pnpm run build`, and then:
    for `shape=sustained-load`, run `bash scripts/stress.sh --shape sustained-load --runs "${{ inputs.runs || '1' }}" --llm-backend "${{ inputs.llm_backend || 'mock' }}" --headless-mode "${{ inputs.headless_mode || 'github-hosted' }}"`;
    for `shape=concurrency` or `fault-injection`, run `node apps/factory-cli/dist/scripts/stress.js --shape ...`; for fault-injection, pass `${{ inputs.scenario || 'llm-timeout' }}` and document that the final Phase 11 gate runs all four scenarios (`network-drop`, `llm-timeout`, `disk-full`, `abort-signal`) even though PR CI only smokes one.
    Never reference hosted API key values directly; if `llm_backend` is hosted, use env `PROTOSTAR_HOSTED_LLM_API_KEY: ${{ secrets.PROTOSTAR_HOSTED_LLM_API_KEY }}`.
  </action>
  <verify>
    <automated>rg -n "workflow_dispatch|schedule|PROTOSTAR_HOSTED_LLM_API_KEY|scripts/stress.sh|dist/scripts/stress.js" .github/workflows/headless-stress.yml .github/workflows/verify.yml</automated>
  </verify>
  <acceptance_criteria>
    - PR workflow runs only fast mock smokes.
    - Manual/scheduled workflow defaults to mock backend for scheduled smoke.
    - No workflow runs full 500-run/20-session/100-fault caps on every PR.
    - No dashboard/server service is started.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Update security and environment documentation for Phase 11</name>
  <read_first>
    - SECURITY.md
    - .planning/SECURITY-REVIEW.md
    - .env.example
    - packages/repo/src/pnpm-add-allowlist.ts
  </read_first>
  <files>SECURITY.md, .planning/SECURITY-REVIEW.md, .env.example</files>
  <action>
    Update `SECURITY.md` secret handling to include hosted execution backend env var `PROTOSTAR_HOSTED_LLM_API_KEY`; state values must never be logged, written to run bundles, stress events, or reports.
    Add Phase 11 security-review rows for hosted API key leakage, self-hosted runner residue, no-interactive-prompts, R2 no-dashboard/event-tail observability, `pnpm add` allowlist, stress artifact concurrency corruption, and no merge/update-branch authority.
    Add `.env.example` entries for `PROTOSTAR_HOSTED_LLM_API_KEY`, `PROTOSTAR_HOSTED_LLM_BASE_URL`, and `PROTOSTAR_HOSTED_LLM_MODEL` with sample non-secret values only.
  </action>
  <verify>
    <automated>rg -n "PROTOSTAR_HOSTED_LLM_API_KEY|self-hosted runner|no-interactive|events.jsonl|pnpm add allowlist|merge/update-branch" SECURITY.md .planning/SECURITY-REVIEW.md .env.example</automated>
  </verify>
  <acceptance_criteria>
    - Security review explicitly says R2: `.protostar/stress/<sessionId>/events.jsonl`; no HTTP dashboard/server in Phase 11.
    - `.env.example` contains sample non-secret names, not real keys.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI workflow -> factory run | GitHub Actions executes headless stress commands. |
| hosted secret store -> adapter | Hosted key enters runtime through CI/env. |
| source scan -> production behavior | Static contracts prevent prompt/server/merge regressions. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-49 | Information Disclosure | hosted API key | mitigate | Env-only docs, secret-redaction contract, no report/event secret fields. |
| T-11-50 | Denial of Service | interactive prompts | mitigate | Static no-prompt contract and per-mode headless setup contracts block stdin/question prompt APIs. |
| T-11-51 | Information Disclosure | self-hosted runner residue | mitigate | SECURITY review documents trusted single-tenant runner requirement and prune scope. |
| T-11-52 | Tampering | accidental merge/update-branch | mitigate | No-merge contract scans Phase 11 source for merge/update-branch strings. |
| T-11-53 | Tampering | stress artifact corruption | mitigate | CI uses Plan 11-09 atomic/append-only writers and tests. |
| T-11-68 | Repudiation | headless mode setup | mitigate | Admission-e2e contracts pin docs/config artifacts for github-hosted, self-hosted-runner, and local-daemon modes. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/admission-e2e test`, `rg` checks against workflow/docs, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Headless CI and security gates are in place: prompt-free, secret-safe, dashboard-free, no-merge, per-mode setup contracted, and scoped to fast mock smokes by default.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-13-SUMMARY.md`.
</output>
