import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  buildPolicySnapshot,
  buildSignatureEnvelope,
  hashPolicySnapshot,
  intersectEnvelopes
} from "@protostar/authority";
import { flattenSeedLibrary, getSeed, type Seed, type SeedArchetype } from "@protostar/fixtures";
import type { IntentDraft } from "@protostar/intent";
import { promoteAndSignIntent, promoteIntentDraft } from "@protostar/intent";

import { loadFactoryConfig } from "../load-factory-config.js";
import { loadRepoPolicy } from "../load-repo-policy.js";
import { buildTierConstraints } from "../precedence-tier-loader.js";
import { resolveStressSessionPaths } from "./stress-session.js";

export interface StressSeedSelection {
  readonly seedId: string;
  readonly archetype: SeedArchetype;
  readonly runIndex: number;
  readonly selectedIndex: number;
  readonly strategy: "round-robin" | "seed-id";
  readonly seed: Seed;
}

export interface SelectNextStressSeedInput {
  readonly seedArchetypes: readonly SeedArchetype[];
  readonly seedId?: string;
  readonly runIndex: number;
}

export interface MaterializeStressDraftInput {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly selection: StressSeedSelection;
}

export interface MaterializeStressDraftResult {
  readonly seedId: string;
  readonly archetype: SeedArchetype;
  readonly draftPath: string;
  readonly runId: string;
}

export interface SignStressConfirmedIntentInput {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly draftPath?: string;
}

export interface SignStressConfirmedIntentResult {
  readonly confirmedIntentPath: string;
  readonly intentId: string;
}

export interface PrepareStressRunInput {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly runIndex: number;
  readonly seedArchetypes: readonly SeedArchetype[];
  readonly seedId?: string;
}

export interface PreparedStressRunInput {
  readonly seedId: string;
  readonly archetype: SeedArchetype;
  readonly draftPath: string;
  readonly confirmedIntentPath: string;
  readonly runId: string;
}

export function selectNextStressSeed(input: SelectNextStressSeedInput): StressSeedSelection {
  if (!Number.isInteger(input.runIndex) || input.runIndex < 0) {
    throw new Error("--run-index must be a nonnegative integer");
  }
  const archetypes = new Set(input.seedArchetypes);
  const candidates = flattenSeedLibrary().filter((seed) => archetypes.has(seed.archetype));
  if (candidates.length === 0) {
    throw new Error("no seeds match --seed-archetypes");
  }

  if (input.seedId !== undefined) {
    const seed = getSeed(input.seedId);
    if (!archetypes.has(seed.archetype)) {
      throw new Error(`seed ${input.seedId} does not match --seed-archetypes`);
    }
    return {
      seedId: seed.id,
      archetype: seed.archetype,
      runIndex: input.runIndex,
      selectedIndex: candidates.findIndex((candidate) => candidate.id === seed.id),
      strategy: "seed-id",
      seed
    };
  }

  const selectedIndex = input.runIndex % candidates.length;
  const seed = candidates[selectedIndex];
  if (seed === undefined) {
    throw new Error("failed to select stress seed");
  }
  return {
    seedId: seed.id,
    archetype: seed.archetype,
    runIndex: input.runIndex,
    selectedIndex,
    strategy: "round-robin",
    seed
  };
}

export async function materializeStressDraft(input: MaterializeStressDraftInput): Promise<MaterializeStressDraftResult> {
  const paths = resolveStressSessionPaths(input.workspaceRoot, input.sessionId);
  const draftPath = join(paths.inputsDir, input.runId, "intent.draft.json");
  await mkdir(dirname(draftPath), { recursive: true });
  const draft = buildDraftForSeed(input.selection.seed, input.selection.runIndex);
  await writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return {
    seedId: input.selection.seedId,
    archetype: input.selection.archetype,
    draftPath,
    runId: input.runId
  };
}

