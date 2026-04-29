---
phase: 12-authority-boundary-stabilization
plan: 06
type: execute
wave: 2
depends_on: [12-02, 12-03, 12-04, 12-05]
files_modified:
  - packages/repo/src/mechanical-commands.ts
  - packages/repo/src/mechanical-commands.test.ts
  - packages/repo/src/index.ts
  - apps/factory-cli/src/wiring/command-execution.ts
  - apps/factory-cli/src/wiring/command-execution.test.ts
  - apps/factory-cli/src/wiring/delivery.ts
  - apps/factory-cli/src/wiring/delivery.test.ts
  - apps/factory-cli/src/wiring/review-loop.ts
  - apps/factory-cli/src/main.ts
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
  - packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts
autonomous: true
requirements: [AUTH-03, AUTH-05, AUTH-14]
must_haves:
  truths:
    - "`apps/factory-cli/src/main.ts` does NOT import `node:child_process` (raw spawn dead)"
    - "Mechanical commands run through `runCommand` from `@protostar/repo` with closed-allowlist names"
    - "`MECHANICAL_COMMAND_BINDINGS` is a frozen record mapping `verify|typecheck|lint|test` → exact `pnpm` argv"
    - "Mechanical command cwd === `config.workspaceRoot` (cloned target-repo workspace, status quo per D-05)"
    - "`apps/factory-cli/src/wiring/command-execution.ts` and `wiring/delivery.ts` exist; `main.ts` imports from them"
    - "`PROTOSTAR_GITHUB_TOKEN` site lives in `wiring/delivery.ts` (NOT in `command-execution.ts`)"
    - "Operator config can only INTERSECT the capability envelope's `mechanical.allowed[]`, not extend it"
    - "`runSpawnedCommand` and `createMechanicalSubprocessRunner` (the old raw-spawn) are deleted from `main.ts`"
  artifacts:
    - path: "packages/repo/src/mechanical-commands.ts"
      provides: "Closed mechanical command name allowlist + bindings"
      contains: "CLOSED_MECHANICAL_COMMAND_NAMES"
    - path: "apps/factory-cli/src/wiring/command-execution.ts"
      provides: "Mechanical subprocess runner via @protostar/repo runCommand"
      contains: "createMechanicalSubprocessRunner"
    - path: "apps/factory-cli/src/wiring/delivery.ts"
      provides: "Delivery wiring including PROTOSTAR_GITHUB_TOKEN site"
      contains: "PROTOSTAR_GITHUB_TOKEN"
    - path: "packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts"
      provides: "Static + integration assertion that mechanical runs via repo runner"
      contains: "node:child_process"
  key_links:
    - from: "apps/factory-cli/src/wiring/command-execution.ts"
      to: "packages/repo/src/subprocess-runner.ts"
      via: "runCommand call with inheritEnv: []"
      pattern: "runCommand\\("
    - from: "apps/factory-cli/src/main.ts"
      to: "apps/factory-cli/src/wiring/delivery.ts"
      via: "buildAndExecuteDelivery import"
      pattern: "from \"\\./wiring/delivery"
---

<objective>
Route mechanical commands through `@protostar/repo`'s `runCommand` (D-03). Lift the closed mechanical command name allowlist + per-name bindings into `@protostar/repo/mechanical-commands`. Extract `apps/factory-cli/src/wiring/{command-execution,delivery}.ts` from `main.ts` (D-14). Rewrite `wiring/review-loop.ts:configuredMechanicalCommands` to return `MechanicalCommandName[]` filtered through the capability envelope (D-04). Delete `runSpawnedCommand` + the raw `node:child_process` import from `main.ts`. Pin via contract test.

Purpose: Mitigates T-12-01 (mechanical argv injection) at runtime — every mechanical command now goes through the same allowlist + per-command schema + refusal-evidence runner that Phase 3 hardened. The PROTOSTAR_GITHUB_TOKEN site stays at the library boundary in `wiring/delivery.ts` (D-07).
Output: New `mechanical-commands` module + two new wiring files + `main.ts` decomposition + factory-config schema bump + new contract test.
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
@.planning/phases/03-repo-runtime-sandbox/03-08-subprocess-allowlist-and-schemas-PLAN.md
@apps/factory-cli/src/wiring/review-loop.ts

