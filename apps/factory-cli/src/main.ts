#!/usr/bin/env node

import { createFactoryRunManifest } from "@protostar/artifacts";
import { buildPlanningMission, buildReviewMission } from "@protostar/dogpile-adapter";
import { prepareExecutionRun } from "@protostar/execution";
import { defineConfirmedIntent } from "@protostar/intent";
import { createPlanGraph } from "@protostar/planning";
import { authorizeFactoryStart } from "@protostar/policy";
import { defineWorkspace } from "@protostar/repo";
import { createReviewGate } from "@protostar/review";

const intent = defineConfirmedIntent({
  id: "intent_dark_factory_scaffold",
  title: "Scaffold a dark software factory control plane",
  problem:
    "Create the first executable spine for a system that can plan, execute, review, repair, and prepare releases after intent confirmation.",
  requester: "local-operator",
  acceptanceCriteria: [
    {
      id: "ac_workspace",
      statement: "The repo has a domain-first monorepo scaffold with package boundaries for intent, planning, execution, review, policy, artifacts, repo, and Dogpile coordination.",
      verification: "evidence"
    },
    {
      id: "ac_spine",
      statement: "A CLI composition path can construct a confirmed intent, run manifest, plan graph, execution plan, and review gate.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [
      {
        workspace: "protostar",
        path: ".",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "typescript",
        reason: "Compile the factory control-plane contracts.",
        risk: "low"
      },
      {
        tool: "dogpile",
        reason: "Coordinate planning and review piles over bounded factory artifacts.",
        risk: "medium"
      }
    ],
    budget: {
      maxTokens: 60000,
      timeoutMs: 300000,
      maxRepairLoops: 2
    }
  },
  constraints: ["Dogpile is a coordination cell, not the factory authority boundary."]
});

const policyVerdict = authorizeFactoryStart(intent, {
  allowDarkRun: true,
  maxAutonomousRisk: "medium",
  requiredHumanCheckpoints: []
});

const manifest = createFactoryRunManifest({
  runId: "run_factory_scaffold",
  intentId: intent.id
});

const plan = createPlanGraph({
  planId: "plan_factory_scaffold",
  intentId: intent.id,
  strategy: "Establish typed stage contracts first, then wire Dogpile pile presets as bounded coordination cells.",
  tasks: [
    {
      id: "task-contracts",
      title: "Define factory contract packages",
      kind: "design",
      dependsOn: [],
      covers: ["ac_workspace"],
      requiredCapabilities: {},
      risk: "low"
    },
    {
      id: "task-cli-spine",
      title: "Wire CLI composition smoke path",
      kind: "implementation",
      dependsOn: ["task-contracts"],
      covers: ["ac_spine"],
      requiredCapabilities: {},
      risk: "low"
    },
    {
      id: "task-review-gate",
      title: "Create initial review gate contract",
      kind: "verification",
      dependsOn: ["task-cli-spine"],
      covers: ["ac_spine"],
      requiredCapabilities: {},
      risk: "low"
    }
  ]
});

const workspace = defineWorkspace({
  root: process.env["INIT_CWD"] ?? process.cwd(),
  trust: "trusted",
  defaultBranch: "main"
});

const execution = prepareExecutionRun({
  runId: manifest.runId,
  plan,
  workspace
});

const review = createReviewGate({
  plan,
  execution
});

const planningMission = buildPlanningMission(intent);
const reviewMission = buildReviewMission(intent, plan);

console.log(
  JSON.stringify(
    {
      policyVerdict,
      manifest,
      plan,
      execution,
      review,
      piles: {
        planning: {
          kind: planningMission.preset.kind,
          protocol: planningMission.preset.protocol,
          agents: planningMission.preset.agents.map((agent) => agent.role)
        },
        review: {
          kind: reviewMission.preset.kind,
          protocol: reviewMission.preset.protocol,
          agents: reviewMission.preset.agents.map((agent) => agent.role)
        }
      }
    },
    null,
    2
  )
);