export async function signStressConfirmedIntent(
  input: SignStressConfirmedIntentInput
): Promise<SignStressConfirmedIntentResult> {
  const paths = resolveStressSessionPaths(input.workspaceRoot, input.sessionId);
  const draftPath = input.draftPath ?? join(paths.inputsDir, input.runId, "intent.draft.json");
  const confirmedIntentPath = join(paths.inputsDir, input.runId, "confirmed-intent.json");
  const draft = JSON.parse(await readFile(draftPath, "utf8")) as IntentDraft;
  const promoted = promoteIntentDraft({ draft, mode: "brownfield" });
  if (!promoted.ok) {
    throw new Error(`cannot promote stress draft: ${promoted.errors.join("; ")}`);
  }

  const unsignedIntent = promoted.intent;
  const repoPolicy = await loadRepoPolicy(input.workspaceRoot);
  const precedenceDecision = intersectEnvelopes(buildTierConstraints({
    intent: unsignedIntent,
    policy: { envelope: unsignedIntent.capabilityEnvelope, source: "factory-cli:policy" },
    repoPolicy,
    operatorSettings: { envelope: unsignedIntent.capabilityEnvelope, source: "factory-cli:operator-settings" }
  }));
  if (precedenceDecision.status === "blocked-by-tier") {
    throw new Error("cannot sign stress draft: precedence decision blocked by tier");
  }

  const factoryConfig = await loadFactoryConfig(input.workspaceRoot);
  const policySnapshot = buildPolicySnapshot({
    capturedAt: unsignedIntent.confirmedAt,
    policy: {
      allowDarkRun: true,
      maxAutonomousRisk: "medium",
      requiredHumanCheckpoints: [],
      factoryConfigHash: factoryConfig.configHash
    },
    resolvedEnvelope: precedenceDecision.resolvedEnvelope,
    repoPolicy
  });
  const policySnapshotHash = hashPolicySnapshot(policySnapshot);
  const { signature: _signature, ...intentBody } = unsignedIntent;
  const signature = buildSignatureEnvelope({
    intent: intentBody,
    resolvedEnvelope: precedenceDecision.resolvedEnvelope,
    policySnapshotHash
  });
  const signedPromotion = promoteAndSignIntent({ ...intentBody, signature });
  if (!signedPromotion.ok) {
    throw new Error(`cannot sign stress draft: ${signedPromotion.errors.join("; ")}`);
  }

  await mkdir(dirname(confirmedIntentPath), { recursive: true });
  await writeFile(confirmedIntentPath, `${JSON.stringify(signedPromotion.intent, null, 2)}\n`, "utf8");
  return {
    confirmedIntentPath,
    intentId: signedPromotion.intent.id
  };
}

export async function prepareStressRunInput(input: PrepareStressRunInput): Promise<PreparedStressRunInput> {
  const selection = selectNextStressSeed({
    seedArchetypes: input.seedArchetypes,
    ...(input.seedId !== undefined ? { seedId: input.seedId } : {}),
    runIndex: input.runIndex
  });
  const materialized = await materializeStressDraft({
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    runId: input.runId,
    selection
  });
  const signed = await signStressConfirmedIntent({
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    runId: input.runId,
    draftPath: materialized.draftPath
  });
  return {
    seedId: selection.seedId,
    archetype: selection.archetype,
    draftPath: materialized.draftPath,
    confirmedIntentPath: signed.confirmedIntentPath,
    runId: input.runId
  };
}

function buildDraftForSeed(seed: Seed, runIndex: number): IntentDraft {
  if (seed.archetype === "feature-add" && seed.id === "ttt-game") {
    return buildTttDraft(seed, runIndex);
  }
  return buildCosmeticDraft(seed, runIndex);
}