<interfaces>
**Closed mechanical name allowlist (D-03):**
```typescript
export const CLOSED_MECHANICAL_COMMAND_NAMES = ["verify", "typecheck", "lint", "test"] as const;
export type MechanicalCommandName = (typeof CLOSED_MECHANICAL_COMMAND_NAMES)[number];
export const MECHANICAL_COMMAND_BINDINGS: Readonly<Record<MechanicalCommandName, { command: string; args: readonly string[] }>> = Object.freeze({
  verify:    { command: "pnpm", args: ["run", "verify"] },
  typecheck: { command: "pnpm", args: ["run", "typecheck"] },
  lint:      { command: "pnpm", args: ["run", "lint"] },
  test:      { command: "pnpm", args: ["-r", "test"] }
});
```

**Existing extraction sites (apps/factory-cli/src/main.ts):**
- Line 6: `import { spawn } from "node:child_process"` — DELETE
- Lines 1192-1247: delivery flow → `wiring/delivery.ts`
- Lines 1198-1199: `process.env["PROTOSTAR_GITHUB_TOKEN"]!` — STAYS in `wiring/delivery.ts`
- Lines 1831-1871: `createMechanicalSubprocessRunner` (raw-spawn) — DELETED, replaced by `wiring/command-execution.ts:createMechanicalSubprocessRunner`
- Lines 1873-1931: `runSpawnedCommand` — DELETED entirely (dead code)
- Line 1892: the `spawn(...)` call site — gone with `runSpawnedCommand`

**Operator config schema** (`packages/lmstudio-adapter/src/factory-config.schema.json:187-199`): replace free-form `argv: string[]` with `enum: ["verify","typecheck","lint","test"]` so operator config can only INTERSECT the capability envelope, not extend it.

