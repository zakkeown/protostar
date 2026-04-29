import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { getSeed, seedLibrary } from "@protostar/fixtures";

import {
  materializeStressDraft,
  prepareStressRunInput,
  selectNextStressSeed,
  signStressConfirmedIntent
} from "./seed-materialization.js";

const tempRoots: string[] = [];

describe("stress seed materialization", () => {
  after(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("next-seed filters seed archetypes and returns deterministic round-robin metadata", () => {
    const first = selectNextStressSeed({
      seedArchetypes: ["cosmetic-tweak", "feature-add"],
      runIndex: 0
    });
    const fourth = selectNextStressSeed({
      seedArchetypes: ["cosmetic-tweak", "feature-add"],
      runIndex: 3
    });
    const wrapped = selectNextStressSeed({
      seedArchetypes: ["cosmetic-tweak", "feature-add"],
      runIndex: 4
    });

    assert.deepEqual(
      [first.seedId, fourth.seedId, wrapped.seedId],
      [
        seedLibrary["cosmetic-tweak"][0]?.id,
        seedLibrary["feature-add"][0]?.id,
        seedLibrary["cosmetic-tweak"][0]?.id
      ]
    );
    assert.equal(first.archetype, "cosmetic-tweak");
    assert.equal(fourth.archetype, "feature-add");
    assert.equal(first.strategy, "round-robin");
  });

  it("next-seed supports optional --seed-id ttt-game for final TTT delivery", () => {
    const selected = selectNextStressSeed({
      seedArchetypes: ["cosmetic-tweak", "feature-add"],
      seedId: "ttt-game",
      runIndex: 999
    });

    assert.equal(selected.seedId, "ttt-game");
    assert.equal(selected.archetype, "feature-add");
    assert.equal(selected.strategy, "seed-id");
  });

  it("materialize-draft writes intent.draft.json under .protostar/stress/<sessionId>/inputs/<runId>", async () => {
    const workspace = await tempWorkspace();
    const selection = selectNextStressSeed({
      seedArchetypes: ["feature-add"],
      seedId: "ttt-game",
      runIndex: 0
    });

    const result = await materializeStressDraft({
      workspaceRoot: workspace,
      sessionId: "stress_20260429_005",
      runId: "run_ttt_001",
      selection
    });

    assert.equal(
      result.draftPath,
      join(workspace, ".protostar", "stress", "stress_20260429_005", "inputs", "run_ttt_001", "intent.draft.json")
    );
    const draft = JSON.parse(await readFile(result.draftPath, "utf8")) as {
      readonly draftId?: string;
      readonly mode?: string;
      readonly goalArchetype?: string;
      readonly acceptanceCriteria?: readonly unknown[];
      readonly capabilityEnvelope?: { readonly delivery?: { readonly target?: { readonly repo?: string } } };
      readonly metadata?: { readonly seedId?: string };
    };
    assert.match(draft.draftId ?? "", /^draft_stress_ttt_game_0$/);
    assert.equal(draft.mode, "brownfield");
    assert.equal(draft.goalArchetype, "feature-add");
    assert.equal(draft.acceptanceCriteria?.length, getSeed("ttt-game").acceptanceCriteria.length);
    assert.equal(draft.capabilityEnvelope?.delivery?.target?.repo, "protostar-toy-ttt");
    assert.equal(draft.metadata?.seedId, "ttt-game");
  });

  it("sign-intent reuses the dogfood-compatible promote/sign path and writes confirmed-intent.json", async () => {
    const workspace = await tempWorkspace();
    await writePermissiveRepoPolicy(workspace);
    await writeFactoryConfig(workspace);
    const selection = selectNextStressSeed({
      seedArchetypes: ["feature-add"],
      seedId: "ttt-game",
      runIndex: 0
    });
    const { draftPath } = await materializeStressDraft({
      workspaceRoot: workspace,
      sessionId: "stress_20260429_006",
      runId: "run_ttt_002",
      selection
    });

    const signed = await signStressConfirmedIntent({
      workspaceRoot: workspace,
      sessionId: "stress_20260429_006",
      runId: "run_ttt_002",
      draftPath
    });

    assert.equal(
      signed.confirmedIntentPath,
      join(workspace, ".protostar", "stress", "stress_20260429_006", "inputs", "run_ttt_002", "confirmed-intent.json")
    );
    const confirmed = JSON.parse(await readFile(signed.confirmedIntentPath, "utf8")) as {
      readonly id?: string;
      readonly goalArchetype?: string;
      readonly signature?: { readonly algorithm?: string };
    };
    assert.match(confirmed.id ?? "", /^intent_/);
    assert.equal(confirmed.goalArchetype, "feature-add");
    assert.equal(typeof confirmed.signature?.algorithm, "string");
  });

  it("prepareStressRunInput returns seed metadata and materialized draft plus confirmed intent paths", async () => {
    const workspace = await tempWorkspace();
    await writePermissiveRepoPolicy(workspace);
    await writeFactoryConfig(workspace);

    const prepared = await prepareStressRunInput({
      workspaceRoot: workspace,
      sessionId: "stress_20260429_007",
      runId: "run_ttt_003",
      runIndex: 0,
      seedArchetypes: ["feature-add"],
      seedId: "ttt-game"
    });

    assert.deepEqual(
      {
        seedId: prepared.seedId,
        archetype: prepared.archetype,
        runId: prepared.runId
      },
      {
        seedId: "ttt-game",
        archetype: "feature-add",
        runId: "run_ttt_003"
      }
    );
    assert.equal(prepared.draftPath.endsWith("/intent.draft.json"), true);
    assert.equal(prepared.confirmedIntentPath.endsWith("/confirmed-intent.json"), true);
  });
});

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "stress-seed-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  return workspace;
}

async function writePermissiveRepoPolicy(workspace: string): Promise<void> {
  await mkdir(join(workspace, ".protostar"), { recursive: true });
  await writeFile(
    join(workspace, ".protostar", "repo-policy.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      repoScopes: [
        {
          workspace: "protostar-toy-ttt",
          path: ".",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "shell",
          permissionLevel: "use",
          reason: "Run bounded local commands needed to inspect and verify the toy app change.",
          risk: "low"
        },
        {
          tool: "network",
          permissionLevel: "use",
          reason: "Open the stress PR and inspect its required CI result.",
          risk: "low"
        }
      ],
      network: {
        allow: "allowlist",
        allowedHosts: ["github.com"]
      },
      budgetCaps: {
        timeoutMs: 900000,
        maxRepairLoops: 9
      },
      trustOverride: "trusted"
    })}\n`,
    "utf8"
  );
}

async function writeFactoryConfig(workspace: string): Promise<void> {
  await mkdir(join(workspace, ".protostar"), { recursive: true });
  await writeFile(
    join(workspace, ".protostar", "factory-config.json"),
    `${JSON.stringify({
      factory: {
        headlessMode: "local-daemon",
        llmBackend: "mock",
        nonInteractive: true
      }
    })}\n`,
    "utf8"
  );
}
