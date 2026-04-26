import { defineConfirmedIntent, type ConfirmedIntent, type IntentDraft } from "@protostar/intent";

import { createPlanGraph, validatePlanGraph, type PlanGraph, type PlanTask } from "./index.js";

const confirmedIntent = defineConfirmedIntent({
  id: "intent_planning_confirmed_boundary",
  title: "Prove planning only accepts confirmed intents",
  problem: "Planning APIs must not admit mutable drafts before the intent admission gate hardens them.",
  requester: "ouroboros-ac-203",
  confirmedAt: "2026-04-25T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_planning_confirmed_boundary",
      statement: "Planning APIs accept ConfirmedIntent and reject IntentDraft at compile time.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/planning",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "tsc",
        reason: "Run type-level planning API boundary checks.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["IntentDraft must be promoted before planning."]
});

const planTasks: readonly PlanTask[] = [
  {
    id: "task-confirmed-intent-boundary",
    title: "Exercise the confirmed-intent planning boundary",
    kind: "verification",
    dependsOn: [],
    covers: ["ac_planning_confirmed_boundary"],
    requiredCapabilities: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/planning",
          access: "write"
        }
      ]
    },
    risk: "low"
  }
];

const planGraph: PlanGraph = createPlanGraph({
  planId: "plan_confirmed_intent_boundary",
  intent: confirmedIntent,
  strategy: "Use TypeScript assignability as the planning admission contract.",
  tasks: planTasks,
  createdAt: "2026-04-25T00:00:00.000Z"
});

const confirmedIntentAlias: ConfirmedIntent = confirmedIntent;

validatePlanGraph({
  graph: planGraph,
  intent: confirmedIntentAlias
});

const mutableDraft: IntentDraft = {
  draftId: "draft_planning_boundary",
  title: "Draft should not plan",
  problem: "Drafts remain mutable until admission control promotes them.",
  requester: "ouroboros-ac-203",
  acceptanceCriteria: [
    {
      statement: "Drafts cannot be passed into planning APIs directly.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/planning",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "tsc",
        reason: "Reject mutable drafts at the planning type boundary.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000
    }
  },
  constraints: ["Must pass admission control first."]
};

createPlanGraph({
  planId: "plan_reject_draft_boundary",
  // @ts-expect-error IntentDraft is mutable pre-admission input, not a ConfirmedIntent.
  intent: mutableDraft,
  strategy: "This must stay rejected by the planning type boundary.",
  tasks: planTasks,
  createdAt: "2026-04-25T00:00:00.000Z"
});

validatePlanGraph({
  graph: planGraph,
  // @ts-expect-error IntentDraft cannot validate a PlanGraph because planning requires ConfirmedIntent.
  intent: mutableDraft
});