**`MechanicalChecksSubprocessRunner` interface** (Pitfall 4 — `create-mechanical-checks-adapter.ts:31-46`): change to accept `name: MechanicalCommandName` directly instead of `argv: readonly string[]`. Adapter caller reshape.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add @protostar/repo/mechanical-commands module</name>
  <files>packages/repo/src/mechanical-commands.ts, packages/repo/src/mechanical-commands.test.ts, packages/repo/src/index.ts, packages/repo/package.json</files>
  <read_first>
    - packages/repo/src/index.ts (current barrel)
    - packages/repo/package.json (existing exports map)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Pattern 1: Closed-Allowlist Mechanical Commands" (lines 189-234)
    - apps/factory-cli/src/wiring/review-loop.ts:115-125 (defaultMechanicalCommandsForArchetype — confirm existing argv shapes match the bindings table)
  </read_first>
  <behavior>
    - `CLOSED_MECHANICAL_COMMAND_NAMES` is a frozen tuple of `["verify","typecheck","lint","test"]`.
    - `MECHANICAL_COMMAND_BINDINGS["verify"]` returns `{ command: "pnpm", args: ["run","verify"] }` (frozen).
    - `MECHANICAL_COMMAND_BINDINGS` does NOT contain any name outside the closed allowlist.
    - `inferMechanicalName(["pnpm","run","verify"])` returns `"verify"`. (Helper for backward-compat from existing argv-shaped callers; remove once all callers pass names directly.)
    - `inferMechanicalName(["pnpm","verify"])` returns `"verify"` (existing test fixture argv shape — see Pitfall 4).
    - `inferMechanicalName(["pnpm","-r","test"])` returns `"test"`.
    - `inferMechanicalName(["echo","danger"])` returns `null` (unknown).
  </behavior>
  <action>
    Create `packages/repo/src/mechanical-commands.ts`:
    ```typescript
    /**
     * Closed allowlist of mechanical command names + per-name argv bindings.
     * Phase 12 D-03 / D-04: operators cannot declare new mechanical commands at runtime;
     * each new name requires a schema bump (currently confirmed-intent 1.6.0).
     *
     * Used by:
     *   - apps/factory-cli/src/wiring/command-execution.ts (runtime)
     *   - packages/lmstudio-adapter/src/factory-config.schema.json (operator config validation)
     *   - packages/intent/schema/confirmed-intent.schema.json (capabilityEnvelope.mechanical.allowed enum)
     */
    export const CLOSED_MECHANICAL_COMMAND_NAMES = Object.freeze(
      ["verify", "typecheck", "lint", "test"] as const
    );
    export type MechanicalCommandName = (typeof CLOSED_MECHANICAL_COMMAND_NAMES)[number];

    export const MECHANICAL_COMMAND_BINDINGS: Readonly<
      Record<MechanicalCommandName, { readonly command: string; readonly args: readonly string[] }>
    > = Object.freeze({
      verify:    { command: "pnpm", args: Object.freeze(["run", "verify"]) },
      typecheck: { command: "pnpm", args: Object.freeze(["run", "typecheck"]) },
      lint:      { command: "pnpm", args: Object.freeze(["run", "lint"]) },
      test:      { command: "pnpm", args: Object.freeze(["-r", "test"]) }
    });

    export type MechanicalCommandRefusalReason =
      | "not-in-capability-envelope"
      | "unknown-name";

    export class MechanicalCommandRefusedError extends Error {
      constructor(
        public readonly reason: MechanicalCommandRefusalReason,
        public readonly name: string
      ) {
        super(`mechanical command refused: ${reason} (${name})`);
        this.name = "MechanicalCommandRefusedError";
      }
    }

    export function isMechanicalCommandName(value: string): value is MechanicalCommandName {
      return (CLOSED_MECHANICAL_COMMAND_NAMES as readonly string[]).includes(value);
    }

    /**
     * Backward-compat helper for callers that still pass argv arrays.
     * Returns `null` if the argv doesn't match any known binding.
     * Pitfall 4: prefer migrating callers to pass `name: MechanicalCommandName` directly.
     */
    export function inferMechanicalName(argv: readonly string[]): MechanicalCommandName | null {
      for (const [name, binding] of Object.entries(MECHANICAL_COMMAND_BINDINGS)) {
        // exact match first (e.g., ["pnpm","run","verify"])
        if (argv.length === binding.args.length + 1 && argv[0] === binding.command) {
          let matches = true;
          for (let i = 0; i < binding.args.length; i++) {
            if (argv[i + 1] !== binding.args[i]) { matches = false; break; }
          }
          if (matches) return name as MechanicalCommandName;
        }
        // legacy short form: ["pnpm","verify"] / ["pnpm","lint"] (existing review-loop.ts:118-122)
        if (argv.length === 2 && argv[0] === binding.command && argv[1] === name) {
          return name as MechanicalCommandName;
        }
      }
      return null;
    }
    ```

    Test file covers all 7 behaviors above.

    Add to `packages/repo/src/index.ts`:
    ```typescript
    export {
      CLOSED_MECHANICAL_COMMAND_NAMES,
      MECHANICAL_COMMAND_BINDINGS,
      MechanicalCommandRefusedError,
      isMechanicalCommandName,
      inferMechanicalName
    } from "./mechanical-commands.js";
    export type { MechanicalCommandName, MechanicalCommandRefusalReason } from "./mechanical-commands.js";
    ```

    Add subpath export in `packages/repo/package.json` exports map:
    ```jsonc
    "./mechanical-commands": {
      "types": "./dist/mechanical-commands.d.ts",
      "import": "./dist/mechanical-commands.js"
    }
    ```
  </action>
  <verify>
    <automated>test -f packages/repo/src/mechanical-commands.ts &amp;&amp; grep -q 'CLOSED_MECHANICAL_COMMAND_NAMES' packages/repo/src/mechanical-commands.ts &amp;&amp; grep -q 'MECHANICAL_COMMAND_BINDINGS' packages/repo/src/index.ts &amp;&amp; grep -q '"./mechanical-commands"' packages/repo/package.json &amp;&amp; pnpm --filter @protostar/repo test</automated>
  </verify>
  <acceptance_criteria>
    - File exists with frozen 4-name allowlist and bindings.
    - `MechanicalCommandRefusedError` exported.
    - Subpath export wired.
    - Tests for `inferMechanicalName` cover both short-form (`pnpm verify`) and long-form (`pnpm run verify`).
    - `pnpm --filter @protostar/repo test` exits 0.
  </acceptance_criteria>
  <done>Closed allowlist + bindings live in @protostar/repo with subpath export.</done>
</task>

