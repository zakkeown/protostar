import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { MECHANICAL_COMMAND_BINDINGS } from "@protostar/repo";

/**
 * Phase 12 contract test (AUTH-03, AUTH-05, AUTH-14).
 *
 * Pins the structural and runtime invariants of plan 12-06:
 *   - apps/factory-cli/src/main.ts is the orchestration boundary; it MUST
 *     NOT import node:child_process and MUST NOT contain runSpawnedCommand
 *     (dead code deleted).
 *   - PROTOSTAR_GITHUB_TOKEN appears in wiring/delivery.ts but never in
 *     wiring/command-execution.ts (D-07 structural split).
 *   - MECHANICAL_COMMAND_BINDINGS keys agree with the factory-config schema
 *     enum AND with confirmed-intent.capabilityEnvelope.mechanical.allowed
 *     enum — operator config + capability envelope cannot drift apart.
 *   - The mechanical-command runtime cwd flows through to runCommand
 *     unchanged (D-05: cwd === workspaceRoot status quo).
 */

// distDir = .../packages/admission-e2e/dist/contracts → up 4 levels to repo root.
const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, "..", "..", "..", "..");

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

  it("MECHANICAL_COMMAND_BINDINGS keys match factory-config.schema.json mechanical command enum", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(REPO_ROOT, "packages/lmstudio-adapter/src/factory-config.schema.json"),
        "utf8"
      )
    ) as {
      properties: {
        mechanicalChecks: {
          properties: { commands: { items: { enum: readonly string[] } } };
        };
      };
    };
    const enumValues =
      schema.properties.mechanicalChecks.properties.commands.items.enum;
    const bindingNames = Object.keys(MECHANICAL_COMMAND_BINDINGS).sort();
    assert.deepEqual([...enumValues].sort(), bindingNames);
  });

  it("MECHANICAL_COMMAND_BINDINGS keys match confirmed-intent capabilityEnvelope.mechanical.allowed enum", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(REPO_ROOT, "packages/intent/schema/confirmed-intent.schema.json"),
        "utf8"
      )
    ) as {
      properties: {
        capabilityEnvelope: {
          properties: {
            mechanical: {
              properties: { allowed: { items: { enum: readonly string[] } } };
            };
          };
        };
      };
    };
    const enumValues =
      schema.properties.capabilityEnvelope.properties.mechanical.properties.allowed.items.enum;
    const bindingNames = Object.keys(MECHANICAL_COMMAND_BINDINGS).sort();
    assert.deepEqual([...enumValues].sort(), bindingNames);
  });

  it("PROTOSTAR_GITHUB_TOKEN appears in wiring/delivery.ts but NOT in wiring/command-execution.ts (D-07 split)", async () => {
    const delivery = await readFile(
      resolve(REPO_ROOT, "apps/factory-cli/src/wiring/delivery.ts"),
      "utf8"
    );
    const cmdExec = await readFile(
      resolve(REPO_ROOT, "apps/factory-cli/src/wiring/command-execution.ts"),
      "utf8"
    );
    assert.match(delivery, /PROTOSTAR_GITHUB_TOKEN/);
    assert.doesNotMatch(cmdExec, /PROTOSTAR_GITHUB_TOKEN/);
  });

  it("D-05: createMechanicalSubprocessRunner forwards command.cwd to runCommand unchanged", async () => {
    // Stub @protostar/repo's runCommand by recording the cwd it receives.
    // We can't easily monkey-patch the import, so we run a structural assertion:
    // command-execution.ts MUST set `cwd: command.cwd` when calling runCommand.
    const src = await readFile(
      resolve(REPO_ROOT, "apps/factory-cli/src/wiring/command-execution.ts"),
      "utf8"
    );
    // The exact wiring shape: an AuthorizedSubprocessOp built with cwd: command.cwd.
    assert.match(src, /cwd:\s*command\.cwd/);
    // And no other cwd source is hardcoded into the AuthorizedSubprocessOp.
    assert.doesNotMatch(src, /cwd:\s*"[^"]+"/);
  });
});
