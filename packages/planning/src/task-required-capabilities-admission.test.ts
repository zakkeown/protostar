import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  classifyPlanTaskPreHandoffVerificationTriggers,
  classifyPlanTaskReleaseGrantConditions,
  collectPlanTaskCapabilityRequirements,
  createPlanningAdmissionArtifact,
  createPlanGraph,
  validatePlanGraph,
  type PlanGraph,
  type PlanGraphValidationViolation,
  type PlanningAdmissionPreHandoffVerificationTrigger,
  type PlanningAdmissionReleaseGrantCondition,
  type PlanTaskCapabilityAdmissionResult,
  type PlanTaskCapabilityRequirement,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_task_required_capabilities",
  title: "Reject task capability envelopes outside normalized shape",
  problem: "Execution must receive task capability requirements in the same normalized envelope shape as policy.",
  requester: "ouroboros-ac-30002",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_task_capabilities_shape",
      statement: "Each candidate plan task exposes required capabilities in normalized capability-envelope shape.",
      verification: "test"
    },
    {
      id: "ac_task_capabilities_collect_all",
      statement: "Task capability-shape admission records every malformed capability field in one validation pass.",
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
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run the task required-capabilities planning admission fixture.",
        risk: "low"
      }
    ],
    executeGrants: [
      {
        command: "pnpm --filter @protostar/planning test",
        scope: "packages/planning",
        reason: "Run the planning package test gate."
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Candidate plan tasks must not smuggle ad hoc capability shapes into execution."]
});

const acceptedCriteria = admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
  id,
  statement,
  verification
}));