<task type="auto">
  <name>Task 2: Extract wiring/command-execution.ts and wiring/delivery.ts from main.ts</name>
  <files>apps/factory-cli/src/wiring/command-execution.ts, apps/factory-cli/src/wiring/command-execution.test.ts, apps/factory-cli/src/wiring/delivery.ts, apps/factory-cli/src/wiring/delivery.test.ts, apps/factory-cli/src/main.ts, apps/factory-cli/src/wiring/review-loop.ts, packages/mechanical-checks/src/create-mechanical-checks-adapter.ts</files>
  <read_first>
    - apps/factory-cli/src/main.ts (lines 1-20 for imports; lines 1192-1247 for delivery; lines 1831-1871 for createMechanicalSubprocessRunner; lines 1873-1931 for runSpawnedCommand; line 6 for the `spawn` import)
    - apps/factory-cli/src/wiring/review-loop.ts (lines 115-125, 127-143, 214-223 — the three regions per RESEARCH lines 905-921)
    - apps/factory-cli/src/wiring/index.ts (existing barrel — preflight, review-loop already wired)
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts (lines 31-46 — MechanicalChecksSubprocessRunner interface; lines 73-78, 160-167 — adapter callsite)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Wiring decomposition (D-14) — exact extraction sites" (lines 891-922)
    - packages/repo/src/subprocess-runner.ts (post-12-04 — required `inheritEnv` field)
  </read_first>
  <action>
    **Step A — Create `apps/factory-cli/src/wiring/command-execution.ts`:**

    Implement `createMechanicalSubprocessRunner` per RESEARCH §"Proposed `wiring/command-execution.ts`" (lines 542-595). Key requirements:
    - Imports: `runCommand`, `MECHANICAL_COMMAND_BINDINGS`, `MechanicalCommandRefusedError`, `MechanicalCommandName`, `inferMechanicalName` from `@protostar/repo`.
    - Returned runner accepts a `name: MechanicalCommandName` parameter directly (preferred) AND falls back to `inferMechanicalName(argv)` for legacy adapter callers (Pitfall 4).
    - Refuses with `MechanicalCommandRefusedError("not-in-capability-envelope", name)` when `name` is not in `input.allowedMechanicalCommands`.
    - Refuses with `MechanicalCommandRefusedError("unknown-name", "<argv>")` when `inferMechanicalName` returns null.
    - Calls `runCommand` with:
      - `command: binding.command`, `args: binding.args` (NOT operator-supplied argv).
      - `cwd: command.cwd` (workspaceRoot — D-05 status quo).
      - `inheritEnv: []` (baseline only — D-06/D-07).
      - existing `effectiveAllowlist` and `schemas` passed through from input.
    - Writes `stdoutPath` / `stderrPath` to `<runDir>/review/mechanical/<name>.{stdout,stderr}.log`.

    **Step B — Create `apps/factory-cli/src/wiring/delivery.ts`:**

    Move the function block at `main.ts:1192-1247` verbatim. The exported function `buildAndExecuteDelivery` (or whatever name matches the existing `runFullDeliveryPreflight + wireExecuteDelivery` chain — read lines 1192-1247 and preserve the existing function name). The PROTOSTAR_GITHUB_TOKEN read at `main.ts:1198-1199` STAYS in this file:
    ```typescript
    const token = process.env["PROTOSTAR_GITHUB_TOKEN"];
    if (token === undefined) {
      throw new Error("PROTOSTAR_GITHUB_TOKEN missing — required for delivery (Octokit + onAuth library boundary)");
    }
    // ... pass token to runFullDeliveryPreflight (in-process, never to a subprocess)
    ```
    Imports: `runFullDeliveryPreflight`, `wireExecuteDelivery`, `writeDeliveryAuthorizationPayloadAtomic`, `buildAuthorizationPayload`, `assembleDeliveryBody` (per RESEARCH line 899).

    **Step C — Update `main.ts`:**
    1. DELETE line 6: `import { spawn } from "node:child_process";`.
    2. DELETE lines 1831-1871 (the old `createMechanicalSubprocessRunner` raw-spawn version).
    3. DELETE lines 1873-1931 entirely (`runSpawnedCommand` — dead code).
    4. DELETE the inlined delivery block at 1192-1247.
    5. ADD imports:
       ```typescript
       import { createMechanicalSubprocessRunner } from "./wiring/command-execution.js";
       import { buildAndExecuteDelivery } from "./wiring/delivery.js";
       ```
    6. At the call sites where the old code was, invoke the new wiring functions.

    **Step D — Update `wiring/review-loop.ts`:**
    1. The function `configuredMechanicalCommands` at lines 214-223 currently returns `MechanicalChecksCommandConfig[]`. REWRITE it (per RESEARCH lines 905-918):
       ```typescript
       function configuredMechanicalCommands(
         factoryConfig: ResolvedFactoryConfig,
         allowedFromEnvelope: readonly MechanicalCommandName[]
       ): readonly MechanicalCommandName[] {
         const fromConfig = factoryConfig.config.mechanicalChecks?.commands ?? [];
         // Operator config now declares names (closed enum), not argv.
         return fromConfig.filter((name): name is MechanicalCommandName =>
           allowedFromEnvelope.includes(name)
         );
       }
       ```
       Update the function's caller to pass `allowedFromEnvelope = confirmedIntent.capabilityEnvelope.mechanical?.allowed ?? []`.

    2. `defaultMechanicalCommandsForArchetype` at lines 115-125 currently returns argv objects. REWRITE to return `MechanicalCommandName[]`:
       ```typescript
       export function defaultMechanicalCommandsForArchetype(archetype: Archetype): readonly MechanicalCommandName[] {
         switch (archetype) {
           case "cosmetic-tweak": return ["verify", "lint"];
           default: return ["verify"];
         }
       }
       ```

    3. `mechanicalAdapterConfig` at lines 127-143: confirm the previous plan (12-03) added `diffNameOnly`; update the `subprocess` field to use the new runner shape from `wiring/command-execution.ts` (the runner now expects `name: MechanicalCommandName` not argv).

    **Step E — Update `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`:**

    The `MechanicalChecksSubprocessRunner` interface at lines 31-46 currently accepts `argv: readonly string[]`. CHANGE to:
    ```typescript
    export interface MechanicalChecksSubprocessRunner {
      runCommand(command: {
        readonly name: MechanicalCommandName;
        readonly cwd: string;
        readonly timeoutMs?: number;
      }): Promise<MechanicalCommandResult>;
    }
    ```
    Then update lines 73-78 and 160-167 (`commandsFor` defaults) to pass `name` instead of `argv`. Adapter is now name-shape rather than argv-shape (Pitfall 4).

    **Step F — Update `packages/lmstudio-adapter/src/factory-config.schema.json`:**

    Replace lines 187-199's `mechanicalCheckCommand` block:
    ```jsonc
    "mechanicalCheckCommand": {
      "type": "string",
      "enum": ["verify", "typecheck", "lint", "test"]
    }
    ```
    The closed enum makes operator config drift impossible.

    Build + test all touched packages: `pnpm --filter @protostar/factory-cli test && pnpm --filter @protostar/mechanical-checks test && pnpm --filter @protostar/lmstudio-adapter test`.
  </action>
  <verify>
    <automated>! grep -q 'from "node:child_process"' apps/factory-cli/src/main.ts &amp;&amp; ! grep -q 'runSpawnedCommand' apps/factory-cli/src/main.ts &amp;&amp; test -f apps/factory-cli/src/wiring/command-execution.ts &amp;&amp; test -f apps/factory-cli/src/wiring/delivery.ts &amp;&amp; grep -q 'PROTOSTAR_GITHUB_TOKEN' apps/factory-cli/src/wiring/delivery.ts &amp;&amp; ! grep -q 'PROTOSTAR_GITHUB_TOKEN' apps/factory-cli/src/wiring/command-execution.ts &amp;&amp; grep -q '"enum": \["verify", "typecheck", "lint", "test"\]' packages/lmstudio-adapter/src/factory-config.schema.json &amp;&amp; pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `apps/factory-cli/src/main.ts` does NOT import `node:child_process`.
    - `runSpawnedCommand` literal does NOT appear in `main.ts`.
    - `wiring/command-execution.ts` exists and uses `runCommand` from `@protostar/repo`.
    - `wiring/delivery.ts` exists and contains `PROTOSTAR_GITHUB_TOKEN`.
    - `wiring/command-execution.ts` does NOT contain `PROTOSTAR_GITHUB_TOKEN` (structural split per D-07).
    - `factory-config.schema.json` mechanical command field is a closed `enum` of the 4 names (no `argv` array).
    - `pnpm --filter @protostar/factory-cli test` passes.
    - `pnpm --filter @protostar/mechanical-checks test` passes (adapter reshape).
    - Full `pnpm run verify` exits 0.
  </acceptance_criteria>
  <done>Mechanical commands run through @protostar/repo allowlist; wiring decomposed; raw spawn deleted; operator config closed-enum.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: mechanical-via-repo contract test</name>
  <files>packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts</files>
  <read_first>
    - apps/factory-cli/src/main.ts (post-Task 2 — confirm no child_process import)
    - apps/factory-cli/src/wiring/command-execution.ts (post-Task 2)
    - packages/repo/src/mechanical-commands.ts (post-Task 1)
    - packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts (existing static-scan pattern)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Validation Architecture" lines 1180-1183 (AUTH-03/AUTH-05 test mapping)
  </read_first>
  <behavior>
    - **Test 1 (static):** `apps/factory-cli/src/main.ts` does NOT contain `from "node:child_process"` or `from 'node:child_process'`.
    - **Test 2 (static):** No file under `apps/factory-cli/src/` other than `wiring/command-execution.ts` calls `runCommand` from `@protostar/repo` for mechanical-shaped invocations. (Approximate via grep of `runCommand` in apps/factory-cli/src/, exclude `wiring/command-execution.ts`.)
    - **Test 3 (static):** Every entry in `MECHANICAL_COMMAND_BINDINGS` matches the JSON-schema enum at `packages/lmstudio-adapter/src/factory-config.schema.json` mechanical command field AND the schema enum at `packages/intent/schema/confirmed-intent.schema.json` `capabilityEnvelope.mechanical.allowed.items.enum`.
    - **Test 4 (static):** `apps/factory-cli/src/wiring/delivery.ts` contains `PROTOSTAR_GITHUB_TOKEN`; `apps/factory-cli/src/wiring/command-execution.ts` does NOT contain `PROTOSTAR_GITHUB_TOKEN` (D-07 structural split).
    - **Test 5 (runtime — D-05 cwd pin):** Construct a minimal mechanical runner invocation; assert the `cwd` passed to `runCommand` equals the input `workspaceRoot`. (Mock or capture via a stub.)
  </behavior>
  <action>
    Create `packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts`. Reuse the file-walk helper from `env-empty-default.contract.test.ts` (12-04) — copy or co-locate.

    Skeleton:
    ```typescript
    import { strict as assert } from "node:assert";
    import { readFile } from "node:fs/promises";
    import { resolve } from "node:path";
    import { describe, it } from "node:test";
    import { CLOSED_MECHANICAL_COMMAND_NAMES, MECHANICAL_COMMAND_BINDINGS } from "@protostar/repo";

    const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

    describe("mechanical commands via @protostar/repo (AUTH-03, AUTH-05, AUTH-14)", () => {
      it("apps/factory-cli/src/main.ts does NOT import node:child_process", async () => {
        const src = await readFile(resolve(REPO_ROOT, "apps/factory-cli/src/main.ts"), "utf8");
        assert.doesNotMatch(src, /from\s+["']node:child_process["']/);
        assert.doesNotMatch(src, /require\(["']node:child_process["']\)/);
      });

      it("runSpawnedCommand is deleted from main.ts (dead code)", async () => {
        const src = await readFile(resolve(REPO_ROOT, "apps/factory-cli/src/main.ts"), "utf8");
        assert.doesNotMatch(src, /runSpawnedCommand/);
      });

      it("MECHANICAL_COMMAND_BINDINGS keys match factory-config.schema.json enum", async () => {
        const schema = JSON.parse(await readFile(resolve(REPO_ROOT, "packages/lmstudio-adapter/src/factory-config.schema.json"), "utf8"));
        // navigate to mechanicalCheckCommand.enum — adjust path to match actual schema layout
        const enumValues = /* find the enum at .properties.mechanicalChecks.properties.commands.items.enum or similar */ [];
        const bindingNames = Object.keys(MECHANICAL_COMMAND_BINDINGS).sort();
        assert.deepEqual(enumValues.slice().sort(), bindingNames);
      });

      it("MECHANICAL_COMMAND_BINDINGS keys match confirmed-intent schema mechanical.allowed enum", async () => {
        const schema = JSON.parse(await readFile(resolve(REPO_ROOT, "packages/intent/schema/confirmed-intent.schema.json"), "utf8"));
        const enumValues = /* navigate to capabilityEnvelope.properties.mechanical.properties.allowed.items.enum */ [];
        const bindingNames = Object.keys(MECHANICAL_COMMAND_BINDINGS).sort();
        assert.deepEqual(enumValues.slice().sort(), bindingNames);
      });

      it("PROTOSTAR_GITHUB_TOKEN appears in wiring/delivery.ts but NOT in wiring/command-execution.ts (D-07 split)", async () => {
        const delivery = await readFile(resolve(REPO_ROOT, "apps/factory-cli/src/wiring/delivery.ts"), "utf8");
        const cmdExec = await readFile(resolve(REPO_ROOT, "apps/factory-cli/src/wiring/command-execution.ts"), "utf8");
        assert.match(delivery, /PROTOSTAR_GITHUB_TOKEN/);
        assert.doesNotMatch(cmdExec, /PROTOSTAR_GITHUB_TOKEN/);
      });

      it("D-05: mechanical command cwd equals input workspaceRoot", async () => {
        // Runtime test — call createMechanicalSubprocessRunner with a recorded runCommand stub.
        // Capture the cwd passed to runCommand and assert it matches the input.workspaceRoot.
        // (Implementation depends on test harness — mirror packages/repo/src/subprocess-runner.test.ts pattern.)
      });
    });
    ```

    Fill in the schema-navigation paths during implementation by reading both schema files. The exact JSONPath depends on the existing schema layout — read first, then write.

    Build + test: `pnpm --filter @protostar/admission-e2e test`.
  </action>
  <verify>
    <automated>test -f packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts &amp;&amp; grep -q 'node:child_process' packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts &amp;&amp; grep -q 'PROTOSTAR_GITHUB_TOKEN' packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts &amp;&amp; grep -q 'workspaceRoot' packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - File exists with all 6 test cases listed in `<behavior>` (re-numbered 5 above; the runSpawnedCommand check counts as 6).
    - Test that asserts `child_process` absence passes.
    - Test that asserts schema-enum agreement with bindings passes.
    - Test that asserts PROTOSTAR_GITHUB_TOKEN structural split passes.
    - Test that asserts cwd === workspaceRoot passes.
    - Full `pnpm run verify` green.
  </acceptance_criteria>
  <done>Contract test pins the no-spawn-in-main, no-token-in-cmd-exec, schema-enum-agreement, and cwd-pinning invariants.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator config → mechanical runner | Closed enum at config + capability envelope at admission; no free-form argv |
