---
phase: 11-headless-mode-e2e-stress
plan: 12
type: execute
wave: 2
depends_on:
  - 11-02
  - 11-04
files_modified:
  - packages/intent/src/capability-envelope.ts
  - packages/intent/src/capability-admission.ts
  - packages/intent/src/capability-admission.test.ts
  - packages/repo/src/pnpm-add-allowlist.ts
  - packages/repo/src/subprocess-schemas/pnpm.ts
  - packages/repo/src/subprocess-schemas/schemas.test.ts
  - packages/repo/src/subprocess-runner.test.ts
  - packages/repo/src/index.ts
  - packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts
  - .planning/SECURITY-REVIEW.md
autonomous: true
requirements:
  - STRESS-09
  - STRESS-02
must_haves:
  truths:
    - "Feature-add admission allows bounded multi-file write work without allowing immutable toy verification edits."
    - "`capabilityEnvelope.pnpm.allowedAdds` is admitted only for exact curated dependencies on the feature-add path."
    - "Feature-add admission rejects unallowlisted `pnpm add` proposals before subprocess execution."
    - "`pnpm add` is allowed only through `packages/repo` subprocess schemas."
    - "Only exact curated dependencies/specs are accepted."
    - "Rejected dependency installs produce structured subprocess refusal evidence."
  artifacts:
    - path: "packages/intent/src/capability-envelope.ts"
      provides: "feature-add pnpm.allowedAdds envelope field"
      contains: "allowedAdds"
    - path: "packages/intent/src/capability-admission.ts"
      provides: "feature-add admission validation for pnpm allowed adds and multi-file writes"
      contains: "unallowlisted-pnpm-add"
    - path: "packages/repo/src/pnpm-add-allowlist.ts"
      provides: "exact dependency allowlist"
      contains: "@playwright/test"
    - path: "packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts"
      provides: "cross-package feature-add bounded multi-file and pnpm add admission contract"
      contains: "tests/ttt-state.property.test.ts"
    - path: "packages/repo/src/subprocess-schemas/pnpm.ts"
      provides: "`pnpm add` argv schema branch"
      contains: "add"
    - path: ".planning/SECURITY-REVIEW.md"
      provides: "Phase 11 pnpm-add threat review"
      contains: "pnpm add"
  key_links:
    - from: "packages/repo/src/subprocess-schemas/pnpm.ts"
      to: "packages/repo/src/subprocess-runner.ts"
      via: "existing schema validation before spawn"
      pattern: "shell: false"
    - from: "packages/repo/src/pnpm-add-allowlist.ts"
      to: ".planning/SECURITY-REVIEW.md"
      via: "same curated dependency list"
      pattern: "fast-check"
    - from: "packages/intent/src/capability-admission.ts"
      to: "packages/repo/src/pnpm-add-allowlist.ts"
      via: "same exact dependency specs used by admission and subprocess validation"
      pattern: "PNPM_ADD_ALLOWLIST"
    - from: "packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts"
      to: "packages/planning/src/immutable-target-files.ts"
      via: "feature-add multi-file work must still reject immutable toy verification files"
      pattern: "immutable-target-file"
---

<objective>
Add a bounded `pnpm add` surface for the toy repo without bypassing repo subprocess authority.