const normalizedRequiredCapabilities = {
  repoScopes: [
    {
      workspace: "protostar",
      path: "packages/planning",
      access: "write"
    }
  ],
  toolPermissions: [
    {
      tool: "node:test",
      permissionLevel: "execute",
      reason: "Verify normalized task capability requirements.",
      risk: "low"
    }
  ],
  executeGrants: [
    {
      command: "pnpm --filter @protostar/planning test",
      scope: "packages/planning",
      reason: "Run the planning package test gate."
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const exactIntentRequiredCapabilities: PlanTaskRequiredCapabilities = admittedIntent.capabilityEnvelope;

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

describe("PlanGraph task required-capabilities admission boundary", () => {
  it("admits tasks that expose normalized capability-envelope requirements", () => {
    const graph = createPlanGraph({
      planId: "plan_task_required_capabilities_shape",
      intent: admittedIntent,
      strategy: "Admit tasks whose required capabilities are already normalized for policy and execution.",
      tasks: [
        {
          id: "task-normalized-capabilities",
          title: "Verify normalized task capability requirements",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_capabilities_shape", "ac_task_capabilities_collect_all"],
          requiredCapabilities: normalizedRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.violations, []);
    assert.deepEqual(validation.errors, []);
  });

  it("admits candidate plans whose task capabilities exactly match the confirmed intent envelope", () => {
    const clonedExactIntentRequiredCapabilities = {
      repoScopes: exactIntentRequiredCapabilities.repoScopes.map((scope) => ({ ...scope })),
      toolPermissions: exactIntentRequiredCapabilities.toolPermissions.map((permission) => ({ ...permission })),
      ...(exactIntentRequiredCapabilities.executeGrants !== undefined
        ? {
            executeGrants: exactIntentRequiredCapabilities.executeGrants.map((grant) => ({ ...grant }))
          }
        : {}),
      workspace: { allowDirty: exactIntentRequiredCapabilities.workspace?.allowDirty ?? false },
      ...(exactIntentRequiredCapabilities.network !== undefined
        ? { network: { ...exactIntentRequiredCapabilities.network } }
        : {}),
      budget: { ...exactIntentRequiredCapabilities.budget }
    } as const satisfies PlanTaskRequiredCapabilities;
    const candidatePlans: readonly {
      readonly planId: string;
      readonly taskId: PlanTask["id"];
      readonly title: string;
      readonly requiredCapabilities: PlanTaskRequiredCapabilities;
    }[] = [
      {
        planId: "plan_task_required_capabilities_exact_envelope_reference",
        taskId: "task-admit-exact-envelope-reference",
        title: "Admit the confirmed intent envelope by reference",
        requiredCapabilities: exactIntentRequiredCapabilities
      },
      {
        planId: "plan_task_required_capabilities_exact_envelope_structural_copy",
        taskId: "task-admit-exact-envelope-structural-copy",
        title: "Admit a structural copy of the confirmed intent envelope",
        requiredCapabilities: clonedExactIntentRequiredCapabilities
      }
    ];

    for (const candidatePlan of candidatePlans) {
      assert.deepEqual(candidatePlan.requiredCapabilities, admittedIntent.capabilityEnvelope);

      const graph = createPlanGraph({
        planId: candidatePlan.planId,
        intent: admittedIntent,
        strategy: "Admit a candidate plan whose task authority exactly matches the confirmed intent envelope.",
        tasks: [
          {
            id: candidatePlan.taskId,
            title: candidatePlan.title,
            kind: "verification",
            dependsOn: [],
            covers: ["ac_task_capabilities_shape", "ac_task_capabilities_collect_all"],
            requiredCapabilities: candidatePlan.requiredCapabilities,
            risk: "low"
          }
        ],
        createdAt: "2026-04-26T00:00:00.000Z"
      });
      const expectedCapabilityAdmissions: readonly PlanTaskCapabilityAdmissionResult[] = [
        {
          taskId: candidatePlan.taskId,
          requestedCapabilities: candidatePlan.requiredCapabilities,
          admittedCapabilities: candidatePlan.requiredCapabilities,
          verdict: "allow"
        }
      ];

      const validation = validatePlanGraph({
        graph,
        intent: admittedIntent
      });

      assert.equal(validation.ok, true);
      assert.deepEqual(validation.violations, []);
      assert.deepEqual(validation.capabilityViolationDiagnostics, []);
      assert.deepEqual(validation.errors, []);
      assert.deepEqual(validation.taskCapabilityRequirements, [
        {
          taskId: candidatePlan.taskId,
          requiredCapabilities: candidatePlan.requiredCapabilities
        }
      ]);
      assert.deepEqual(validation.taskCapabilityAdmissions, expectedCapabilityAdmissions);

      const artifact = createPlanningAdmissionArtifact({
        graph,
        intent: admittedIntent
      });

      assert.equal(artifact.decision, "allow");
      assert.equal(artifact.admitted, true);
      assert.deepEqual(artifact.details.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    }
  });

  it("admits candidate plans whose task capabilities are allowed subsets of the confirmed intent envelope", () => {
    const candidatePlans: readonly {
      readonly planId: string;
      readonly taskId: PlanTask["id"];
      readonly title: string;
      readonly requiredCapabilities: PlanTaskRequiredCapabilities;
    }[] = [
      {
        planId: "plan_task_required_capabilities_allowed_repo_tool_budget_subset",
        taskId: "task-admit-repo-tool-budget-subset",
        title: "Admit narrower repo, tool, and budget requirements",
        requiredCapabilities: {
          repoScopes: [
            {
              workspace: "protostar",
              path: "packages/planning/src",
              access: "read"
            }
          ],
          toolPermissions: [
            {
              tool: "node:test",
              permissionLevel: "use",
              reason: "Run the allowed subset planning admission fixture.",
              risk: "low"
            }
          ],
          budget: {
            timeoutMs: 10_000,
            maxRepairLoops: 0
          }
        }
      },
      {
        planId: "plan_task_required_capabilities_allowed_empty_authority_subset",
        taskId: "task-admit-empty-authority-subset",
        title: "Admit empty task authority requirements",
        requiredCapabilities: {
          repoScopes: [],
          toolPermissions: [
            {
              tool: "node:test",
              reason: "Use the admitted test tool at its default permission level.",
              risk: "low"
            }
          ],
          budget: {}
        }
      },
      {
        planId: "plan_task_required_capabilities_allowed_execute_grant_subset",
        taskId: "task-admit-execute-grant-subset",
        title: "Admit exact execute grant with bounded budget",
        requiredCapabilities: {
          repoScopes: [],
          toolPermissions: [],
          executeGrants: [
            {
              command: "pnpm --filter @protostar/planning test",
              scope: "packages/planning",
              reason: "Run the planning package test gate."
            }
          ],
          budget: {
            timeoutMs: 30_000,
            maxRepairLoops: 0
          }
        }
      }
    ];

    for (const candidatePlan of candidatePlans) {
      const graph = createPlanGraph({
        planId: candidatePlan.planId,
        intent: admittedIntent,
        strategy: "Admit a candidate plan whose task authority is a subset of the confirmed intent envelope.",
        tasks: [
          {
            id: candidatePlan.taskId,
            title: candidatePlan.title,
            kind: "verification",
            dependsOn: [],
            covers: ["ac_task_capabilities_shape", "ac_task_capabilities_collect_all"],
            requiredCapabilities: candidatePlan.requiredCapabilities,
            risk: "low"
          }
        ],
        createdAt: "2026-04-26T00:00:00.000Z"
      });
      const expectedCapabilityAdmissions: readonly PlanTaskCapabilityAdmissionResult[] = [
        {
          taskId: candidatePlan.taskId,
          requestedCapabilities: candidatePlan.requiredCapabilities,
          admittedCapabilities: candidatePlan.requiredCapabilities,
          verdict: "allow"
        }
      ];

      const validation = validatePlanGraph({
        graph,
        intent: admittedIntent
      });

      assert.equal(validation.ok, true);
      assert.deepEqual(validation.violations, []);
      assert.deepEqual(validation.errors, []);
      assert.deepEqual(validation.taskCapabilityRequirements, [
        {
          taskId: candidatePlan.taskId,
          requiredCapabilities: candidatePlan.requiredCapabilities
        }
      ]);
      assert.deepEqual(validation.taskCapabilityAdmissions, expectedCapabilityAdmissions);

      const artifact = createPlanningAdmissionArtifact({
        graph,
        intent: admittedIntent
      });

      assert.equal(artifact.decision, "allow");
      assert.equal(artifact.admitted, true);
      assert.deepEqual(artifact.details.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    }
  });

  it("extracts normalized capability requirements from every candidate plan task during admission", () => {
    const candidateCapabilities = {
      repoScopes: [
        {
          workspace: " protostar ",
          path: " packages/planning/src ",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: " node:test ",
          permissionLevel: "execute",
          reason: " Verify normalized task capability requirements. ",
          risk: "low"
        }
      ],
      executeGrants: [
        {
          command: " pnpm --filter @protostar/planning test ",
          scope: " packages/planning ",
          reason: " Run the planning package test gate. "
        }
      ],
      budget: {
        timeoutMs: 30_000,
        maxRepairLoops: 0,
        evidenceCopy: "must not appear in the normalized capability envelope"
      }
    } as unknown as PlanTaskRequiredCapabilities;
    const secondTaskCapabilities = {
      repoScopes: [],
      toolPermissions: [],
      budget: {}
    } as const satisfies PlanTaskRequiredCapabilities;

    const graph = createPlanGraph({
      planId: "plan_task_required_capabilities_extraction",
      intent: admittedIntent,
      strategy: "Extract task-local authority requirements as normalized capability envelopes.",
      tasks: [
        {
          id: "task-normalize-capability-requirements",
          title: "Normalize task capability requirements",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_capabilities_shape"],
          requiredCapabilities: candidateCapabilities,
          risk: "low"
        },
        {
          id: "task-extract-every-capability-requirement",
          title: "Extract every task capability requirement",
          kind: "verification",
          dependsOn: ["task-normalize-capability-requirements"],
          covers: ["ac_task_capabilities_collect_all"],
          requiredCapabilities: secondTaskCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const expectedCapabilityRequirements: readonly PlanTaskCapabilityRequirement[] = [
      {
        taskId: "task-normalize-capability-requirements",
        requiredCapabilities: {
          repoScopes: [
            {
              workspace: "protostar",
              path: "packages/planning/src",
              access: "write"
            }
          ],
          toolPermissions: [
            {
              tool: "node:test",
              permissionLevel: "execute",
              reason: "Verify normalized task capability requirements.",
              risk: "low"
            }
          ],
          executeGrants: [
            {
              command: "pnpm --filter @protostar/planning test",
              scope: "packages/planning",
              reason: "Run the planning package test gate."
            }
          ],
          budget: {
            timeoutMs: 30_000,
            maxRepairLoops: 0
          }
        }
      },
      {
        taskId: "task-extract-every-capability-requirement",
        requiredCapabilities: secondTaskCapabilities
      }
    ];
    const expectedCapabilityAdmissions: readonly PlanTaskCapabilityAdmissionResult[] =
      expectedCapabilityRequirements.map((requirement) => ({
        taskId: requirement.taskId,
        requestedCapabilities: requirement.requiredCapabilities,
        admittedCapabilities: requirement.requiredCapabilities,
        verdict: "allow"
      }));

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.taskCapabilityRequirements, expectedCapabilityRequirements);
    assert.deepEqual(validation.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    assert.equal(validation.taskCapabilityAdmissions.length, graph.tasks.length);
    assert.deepEqual(collectPlanTaskCapabilityRequirements(graph), expectedCapabilityRequirements);
    assert.deepEqual(
      graph.tasks.map((task) => task.requiredCapabilities),
      expectedCapabilityRequirements.map((requirement) => requirement.requiredCapabilities)
    );

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent
    });

    assert.equal(artifact.admitted, true);
    assert.deepEqual(artifact.details.taskCapabilityAdmissions, validation.taskCapabilityAdmissions);
  });

  it("classifies candidate-plan write, PR, and release grants before execution admission", () => {
    const intent = buildConfirmedIntentForTest({
      id: "intent_planning_pre_handoff_grant_classification",
      title: "Classify candidate-plan capability grants before execution handoff",
      problem:
        "Execution must know which admitted task grants require verification before plan handoff.",
      requester: "ouroboros-ac-50101",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_pre_handoff_grant_classification",
            statement:
              "Write and PR candidate-plan grants are classified as pre-handoff verification triggers, while release grants are classified as release conditions.",
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
            tool: "gh",
            permissionLevel: "execute",
            reason: "Open pull requests and publish release records from admitted tasks.",
            risk: "low"
          }
        ],
        executeGrants: [
          {
            command: "gh pr create --fill",
            scope: "repository",
            reason: "Open the delivery PR."
          },
          {
            command: "gh release create v0.0.1 --notes-file CHANGELOG.md",
            scope: "repository",
            reason: "Create the release record."
          }
        ],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Pre-handoff verification classification must reuse capability-envelope grants."]
    });
    const requiredCapabilities = {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/planning/src",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "gh",
          permissionLevel: "execute",
          reason: "Open the delivery PR and publish release records after admission.",
          risk: "low"
        }
      ],
      executeGrants: [
        {
          command: "gh pr create --fill",
          scope: "repository",
          reason: "Open the delivery PR."
        },
        {
          command: "gh release create v0.0.1 --notes-file CHANGELOG.md",
          scope: "repository",
          reason: "Create the release record."
        }
      ],
      budget: {
        timeoutMs: 30_000,
        maxRepairLoops: 0
      }
    } as const satisfies PlanTaskRequiredCapabilities;
    const expectedTriggers: readonly PlanningAdmissionPreHandoffVerificationTrigger[] = [
      {
        taskId: "task-classify-write-and-pr-grants",
        grantKind: "write",
        authority: "repository-write",
        source: "candidate-plan-required-capabilities",
        verificationPhase: "pre-handoff",
        capabilityRefs: [
          {
            section: "repoScopes",
            index: 0,
            source: "repo-scope-access"
          }
        ]
      },
      {
        taskId: "task-classify-write-and-pr-grants",
        grantKind: "pr",
        authority: "pull-request",
        source: "candidate-plan-required-capabilities",
        verificationPhase: "pre-handoff",
        capabilityRefs: [
          {
            section: "toolPermissions",
            index: 0,
            source: "tool-permission"
          },
          {
            section: "executeGrants",
            index: 0,
            source: "execute-grant"
          }
        ]
      }
    ];
    const expectedReleaseGrantConditions: readonly PlanningAdmissionReleaseGrantCondition[] = [
      {
        taskId: "task-classify-write-and-pr-grants",
        grantKind: "release",
        authority: "release",
        source: "candidate-plan-required-capabilities",
        admissionPhase: "before-execution",
        capabilityRefs: [
          {
            section: "toolPermissions",
            index: 0,
            source: "tool-permission"
          },
          {
            section: "executeGrants",
            index: 1,
            source: "execute-grant"
          }
        ]
      }
    ];
    const graph = createPlanGraph({
      planId: "plan_pre_handoff_grant_classification",
      intent,
      strategy: "Classify candidate-plan authority that needs verification before execution handoff.",
      tasks: [
        {
          id: "task-verify-release-grant-classification",
          title: "Verify release grant classification",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_pre_handoff_grant_classification"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-classify-write-and-pr-grants",
          title: "Classify admitted write and PR grants",
          kind: "release",
          dependsOn: ["task-verify-release-grant-classification"],
          covers: ["ac_pre_handoff_grant_classification"],
          requiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const validation = validatePlanGraph({
      graph,
      intent
    });
    const directClassification = classifyPlanTaskPreHandoffVerificationTriggers({
      taskId: "task-classify-write-and-pr-grants",
      requiredCapabilities
    });
    const directReleaseConditionClassification = classifyPlanTaskReleaseGrantConditions({
      taskId: "task-classify-write-and-pr-grants",
      requiredCapabilities
    });
    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(directClassification, expectedTriggers);
    assert.deepEqual(directReleaseConditionClassification, expectedReleaseGrantConditions);
    assert.deepEqual(validation.preHandoffVerificationTriggers, expectedTriggers);
    assert.deepEqual(validation.releaseGrantConditions, expectedReleaseGrantConditions);
    assert.equal(
      JSON.stringify(validation.preHandoffVerificationTriggers).includes('"grantKind":"release"'),
      false,
      "Release grants are release-gate authority, not pre-handoff verification triggers."
    );
    assert.equal(artifact.admitted, true);
    assert.deepEqual(artifact.details.preHandoffVerificationTriggers, expectedTriggers);
    assert.deepEqual(artifact.details.releaseGrantConditions, expectedReleaseGrantConditions);
    assert.equal(
      JSON.stringify(artifact.details.preHandoffVerificationTriggers).includes("gh pr create"),
      false,
      "The pre-handoff trigger evidence stays thin and does not copy command text out of the PlanGraph."
    );
    assert.equal(
      JSON.stringify(artifact.details.releaseGrantConditions).includes("gh release create"),
      false,
      "The release condition evidence stays thin and does not copy command text out of the PlanGraph."
    );
  });

  it("evaluates PR and release authority only from the normalized planning grant model", () => {
    const intent = buildConfirmedIntentForTest({
      id: "intent_planning_grant_model_evaluation",
      title: "Evaluate planning grants from the normalized model",
      problem:
        "Planning admission must not fall back to raw capability-envelope fields after grant normalization.",
      requester: "ouroboros-ac-50003",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_planning_grant_model_only",
          statement: "Missing or malformed normalized grant entries are denied during planning admission.",
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
        toolPermissions: [],
        executeGrants: [
          {
            command: "gh pr create --fill",
            scope: "repository",
            reason: "Open the delivery PR."
          },
          {
            command: "gh release create v0.0.1 --notes-file CHANGELOG.md",
            scope: "repository",
            reason: "Create the release."
          }
        ],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Grant-model evaluation must treat missing and malformed grants as denied."]
    });
    const requiredCapabilities = {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/planning",
          access: "write"
        }
      ],
      toolPermissions: [],
      executeGrants: [
        {
          command: "gh pr create --fill",
          scope: "repository",
          reason: "Open the delivery PR."
        },
        {
          command: "gh release create v0.0.1 --notes-file CHANGELOG.md",
          scope: "repository",
          reason: "Create the release."
        }
      ],
      budget: {
        timeoutMs: 30_000,
        maxRepairLoops: 0
      }
    } as const satisfies PlanTaskRequiredCapabilities;
    const graph = createPlanGraph({
      planId: "plan_planning_grant_model_evaluation",
      intent,
      strategy: "Admit only through the normalized planning grant model.",
      tasks: [
        {
          id: "task-verify-normalized-planning-grants",
          title: "Verify normalized planning grants",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_grant_model_only"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-require-normalized-planning-grants",
          title: "Require normalized planning grants",
          kind: "release",
          dependsOn: ["task-verify-normalized-planning-grants"],
          covers: ["ac_planning_grant_model_only"],
          requiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const grantModelWithMissingAndMalformedGrants = {
      source: "confirmed-intent-capability-envelope",
      grants: [
        {
          id: "planning-admission-grant:write",
          kind: "write",
          authority: "repository-write",
          source: "confirmed-intent-capability-envelope",
          status: "detected",
          evidenceRefs: [
            {
              fieldPath: "capabilityEnvelope.repoScopes.0.access",
              detectionSource: "repo-scope-access"
            }
          ]
        },
        {
          id: "planning-admission-grant:pr",
          kind: "pr",
          authority: "pull-request",
          source: "confirmed-intent-capability-envelope",
          status: "malformed",
          evidenceRefs: [
            {
              fieldPath: "capabilityEnvelope.executeGrants.0.command",
              detectionSource: "execute-grant"
            }
          ]
        }
      ]
    };

    const defaultValidation = validatePlanGraph({
      graph,
      intent
    });
    const deniedValidation = validatePlanGraph({
      graph,
      intent,
      planningAdmissionGrantModel: grantModelWithMissingAndMalformedGrants
    });

    assert.equal(defaultValidation.ok, true);
    assert.equal(deniedValidation.ok, false);
    assert.deepEqual(deniedValidation.planningAdmissionGrantModel, {
      source: "confirmed-intent-capability-envelope",
      grants: [
        {
          id: "planning-admission-grant:write",
          kind: "write",
          authority: "repository-write",
          source: "confirmed-intent-capability-envelope",
          status: "detected",
          evidenceRefs: [
            {
              fieldPath: "capabilityEnvelope.repoScopes.0.access",
              detectionSource: "repo-scope-access"
            }
          ]
        }
      ]
    });
    assert.deepEqual(
      deniedValidation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      [
        {
          code: "task-required-pull-request-grant-denied",
          path: "tasks.task-require-normalized-planning-grants.requiredCapabilities.executeGrants.0",
          taskId: "task-require-normalized-planning-grants",
          message:
            "Task task-require-normalized-planning-grants requires execute grant 'gh pr create --fill' in scope 'repository', but the normalized planning admission grant model does not contain a valid pr grant."
        },
        {
          code: "task-required-release-grant-denied",
          path: "tasks.task-require-normalized-planning-grants.requiredCapabilities.executeGrants.1",
          taskId: "task-require-normalized-planning-grants",
          message:
            "Task task-require-normalized-planning-grants requires execute grant 'gh release create v0.0.1 --notes-file CHANGELOG.md' in scope 'repository', but the normalized planning admission grant model does not contain a valid release grant."
        }
      ]
    );
    assert.deepEqual(
      deniedValidation.taskCapabilityRequirements,
      [],
      "Plans with denied planning grants must not export task capability requirements for execution."
    );
    assert.deepEqual(
      deniedValidation.releaseGrantConditions,
      [],
      "Plans with denied release grants must not export first-class release conditions for execution."
    );

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent,
      planningAdmissionGrantModel: grantModelWithMissingAndMalformedGrants
    });

    assert.equal(artifact.admitted, false);
    assert.deepEqual(artifact.details.grantModel, deniedValidation.planningAdmissionGrantModel);
    assert.deepEqual(artifact.errors, deniedValidation.errors);
    assert.equal(Object.hasOwn(artifact.details, "releaseGrantConditions"), false);
  });

  it("collects every malformed task capability envelope defect in one validation pass", () => {
    const malformedRequiredCapabilitiesTasks = [
      {
        id: "task-missing-capabilities",
        title: "Omit required capabilities entirely",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_task_capabilities_shape"],
        risk: "low"
      },
      {
        id: "task-empty-capabilities-object",
        title: "Expose an empty capability object instead of the normalized shape",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_task_capabilities_collect_all"],
        requiredCapabilities: {},
        risk: "low"
      },
      {
        id: "task-malformed-capabilities",
        title: "Expose malformed task capability requirements",
        kind: "implementation",
        dependsOn: [],
        covers: ["ac_task_capabilities_collect_all"],
        requiredCapabilities: {
          repoScopes: "packages/planning",
          toolPermissions: [
            {
              tool: "",
              permissionLevel: "owner",
              reason: "",
              risk: "critical"
            }
          ],
          executeGrants: [
            {
              command: "",
              scope: "",
              reason: ""
            }
          ],
          budget: {
            timeoutMs: -1,
            maxRepairLoops: "never"
          }
        },
        risk: "low"
      }
    ];
    const graph = {
      planId: "plan_task_required_capabilities_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit malformed task capability requirements.",
      acceptanceCriteria: acceptedCriteria,
      tasks: malformedRequiredCapabilitiesTasks
    } as unknown as PlanGraph;

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    const expectedViolations: readonly Pick<PlanGraphValidationViolation, "code" | "path" | "taskId" | "message">[] = [
      {
        code: "missing-task-required-capabilities",
        path: "tasks.task-missing-capabilities.requiredCapabilities",
        taskId: "task-missing-capabilities",
        message:
          "Task task-missing-capabilities requiredCapabilities must be provided in normalized capability-envelope shape."
      },
      {
        code: "malformed-task-required-capabilities",
        path: "tasks.task-empty-capabilities-object.requiredCapabilities.repoScopes",
        taskId: "task-empty-capabilities-object",
        message: "Task task-empty-capabilities-object requiredCapabilities.repoScopes must be an array."
      },
      {
        code: "malformed-task-required-capabilities",
        path: "tasks.task-empty-capabilities-object.requiredCapabilities.toolPermissions",
        taskId: "task-empty-capabilities-object",
        message: "Task task-empty-capabilities-object requiredCapabilities.toolPermissions must be an array."
      },
      {
        code: "malformed-task-required-capabilities",
        path: "tasks.task-empty-capabilities-object.requiredCapabilities.budget",
        taskId: "task-empty-capabilities-object",
        message: "Task task-empty-capabilities-object requiredCapabilities.budget must be an object."
      },
      {
        code: "malformed-task-required-capabilities",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.repoScopes",
        taskId: "task-malformed-capabilities",
        message: "Task task-malformed-capabilities requiredCapabilities.repoScopes must be an array."
      },
      {
        code: "malformed-task-required-tool-permission",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.toolPermissions.0.tool",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.toolPermissions.0.tool must be a non-empty string."
      },
      {
        code: "malformed-task-required-tool-permission",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.toolPermissions.0.permissionLevel",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.toolPermissions.0.permissionLevel must be read, use, write, execute, or admin."
      },
      {
        code: "malformed-task-required-tool-permission",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.toolPermissions.0.reason",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.toolPermissions.0.reason must be a non-empty string."
      },
      {
        code: "malformed-task-required-tool-permission",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.toolPermissions.0.risk",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.toolPermissions.0.risk must be low, medium, or high."
      },
      {
        code: "malformed-task-required-execute-grant",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.executeGrants.0.command",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.executeGrants.0.command must be a non-empty string."
      },
      {
        code: "malformed-task-required-execute-grant",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.executeGrants.0.scope",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.executeGrants.0.scope must be a non-empty string."
      },
      {
        code: "malformed-task-required-execute-grant",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.executeGrants.0.reason",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.executeGrants.0.reason must be a non-empty string when provided."
      },
      {
        code: "malformed-task-required-budget",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.budget.timeoutMs",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.budget.timeoutMs must be a non-negative finite number when provided."
      },
      {
        code: "malformed-task-required-budget",
        path: "tasks.task-malformed-capabilities.requiredCapabilities.budget.maxRepairLoops",
        taskId: "task-malformed-capabilities",
        message:
          "Task task-malformed-capabilities requiredCapabilities.budget.maxRepairLoops must be a non-negative finite number when provided."
      }
    ];

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      expectedViolations
    );
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("hard-rejects malformed required-capabilities candidate plans before admission", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_task_required_capabilities_hard_reject",
          intent: admittedIntent,
          strategy: "Attempt to admit a task without normalized required capabilities.",
          tasks: [
            {
              id: "task-missing-capabilities",
              title: "Omit required capabilities entirely",
              kind: "verification",
              dependsOn: [],
              covers: ["ac_task_capabilities_shape", "ac_task_capabilities_collect_all"],
              risk: "low"
            }
          ] as unknown as readonly PlanTask[],
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-missing-capabilities requiredCapabilities must be provided in normalized capability-envelope shape\./
    );
  });

  it("collects every task capability requirement missing from the admitted intent envelope", () => {
    const graph = {
      planId: "plan_task_required_capabilities_envelope_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to smuggle capabilities beyond the confirmed intent envelope.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-require-outside-envelope",
          title: "Require capabilities beyond the admitted intent envelope",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_task_capabilities_shape", "ac_task_capabilities_collect_all"],
          requiredCapabilities: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/execution",
                access: "write"
              },
              {
                workspace: "external",
                path: "packages/planning",
                access: "write"
              }
            ],
            toolPermissions: [
              {
                tool: "playwright",
                permissionLevel: "execute",
                reason: "Drive an unadmitted browser automation tool.",
                risk: "low"
              },
              {
                tool: "node:test",
                permissionLevel: "admin",
                reason: "Escalate beyond the admitted test runner permission.",
                risk: "low"
              },
              {
                tool: "node:test",
                permissionLevel: "execute",
                reason: "Escalate beyond the admitted tool risk.",
                risk: "medium"
              }
            ],
            executeGrants: [
              {
                command: "pnpm run verify",
                scope: "packages/planning",
                reason: "Run an unadmitted command."
              },
              {
                command: "pnpm --filter @protostar/planning test",
                scope: "packages/execution",
                reason: "Run the admitted command in an unadmitted scope."
              }
            ],
            budget: {
              timeoutMs: 60_000,
              maxRepairLoops: 1
            }
          },
          risk: "low"
        }
      ]
    } as unknown as PlanGraph;

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    const expectedViolations: readonly Pick<PlanGraphValidationViolation, "code" | "path" | "taskId" | "message">[] = [
      {
        code: "task-required-repo-scope-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.repoScopes.0",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires repo scope protostar:packages/execution:write outside confirmed intent capability envelope."
      },
      {
        code: "task-required-repo-scope-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.repoScopes.1",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires repo scope external:packages/planning:write outside confirmed intent capability envelope."
      },
      {
        code: "task-required-tool-permission-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.toolPermissions.0",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires tool permission playwright (execute, low) outside confirmed intent capability envelope."
      },
      {
        code: "task-required-tool-permission-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.toolPermissions.1",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires tool permission node:test (admin, low) outside confirmed intent capability envelope."
      },
      {
        code: "task-required-tool-permission-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.toolPermissions.2",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires tool permission node:test (execute, medium) outside confirmed intent capability envelope."
      },
      {
        code: "task-required-execute-grant-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.executeGrants.0",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires execute grant 'pnpm run verify' in scope 'packages/planning' outside confirmed intent capability envelope."
      },
      {
        code: "task-required-execute-grant-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.executeGrants.1",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires execute grant 'pnpm --filter @protostar/planning test' in scope 'packages/execution' outside confirmed intent capability envelope."
      },
      {
        code: "task-required-budget-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.budget.timeoutMs",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires budget timeoutMs=60000 outside confirmed intent capability envelope."
      },
      {
        code: "task-required-budget-outside-intent-envelope",
        path: "tasks.task-require-outside-envelope.requiredCapabilities.budget.maxRepairLoops",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires budget maxRepairLoops=1 outside confirmed intent capability envelope."
      },
      {
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-require-outside-envelope.risk",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope declares low risk but requires medium capability risk; low tasks may only require low capability risk."
      },
      {
        code: "verification_required_by_envelope",
        path: "tasks.task-require-outside-envelope.dependsOn",
        taskId: "task-require-outside-envelope",
        message:
          "Task task-require-outside-envelope requires write authority for execution handoff and must depend on an explicit verification task before admission."
      }
    ];

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      expectedViolations
    );
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("collects malformed and out-of-envelope task capability defects in one pass", () => {
    const graph = {
      planId: "plan_task_required_capabilities_mixed_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to mix malformed requirements with valid requirements beyond the envelope.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-mixed-capability-defects",
          title: "Mix malformed capability requirements with authority overages",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_task_capabilities_shape", "ac_task_capabilities_collect_all"],
          requiredCapabilities: {
            repoScopes: [
              "packages/planning",
              {
                workspace: "protostar",
                path: "packages/execution",
                access: "write"
              }
            ],
            toolPermissions: [
              {
                tool: "",
                permissionLevel: "execute",
                reason: "",
                risk: "low"
              },
              {
                tool: "node:test",
                permissionLevel: "admin",
                reason: "Escalate beyond the admitted test runner permission.",
                risk: "low"
              }
            ],
            executeGrants: [
              {
                command: "",
                scope: "packages/planning",
                reason: "Malformed command must not hide later valid overages."
              },
              {
                command: "pnpm run verify",
                scope: "packages/planning",
                reason: "Run an unadmitted command."
              }
            ],
            budget: {
              timeoutMs: -1,
              maxRepairLoops: 1
            }
          },
          risk: "low"
        }
      ]
    } as unknown as PlanGraph;

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId }) => ({ code, path, taskId })),
      [
        {
          code: "malformed-task-required-repo-scope",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.repoScopes.0",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "malformed-task-required-tool-permission",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.toolPermissions.0.tool",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "malformed-task-required-tool-permission",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.toolPermissions.0.reason",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "malformed-task-required-execute-grant",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.executeGrants.0.command",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "malformed-task-required-budget",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.budget.timeoutMs",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "task-required-repo-scope-outside-intent-envelope",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.repoScopes.0",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "task-required-tool-permission-outside-intent-envelope",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.toolPermissions.0",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "task-required-execute-grant-outside-intent-envelope",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.executeGrants.0",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "task-required-budget-outside-intent-envelope",
          path: "tasks.task-mixed-capability-defects.requiredCapabilities.budget.maxRepairLoops",
          taskId: "task-mixed-capability-defects"
        },
        {
          code: "verification_required_by_envelope",
          path: "tasks.task-mixed-capability-defects.dependsOn",
          taskId: "task-mixed-capability-defects"
        }
      ]
    );
    assert.deepEqual(
      validation.capabilityViolationDiagnostics.map(({ taskId, violatedRule, capabilityPath, severity }) => ({
        taskId,
        violatedRule,
        capabilityPath,
        severity
      })),
      [
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "malformed-task-required-repo-scope",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.repoScopes.0",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "malformed-task-required-tool-permission",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.toolPermissions.0.tool",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "malformed-task-required-tool-permission",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.toolPermissions.0.reason",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "malformed-task-required-execute-grant",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.executeGrants.0.command",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "malformed-task-required-budget",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.budget.timeoutMs",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "task-required-repo-scope-outside-intent-envelope",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.repoScopes.0",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "task-required-tool-permission-outside-intent-envelope",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.toolPermissions.0",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "task-required-execute-grant-outside-intent-envelope",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.executeGrants.0",
          severity: "block"
        },
        {
          taskId: "task-mixed-capability-defects",
          violatedRule: "task-required-budget-outside-intent-envelope",
          capabilityPath: "tasks.task-mixed-capability-defects.requiredCapabilities.budget.maxRepairLoops",
          severity: "block"
        }
      ]
    );
    assert.deepEqual(
      validation.taskCapabilityRequirements,
      [],
      "Rejected mixed-defect candidates must not be exported as admitted task capability requirements."
    );
  });

  it("hard-rejects missing-envelope task capabilities before admission", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_task_required_capabilities_envelope_hard_reject",
          intent: admittedIntent,
          strategy: "Attempt to admit a task whose capabilities exceed the intent envelope.",
          tasks: [
            {
              id: "task-require-unadmitted-tool",
              title: "Require an unadmitted tool",
              kind: "verification",
              dependsOn: [],
              covers: ["ac_task_capabilities_shape", "ac_task_capabilities_collect_all"],
              requiredCapabilities: {
                repoScopes: [],
                toolPermissions: [
                  {
                    tool: "playwright",
                    permissionLevel: "execute",
                    reason: "Drive an unadmitted browser automation tool.",
                    risk: "low"
                  }
                ],
                budget: {}
              },
              risk: "low"
            }
          ],
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-require-unadmitted-tool requires tool permission playwright \(execute, low\) outside confirmed intent capability envelope\./
    );
  });
});