| factory-cli → @protostar/repo subprocess runner | Single ingress point for all mechanical spawns; refusal evidence + per-command schema |
| factory-cli (delivery) → Octokit / onAuth library | PROTOSTAR_GITHUB_TOKEN stays at library boundary in wiring/delivery.ts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-01 | Tampering / Elevation of Privilege | `wiring/command-execution.ts` + `@protostar/repo/mechanical-commands` + `factory-config.schema.json` | mitigate | Closed allowlist of names; per-name argv binding in repo (operator cannot supply argv); raw spawn removed from factory-cli; capability envelope intersection at runtime |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` includes mechanical-via-repo contract test passing.
- Full `pnpm run verify` green.
- Manual sanity: `grep -rn "spawn(" apps/factory-cli/src/` returns no business-logic matches (test fixtures permitted).
</verification>

<success_criteria>
- AUTH-03 satisfied: mechanical commands routed through @protostar/repo runCommand; raw spawn deleted from main.ts.
- AUTH-05 satisfied: cwd === workspaceRoot pinned by contract test.
- AUTH-14 satisfied: wiring/command-execution.ts + wiring/delivery.ts extracted; PROTOSTAR_GITHUB_TOKEN structurally lives only in delivery.ts.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-06-SUMMARY.md`
</output>