Purpose: TTT verification and feature-add work may need curated dependencies, but arbitrary package installation is a high-risk authority expansion.
Output: repo-owned allowlist module, pnpm schema branch, tests, and security review entry.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/SECURITY-REVIEW.md
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
@packages/repo/src/subprocess-allowlist.ts
@packages/repo/src/subprocess-schemas/pnpm.ts
@packages/repo/src/subprocess-schemas/schemas.test.ts
@packages/repo/src/subprocess-runner.ts
@packages/repo/src/subprocess-runner.test.ts
@packages/intent/src/capability-envelope.ts
@packages/intent/src/capability-admission.ts
@packages/planning/src/immutable-target-files.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin feature-add envelope and admission behavior</name>
  <read_first>
    - packages/intent/src/capability-envelope.ts
    - packages/intent/src/capability-admission.ts
    - packages/intent/src/capability-admission.test.ts
    - packages/planning/src/immutable-target-files.ts
    - packages/admission-e2e/src/immutable-toy-verification.contract.test.ts
  </read_first>
  <files>packages/intent/src/capability-admission.test.ts, packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts</files>
  <action>
    Add failing tests before implementation.
    In `packages/intent/src/capability-admission.test.ts`, assert `admitFeatureAddCapabilityEnvelope` accepts bounded multi-file writes for feature-add when target files are regular app source files and `capabilityEnvelope.pnpm.allowedAdds` contains only allowlisted exact specs.
    Add rejection tests for feature-add when `pnpm.allowedAdds` includes `left-pad`, `@playwright/test@latest`, a shell-metacharacter string, or any package/spec not in `PNPM_ADD_ALLOWLIST`; expected finding/refusal code must be stable, e.g. `unallowlisted-pnpm-add`.
    Add an admission-e2e contract proving a feature-add plan can include multiple non-immutable target files plus allowed adds, while any target file under `e2e/**` or exactly `tests/ttt-state.property.test.ts` is still refused by the immutable target-file path from Plan 11-04.
    Keep this as admission validation; do not spawn `pnpm`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test -- --test-name-pattern "feature-add.*pnpm|multi-file" && pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "feature-add pnpm"</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail until `pnpm.allowedAdds` and admission validation exist.
    - Tests include `unallowlisted-pnpm-add`, `e2e/ttt.spec.ts`, and `tests/ttt-state.property.test.ts`.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin accepted and rejected `pnpm add` argv cases</name>
  <read_first>
    - packages/repo/src/subprocess-schemas/pnpm.ts
    - packages/repo/src/subprocess-schemas/schemas.test.ts
    - packages/repo/src/subprocess-runner.test.ts
  </read_first>
  <files>packages/repo/src/subprocess-schemas/schemas.test.ts, packages/repo/src/subprocess-runner.test.ts</files>
  <action>
    Add tests that accept exactly:
    `pnpm add @playwright/test@^1.59.1 -D`,
    `pnpm add fast-check@^4.7.0 -D`,
    `pnpm add clsx@^2.1.1`,
    `pnpm add zustand@^5.0.8`,
    and `pnpm add react-aria-components@^1.13.0`.
    Add rejection tests for `pnpm add left-pad`, `pnpm add @playwright/test@latest`, `pnpm add @playwright/test --ignore-scripts`, `pnpm add fast-check;rm -rf .`, `pnpm add -g fast-check`, and any package not in the allowlist.
    Assert refused cases use the existing subprocess refusal class/reason and do not spawn.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before schema implementation.
    - Accepted cases include both dev dependencies (`-D`) and runtime dependencies exactly as listed.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Implement feature-add pnpm envelope and repo-owned exact dependency allowlist</name>
  <read_first>
    - packages/intent/src/capability-envelope.ts
    - packages/intent/src/capability-admission.ts
    - packages/repo/src/subprocess-schemas/pnpm.ts
    - packages/repo/src/subprocess-allowlist.ts
    - packages/repo/src/index.ts
    - .planning/SECURITY-REVIEW.md
  </read_first>
  <files>packages/intent/src/capability-envelope.ts, packages/intent/src/capability-admission.ts, packages/repo/src/pnpm-add-allowlist.ts, packages/repo/src/subprocess-schemas/pnpm.ts, packages/repo/src/index.ts, .planning/SECURITY-REVIEW.md</files>
  <action>
    Create `packages/repo/src/pnpm-add-allowlist.ts` exporting `PNPM_ADD_ALLOWLIST` as a frozen array of `{ name, spec, dev }` for the five exact specs from Task 2.
    Add `pnpm?: { allowedAdds?: readonly string[] }` to the feature-add capability envelope shape in `packages/intent/src/capability-envelope.ts`; keep it optional and scoped to feature-add admission only. Existing cosmetic/bugfix/refactor fixtures must not be required to include it.
    In `admitFeatureAddCapabilityEnvelope`, validate each proposed add against the same exact allowlist values. Accept only the exact strings from `PNPM_ADD_ALLOWLIST`, preserving `-D`/dev intent if represented in the envelope; reject unknown names/specs and dangerous strings with stable finding code `unallowlisted-pnpm-add`.
    Keep multi-file writes bounded by existing repo scope/write grant validation and the immutable target-file refusal helper from Plan 11-04; feature-add must admit multiple normal app files but refuse `e2e/**` and `tests/ttt-state.property.test.ts`.
    Extend `packages/repo/src/subprocess-schemas/pnpm.ts` with an `add` command branch that accepts only `["add", "<name>@<spec>"]` plus optional `"-D"` when `dev: true`.
    Refuse extra flags, global installs, lifecycle-bypass flags, shell metacharacters, unknown specs, and unlisted package names. Keep `shell:false` runner unchanged.
    Export allowlist metadata from `packages/repo/src/index.ts` only if public consumers need it; otherwise keep it internal.
    Append a Phase 11 row to `.planning/SECURITY-REVIEW.md` for `pnpm add allowlist`: authority lives in `packages/repo`; runner uses `shell:false`; accepted specs are `@playwright/test@^1.59.1 -D`, `fast-check@^4.7.0 -D`, `clsx@^2.1.1`, `zustand@^5.0.8`, and `react-aria-components@^1.13.0`; arbitrary dependency install is refused.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/intent test -- --test-name-pattern "feature-add.*pnpm|multi-file" && pnpm --filter @protostar/repo test && pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "feature-add pnpm" && rg -n "pnpm add allowlist|@playwright/test@\\^1\\.59\\.1|fast-check@\\^4\\.7\\.0|shell:false" .planning/SECURITY-REVIEW.md</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "allowedAdds|unallowlisted-pnpm-add" packages/intent/src` finds envelope and admission validation.
    - `rg -n "@playwright/test@\\^1\\.59\\.1|fast-check@\\^4\\.7\\.0|react-aria-components@\\^1\\.13\\.0" packages/repo/src` finds exact specs.
    - `rg -n "ignore-scripts|--global|-g" packages/repo/src/subprocess-schemas/schemas.test.ts packages/repo/src/subprocess-runner.test.ts` finds rejection coverage.
    - Security review names every allowlisted dependency/spec exactly once.
    - No `.planning/PROJECT.md` runtime dependency lock revision is added unless execution actually adds dependencies to this repo; allowlist alone is not a dependency install.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| generated plan -> subprocess runner | Model-proposed dependency installs cross into package-manager execution. |
| feature-add intent -> admission policy | Operator/model-proposed `pnpm.allowedAdds` and multi-file writes become admitted authority. |
| allowlist -> toy repo mutation | Curated dependencies can be installed in the target workspace. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-45 | Elevation of Privilege | `pnpm add` | mitigate | Exact allowlist in `packages/repo`; reject unknown names/specs and dangerous flags. |
| T-11-46 | Tampering | package install args | mitigate | Existing argv pattern guard plus schema branch blocks shell metacharacters and globals. |
| T-11-47 | Repudiation | dependency install evidence | mitigate | Subprocess runner captures stdout/stderr/evidence and refusal reason. |
| T-11-48 | Denial of Service | lifecycle scripts | mitigate | Reject `--ignore-scripts`/unexpected flags and keep install authority behind repo runner. |
| T-11-65 | Elevation of Privilege | feature-add envelope | mitigate | `pnpm.allowedAdds` is feature-add-scoped, exact-spec validated, and immutable toy verification files remain refused. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/repo test` and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Feature-add admits bounded multi-file work and exact `pnpm.allowedAdds` only; `pnpm add` execution remains an audited, repo-owned subprocess schema and cannot become arbitrary dependency installation.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-12-SUMMARY.md`.
</output>