function buildCosmeticDraft(seed: Seed, runIndex: number): IntentDraft {
  const targetFile = "src/components/PrimaryButton.tsx";
  return {
    draftId: `draft_stress_${safeId(seed.id)}_${runIndex}`,
    createdAt: "2026-04-29T00:00:00.000Z",
    title: `Stress ${seed.id}`,
    problem:
      `In the protostar-toy-ttt sibling repository, ${seed.intent.toLowerCase()} without changing gameplay behavior.`,
    requester: "phase-11-stress",
    mode: "brownfield",
    goalArchetype: seed.archetype,
    context: `Protostar is preparing a stress run input for the protostar-toy-ttt sibling repository, scoped to ${targetFile}.`,
    acceptanceCriteria: [
      ...seed.acceptanceCriteria.map((statement) => ({ statement, verification: "evidence" as const })),
      {
        statement:
          "The final stress report or verification evidence shows the cosmetic change landed while non-cosmetic behavior stayed unchanged.",
        verification: "evidence" as const
      }
    ],
    constraints: [
      `Keep the change scoped to ${targetFile}.`,
      "Do not edit CI configuration, package metadata, or generated build output."
    ],
    stopConditions: [
      "Stop if the factory cannot open a PR.",
      "Stop if the build-and-test check does not complete successfully within the stress timeout."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar-toy-ttt",
          path: targetFile,
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
      budget: {
        timeoutMs: 300000,
        maxRepairLoops: seed.capabilityEnvelope?.budget?.maxRepairLoops ?? 1
      },
      delivery: {
        target: {
          owner: "zakkeown",
          repo: "protostar-toy-ttt",
          baseBranch: "main"
        }
      }
    },
    metadata: {
      fixtureKind: "stress-seed",
      seedId: seed.id,
      notes: seed.notes
    }
  };
}

