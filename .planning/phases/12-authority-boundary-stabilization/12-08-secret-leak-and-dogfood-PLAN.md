---
phase: 12-authority-boundary-stabilization
plan: 08
type: execute
wave: 4
depends_on: [12-02, 12-04, 12-06, 12-07]
files_modified:
  - packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts
  - .planning/phases/12-authority-boundary-stabilization/12-08-DOGFOOD-EVIDENCE.md
autonomous: false
requirements: [AUTH-15]
user_setup:
  - service: github
    why: "Phase 10 dogfood loop re-run on protostar-toy-ttt + secret-leak attack test sentinel must trip the redaction filter"
    env_vars:
      - name: PROTOSTAR_GITHUB_TOKEN
        source: "User's existing GitHub PAT (already required for delivery)"
      - name: PROTOSTAR_DOGFOOD_PAT
        source: "User's toy-repo PAT (per scripts/dogfood.sh)"
    dashboard_config: []
must_haves:
  truths:
    - "Secret-leak attack test passes: a target-repo `verify` script that echoes `$PROTOSTAR_GITHUB_TOKEN` does NOT leak the token shape into any persisted artifact"
    - "The attack test imports `TOKEN_PATTERNS` from `@protostar/delivery/redact` (same constant the runtime filter uses — Pitfall blindness defense)"
    - "Phase 10 dogfood loop completes ≥3 consecutive end-to-end runs against `protostar-toy-ttt` post-Phase 12 with no regression vs Phase 10 baseline"
    - "Evidence captured in `.planning/phases/12-authority-boundary-stabilization/12-08-DOGFOOD-EVIDENCE.md`"
  artifacts:
    - path: "packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts"
      provides: "Offensive test asserting token absence in evidence logs"
      contains: "ghp_TESTSENTINEL"
    - path: ".planning/phases/12-authority-boundary-stabilization/12-08-DOGFOOD-EVIDENCE.md"
      provides: "Operator evidence: ≥3 dogfood runs end-to-end green on protostar-toy-ttt"
      contains: "protostar-toy-ttt"
  key_links:
    - from: "packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts"
      to: "packages/delivery/src/redact.ts"
      via: "TOKEN_PATTERNS import (shared constant — same regex as runtime filter)"
      pattern: "from \"@protostar/delivery/redact\""
---

<objective>
Phase 12 done-criteria (D-15). Two parts:

1. **Secret-leak attack test (AUTH-15a)** — a target-repo fixture whose `package.json` `scripts.verify` is `echo TOKEN_LEAKED=$PROTOSTAR_GITHUB_TOKEN`. With `process.env.PROTOSTAR_GITHUB_TOKEN` set to a valid-shape sentinel (`ghp_TESTSENTINEL12345678901234567890123456`), invoke a minimal mechanical-checks runner against the fixture. Read every persisted artifact (`<runDir>/review/mechanical/*.{stdout,stderr}.log` + evidence JSON). Assert that no shared `TOKEN_PATTERNS` regex matches any artifact. The test imports `TOKEN_PATTERNS` from `@protostar/delivery/redact` — the same constant the runtime filter uses (Pitfall: defeat filter blindness).

2. **Phase 10 dogfood re-run (AUTH-15b)** — operator-driven, NOT automated. The plan documents the procedure; the operator runs `./scripts/dogfood.sh --runs 3` after Phase 12 lands and records evidence in `.planning/phases/12-authority-boundary-stabilization/12-08-DOGFOOD-EVIDENCE.md`. Goal: confirm the env-scrubbing + mechanical-via-repo + delivery wiring split didn't break the dogfood loop. Three runs minimum (not full DOG-04 calibration); full 10 only if smoke surfaces regression.

Purpose: Mitigates T-12-02 end-to-end via offensive test (the strongest defense — actively try to leak the token, verify it doesn't). Closes Phase 12 done-criteria.
Output: Attack test + dogfood evidence file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@AGENTS.md
@.planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md
@.planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md
@scripts/dogfood.sh
@packages/delivery/src/redact.ts

<interfaces>
**Sentinel token (valid shape, fake value):** `ghp_TESTSENTINEL12345678901234567890123456` (36+ chars after `ghp_` prefix — matches `TOKEN_PATTERNS[0]`).

**Sacrificial repo factory:** `buildSacrificialRepo` from `@protostar/repo/internal/test-fixtures` (Phase 3 plan 03-04). Allows programmable scripts.verify content.

**`scripts/dogfood.sh`:** lines 41-54 invoke `node apps/factory-cli/dist/main.js run --draft ... --executor real --planning-mode live --review-mode fixture --exec-coord-mode fixture --delivery-mode auto --trust trusted --confirmed-intent ...`. Operator-runnable — needs `PROTOSTAR_DOGFOOD_PAT` env.

**Token check at attack-test runtime:** Use `TOKEN_PATTERNS` (plural) from `@protostar/delivery/redact`, NOT a fresh regex.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: secret-leak-attack contract test</name>
  <files>packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts</files>
  <read_first>
    - packages/delivery/src/redact.ts (post-12-04 — TOKEN_PATTERNS export)
    - apps/factory-cli/src/wiring/command-execution.ts (post-12-06 — createMechanicalSubprocessRunner shape)
    - packages/repo/src/internal/test-fixtures/ (or wherever buildSacrificialRepo lives — confirm via `grep -rn buildSacrificialRepo packages/`)
    - packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts (existing test pattern — admission-e2e is `test-only` tier, fs allowed)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Secret-leak attack test design" (lines 932-967) and §"Verification" Pitfall (lines 967-967)
  </read_first>
  <behavior>
    - Setup: `process.env.PROTOSTAR_GITHUB_TOKEN = "ghp_TESTSENTINEL12345678901234567890123456"`.
    - Build a sacrificial target-repo with `package.json scripts.verify = "echo TOKEN_LEAKED=$PROTOSTAR_GITHUB_TOKEN"`.
    - Construct a minimal mechanical-checks runner invocation (using `createMechanicalSubprocessRunner` from `apps/factory-cli/src/wiring/command-execution.js` OR call `runCommand` directly with the `verify` binding) targeting the sacrificial repo's workspaceRoot, with `inheritEnv: []` (baseline only).
    - The runner spawns `pnpm run verify` inside the sacrificial repo. Because `inheritEnv` is empty, the spawned process should NOT see `PROTOSTAR_GITHUB_TOKEN`. The echo prints `TOKEN_LEAKED=` (empty value).
    - After the run completes, read every file under `<runDir>/review/mechanical/`. For each file, iterate `TOKEN_PATTERNS` (imported from `@protostar/delivery/redact`); assert NONE match.
    - Cleanup: restore the original `PROTOSTAR_GITHUB_TOKEN` value (or delete if unset before the test).
    - Bonus assertion: even if a future regression makes inheritEnv leak the token, the redaction filter applied to tail strings in `subprocess-runner.ts` should still produce `***` instead of the literal sentinel. The test passes on either defense holding.
  </behavior>
  <action>
    Create `packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts`. Reuse the runtime spawn pattern from `env-empty-default.contract.test.ts` (12-04 Task 4).

    Skeleton:
    ```typescript
    import { strict as assert } from "node:assert";
    import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { resolve, join } from "node:path";
    import { describe, it, before, after } from "node:test";
    import { TOKEN_PATTERNS } from "@protostar/delivery/redact";
    import { runCommand, MECHANICAL_COMMAND_BINDINGS } from "@protostar/repo";
    // Optional: import createMechanicalSubprocessRunner if the test goes through the wiring layer
    // import { createMechanicalSubprocessRunner } from "../../../../apps/factory-cli/dist/wiring/command-execution.js";

    const SENTINEL = "ghp_TESTSENTINEL12345678901234567890123456";

    describe("AUTH-15: secret-leak attack test", () => {
      let savedToken: string | undefined;
      let workspaceRoot: string;
      let runDir: string;

      before(async () => {
        savedToken = process.env.PROTOSTAR_GITHUB_TOKEN;
        process.env.PROTOSTAR_GITHUB_TOKEN = SENTINEL;

        workspaceRoot = await mkdtemp(join(tmpdir(), "protostar-attack-"));
        runDir = await mkdtemp(join(tmpdir(), "protostar-rundir-"));

        // Build sacrificial repo: minimal package.json + workspace marker
        await writeFile(join(workspaceRoot, "package.json"), JSON.stringify({
          name: "sacrificial-target",
          version: "0.0.0",
          scripts: {
            verify: "echo TOKEN_LEAKED=$PROTOSTAR_GITHUB_TOKEN"
          }
        }, null, 2));
        await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");

        // (optional) git init via existing test fixture helpers if needed
      });

      after(() => {
        if (savedToken === undefined) delete process.env.PROTOSTAR_GITHUB_TOKEN;
        else process.env.PROTOSTAR_GITHUB_TOKEN = savedToken;
      });

      it("PROTOSTAR_GITHUB_TOKEN sentinel does not appear in any persisted mechanical artifact", async () => {
        const verifyBinding = MECHANICAL_COMMAND_BINDINGS.verify;
        const stdoutPath = join(runDir, "verify.stdout.log");
        const stderrPath = join(runDir, "verify.stderr.log");

        // Construct the AuthorizedSubprocessOp + RunCommandOptions matching the post-Phase-3 runtime API
        // (Mirror packages/repo/src/subprocess-runner.test.ts call shape.)
        const result = await runCommand(
          {
            command: verifyBinding.command,
            args: verifyBinding.args,
            cwd: workspaceRoot,
            // resolvedEnvelope: ... (build minimal envelope matching subprocess-runner expectations)
          } as any,
          {
            stdoutPath,
            stderrPath,
            effectiveAllowlist: ["pnpm"],
            schemas: { /* pnpm schema from @protostar/repo subprocess-schemas */ } as any,
            inheritEnv: []   // baseline only — token MUST NOT cross
          }
        );

        // Read the captured artifacts
        const captured: { file: string; content: string }[] = [];
        for (const file of [stdoutPath, stderrPath]) {
          try {
            captured.push({ file, content: await readFile(file, "utf8") });
          } catch { /* tolerate missing */ }
        }
        // Also check tail strings on the result if available
        if ("stdoutTail" in result) captured.push({ file: "stdoutTail", content: (result as any).stdoutTail ?? "" });
        if ("stderrTail" in result) captured.push({ file: "stderrTail", content: (result as any).stderrTail ?? "" });

        for (const { file, content } of captured) {
          // Literal sentinel must not appear
          assert.equal(content.includes(SENTINEL), false,
            `${file} contains literal sentinel: ${content.match(new RegExp(SENTINEL))?.[0]}`);
          // No token-shape match (defense-in-depth via redaction filter — same regex as runtime)
          for (const pattern of TOKEN_PATTERNS) {
            const m = content.match(pattern);
            assert.equal(m, null,
              `${file} matched TOKEN_PATTERN ${pattern}: ${m?.[0]}`);
          }
        }
      });
    });
    ```

    Adjust the `runCommand` call shape to match the actual post-12-04 `RunCommandOptions` interface (required `inheritEnv`, schemas, etc.). Read `packages/repo/src/subprocess-runner.test.ts` for the canonical fixture shape.

    Build + test: `pnpm --filter @protostar/admission-e2e test`.

    **Critical:** the test imports `TOKEN_PATTERNS` from `@protostar/delivery/redact` (NOT a fresh inline regex). This is the load-bearing line per RESEARCH §"Anti-Patterns to Avoid" (line 360) — pattern drift between filter and attack test would let the attack pass via filter blindness.
  </action>
  <verify>
    <automated>test -f packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts &amp;&amp; grep -q 'ghp_TESTSENTINEL' packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts &amp;&amp; grep -q 'from "@protostar/delivery/redact"' packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts &amp;&amp; ! grep -E 'TOKEN_PATTERN.*=.*/' packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - File exists; imports `TOKEN_PATTERNS` from `@protostar/delivery/redact`.
    - Does NOT redefine the regex inline (no `TOKEN_PATTERN = /` literal in the file).
    - Sets `process.env.PROTOSTAR_GITHUB_TOKEN = "ghp_TESTSENTINEL..."` in `before`; restores in `after`.
    - Asserts both literal sentinel absence AND no TOKEN_PATTERNS match across all captured artifacts.
    - `pnpm --filter @protostar/admission-e2e test` exits 0 (test passes — token does NOT leak).
    - Full `pnpm run verify` exits 0.
  </acceptance_criteria>
  <done>Offensive attack test green: token shape absent from every persisted mechanical artifact when sentinel is in factory env.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Phase 12 authority hardening: verify unification, schema cascade 1.6.0, mechanical commands via @protostar/repo, env scrubbing, PatchRequest brand, three-way tier conformance, secret-leak attack test. All automated checks green.
  </what-built>
  <how-to-verify>
    Re-run the Phase 10 dogfood loop end-to-end against `protostar-toy-ttt` to confirm Phase 12 didn't break delivery, mechanical review, or env-scrubbing behavior.

    Steps:
    1. Confirm `PROTOSTAR_GITHUB_TOKEN` and `PROTOSTAR_DOGFOOD_PAT` are exported in your shell.
    2. From the repo root, run:
       ```bash
       PROTOSTAR_DOGFOOD_PAT=$PROTOSTAR_DOGFOOD_PAT ./scripts/dogfood.sh --runs 3
       ```
    3. Wait for completion (each run ≈ 2-5 minutes; 3 runs total).
    4. Inspect each run's bundle under `.protostar/runs/<runId>/` for:
       - `delivery-result.json` exists with a real PR URL.
       - `review/mechanical/*.stdout.log` does NOT contain `ghp_*` or `github_pat_*` token shapes (sanity grep — should be clean).
       - `manifest.json` final stage shows `pr-ready` or whatever the toy seed's expected terminal verdict is.
    5. Record evidence in `.planning/phases/12-authority-boundary-stabilization/12-08-DOGFOOD-EVIDENCE.md` (create if missing). Include:
       - Date + commit SHA.
       - Run IDs of the 3 runs.
       - Final verdicts (pass/fail per run).
       - Any unexpected diagnostics.
       - PR URLs created (if real PRs were opened on the toy repo).
       - Comparison to Phase 10 baseline (≥80% pr-ready threshold).
    6. If 0/3 or 1/3 reach pr-ready, STOP and surface to operator — Phase 12 has a regression. If ≥2/3 reach pr-ready, the smoke is acceptable.
    7. Per RESEARCH §"Verification" line 930: full 10 only if smoke surfaces a regression that needs more samples to triage.

    Approval signal: type "dogfood verified" or describe regressions observed.
  </how-to-verify>
  <resume-signal>Type "dogfood verified" or describe regressions observed.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory env → mechanical subprocess | Offensive test verifies the env-scrub + redaction defenses end-to-end |
| Phase 12 changes → Phase 10 dogfood loop | Dogfood re-run confirms no regression introduced |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-02 (offensive verification) | Information Disclosure | secret-leak-attack contract test + dogfood re-run | mitigate | Sentinel token actively attempted; absence verified via shared TOKEN_PATTERNS; Phase 10 loop re-run confirms operational integrity |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` includes `secret-leak-attack` passing.
- Full `pnpm run verify` green.
- Operator-driven dogfood re-run: ≥2/3 runs reach pr-ready terminal state on protostar-toy-ttt.
- `.planning/phases/12-authority-boundary-stabilization/12-08-DOGFOOD-EVIDENCE.md` exists with real run IDs + verdicts.
</verification>

<success_criteria>
- AUTH-15 satisfied: secret-leak attack test green; dogfood loop re-run end-to-end on protostar-toy-ttt with no regression.
- All Phase 12 contract tests green; full verify green; dogfood evidence captured.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-08-SUMMARY.md`
</output>