function buildTttDraft(seed: Seed, runIndex: number): IntentDraft {
  const repoScopes = [
    {
      workspace: "protostar-toy-ttt",
      path: "src/App.tsx",
      access: "write" as const
    },
    {
      workspace: "protostar-toy-ttt",
      path: "src/components/TicTacToeBoard.tsx",
      access: "write" as const
    },
    {
      workspace: "protostar-toy-ttt",
      path: "src/ttt/state.ts",
      access: "write" as const
    },
    {
      workspace: "protostar-toy-ttt",
      path: "playwright.config.ts",
      access: "write" as const
    }
  ] as const;

  return {
    draftId: `draft_stress_${safeId(seed.id)}_${runIndex}`,
    createdAt: "2026-04-29T00:00:00.000Z",
    title: "Build toy tic-tac-toe",
    problem:
      "Build a playable Tauri tic-tac-toe game in the protostar-toy-ttt sibling repository with complete game-state behavior and operator-authored verification left intact.",
    requester: "phase-11-stress",
    mode: "brownfield",
    goalArchetype: seed.archetype,
    context:
      "The target repository is ../protostar-toy-ttt. The implementation is bounded to ordinary source files plus playwright.config.ts only for the Playwright dev-server command. Immutable operator verification files e2e/ttt.spec.ts and tests/ttt-state.property.test.ts already exist and must pass without factory edits. The Playwright spec expects data-testid values ttt-board, ttt-status, ttt-reset, and ttt-cell-0 through ttt-cell-8; ttt-status must mention X initially, O after X moves, the winning player after a win, and draw after a draw. The property test imports ../src/ttt/state and expects createInitialTttState, applyTttMove, TttMark, and TttState exports from that module, including TttState.nextPlayer.",
    acceptanceCriteria: [
      {
        statement: "The app renders a 3 by 3 tic-tac-toe grid with exactly 9 interactive cells.",
        verification: "test"
      },
      {
        statement: "The first legal move places X, later legal moves alternate X and O, and occupied cells cannot be overwritten.",
        verification: "test"
      },
      {
        statement: "The winner detector marks all 8 rows, columns, and diagonals as terminal X or O wins.",
        verification: "test"
      },
      {
        statement: "A win displays the winning player banner and identifies the winning line for styling or accessibility.",
        verification: "test"
      },
      {
        statement: "A filled board with no winner displays a draw status.",
        verification: "test"
      },
      {
        statement: "Restart clears all 9 cells, removes winner and draw state, and sets the next player back to X.",
        verification: "test"
      },
      {
        statement: "Game state is held in React component state and no localStorage, sessionStorage, or other persistence API is used.",
        verification: "evidence"
      },
      {
        statement: "Each grid cell is keyboard accessible and activates with Space as covered by the Playwright spec.",
        verification: "test"
      },
      {
        statement: "The existing e2e/ttt.spec.ts file remains unmodified and passes in the final run.",
        verification: "evidence"
      },
      {
        statement: "The existing tests/ttt-state.property.test.ts file remains unmodified and passes in the final run.",
        verification: "evidence"
      }
    ],
    constraints: [
      "Keep implementation writes bounded to src/App.tsx, src/components/TicTacToeBoard.tsx, src/ttt/state.ts, and playwright.config.ts.",
      "Only edit playwright.config.ts if needed to make the existing Playwright webServer command bind to http://127.0.0.1:1420; for pnpm scripts, prefer pnpm run dev --host 127.0.0.1 --port 1420 rather than inserting an extra literal --.",
      "Do not create, modify, or plan new test files; final verification uses the existing operator-authored Playwright and property tests.",
      "Do not modify e2e/ttt.spec.ts.",
      "Do not modify tests/ttt-state.property.test.ts.",
      "Keep game state in React state and avoid persistence.",
      "Render data-testid=\"ttt-board\", data-testid=\"ttt-status\", data-testid=\"ttt-reset\", and data-testid=\"ttt-cell-0\" through data-testid=\"ttt-cell-8\" for the existing Playwright spec.",
      "Place ttt-board, ttt-status, ttt-reset, and ttt-cell-* data-testid attributes directly on rendered DOM elements in scoped files; do not rely on Card, NavBar, PrimaryButton, or other custom components to forward data-testid.",
      "Keep occupied cells enabled and clickable so the existing Playwright spec can click an occupied cell and observe that it remains unchanged; ignore occupied moves in applyTttMove or the click handler instead of disabling the button.",
      "While TttState.status is playing, the rendered data-testid=\"ttt-status\" text must include the current next player (X on initial render, O after X moves); when terminal, it must include the winner or draw result.",
      "Use native button elements for the tic-tac-toe cells and reset control unless the custom component source is also in scope and declares every passed prop; do not import Card, NavBar, or PrimaryButton for the tic-tac-toe board container or reset control.",
      "Implement src/ttt/state.ts with exported TttMark, TttState, createInitialTttState, and applyTttMove. Use a 9-cell board of TttMark or null, expose TttState.nextPlayer, ignore occupied or terminal moves, detect all 8 winning lines, expose the winningLine, and represent status as playing, x-won, o-won, or draw."
    ],
    stopConditions: [
      "Stop if the immutable Playwright or property tests are missing.",
      "Stop if the factory cannot open a PR.",
      "Stop if required CI checks fail or time out."
    ],
    capabilityEnvelope: {
      repoScopes,
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
      pnpm: {
        allowedAdds: [
          "@playwright/test@^1.59.1 -D",
          "fast-check@^4.7.0 -D",
          "clsx@^2.1.1",
          "zustand@^5.0.8",
          "react-aria-components@^1.13.0"
        ]
      },
      mechanical: {
        allowed: ["install", "build", "test"]
      },
      network: {
        allow: "allowlist",
        allowedHosts: ["github.com", "api.github.com", "localhost", "127.0.0.1"]
      },
      budget: {
        timeoutMs: 900000,
        adapterRetriesPerTask: 4,
        taskWallClockMs: 600000,
        deliveryWallClockMs: 600000,
        maxRepairLoops: seed.capabilityEnvelope?.budget?.maxRepairLoops ?? 9
      },
      delivery: {
        target: {
          owner: "zakkeown",
          repo: "protostar-toy-ttt",
          baseBranch: "phase11-ttt-gate"
        }
      }
    },
    metadata: {
      fixtureKind: "stress-seed",
      seedId: seed.id,
      notes: seed.notes,
      immutableVerificationFiles: ["e2e/ttt.spec.ts", "tests/ttt-state.property.test.ts"]
    }
  };
}

function safeId(input: string): string {
  return input.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
