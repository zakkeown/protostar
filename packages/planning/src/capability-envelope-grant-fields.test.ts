import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";

import {
  createPlanningAdmissionArtifact,
  createPlanGraph,
  detectCapabilityEnvelopeGrantFields,
  normalizePlanningAdmissionGrantModel,
  validatePlanGraph,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

describe("capability-envelope grant field detection", () => {
  it("detects write, PR, and release grant fields from the capability envelope admission input", () => {
    const detections = detectCapabilityEnvelopeGrantFields({
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
            reason: "Open a pull request after review approval.",
            risk: "low"
          },
          {
            tool: "shell",
            permissionLevel: "execute",
            reason: "Publish release artifacts after the review gate passes.",
            risk: "medium"
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
            reason: "Create the release."
          }
        ],
        budget: {
          timeoutMs: 30_000
        },
        writeGrant: {
          paths: ["packages/planning"]
        },
        prGrant: true,
        releaseGrant: {
          target: "github"
        },
        grants: {
          write: true,
          pullRequest: true,
          release: true
        }
      } as Record<string, unknown>
    });

    assert.deepEqual(detections.detectedGrantKinds, ["write", "pr", "release"]);
    assert.deepEqual(
      detections.writeGrantFields.map(({ fieldPath, source, matchedValue }) => ({ fieldPath, source, matchedValue })),
      [
        {
          fieldPath: "capabilityEnvelope.writeGrant",
          source: "explicit-grant-field",
          matchedValue: "object"
        },
        {
          fieldPath: "capabilityEnvelope.grants.write",
          source: "explicit-grant-field",
          matchedValue: "true"
        },
        {
          fieldPath: "capabilityEnvelope.repoScopes.0.access",
          source: "repo-scope-access",
          matchedValue: "write"
        }
      ]
    );
    assert.deepEqual(
      detections.prGrantFields.map(({ fieldPath, source, matchedValue }) => ({ fieldPath, source, matchedValue })),
      [
        {
          fieldPath: "capabilityEnvelope.prGrant",
          source: "explicit-grant-field",
          matchedValue: "true"
        },
        {
          fieldPath: "capabilityEnvelope.grants.pullRequest",
          source: "explicit-grant-field",
          matchedValue: "true"
        },
        {
          fieldPath: "capabilityEnvelope.toolPermissions.0.reason",
          source: "tool-permission",
          matchedValue: "Open a pull request after review approval."
        },
        {
          fieldPath: "capabilityEnvelope.executeGrants.0.command",
          source: "execute-grant",
          matchedValue: "gh pr create --fill"
        }
      ]
    );
    assert.deepEqual(
      detections.releaseGrantFields.map(({ fieldPath, source, matchedValue }) => ({
        fieldPath,
        source,
        matchedValue
      })),
      [
        {
          fieldPath: "capabilityEnvelope.releaseGrant",
          source: "explicit-grant-field",
          matchedValue: "object"
        },
        {
          fieldPath: "capabilityEnvelope.grants.release",
          source: "explicit-grant-field",
          matchedValue: "true"
        },
        {
          fieldPath: "capabilityEnvelope.toolPermissions.1.reason",
          source: "tool-permission",
          matchedValue: "Publish release artifacts after the review gate passes."
        },
        {
          fieldPath: "capabilityEnvelope.executeGrants.1.command",
          source: "execute-grant",
          matchedValue: "gh release create v0.0.1 --notes-file CHANGELOG.md"
        }
      ]
    );
  });

  it("normalizes detected write, PR, and release grants into canonical planning-admission grants", () => {
    const detections = detectCapabilityEnvelopeGrantFields({
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
            reason: "Open a pull request after review approval.",
            risk: "low"
          },
          {
            tool: "shell",
            permissionLevel: "execute",
            reason: "Publish release artifacts after the review gate passes.",
            risk: "medium"
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
            reason: "Create the release."
          }
        ],
        budget: {
          timeoutMs: 30_000
        },
        writeGrant: {
          paths: ["packages/planning"]
        },
        prGrant: true,
        releaseGrant: {
          target: "github"
        },
        grants: {
          write: true,
          pullRequest: true,
          release: true
        }
      } as Record<string, unknown>
    });

    const grantModel = normalizePlanningAdmissionGrantModel({ detections });

    assert.deepEqual(grantModel, {
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
              fieldPath: "capabilityEnvelope.writeGrant",
              detectionSource: "explicit-grant-field"
            },
            {
              fieldPath: "capabilityEnvelope.grants.write",
              detectionSource: "explicit-grant-field"
            },
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
          status: "detected",
          evidenceRefs: [
            {
              fieldPath: "capabilityEnvelope.prGrant",
              detectionSource: "explicit-grant-field"
            },
            {
              fieldPath: "capabilityEnvelope.grants.pullRequest",
              detectionSource: "explicit-grant-field"
            },
            {
              fieldPath: "capabilityEnvelope.toolPermissions.0.reason",
              detectionSource: "tool-permission"
            },
            {
              fieldPath: "capabilityEnvelope.executeGrants.0.command",
              detectionSource: "execute-grant"
            }
          ]
        },
        {
          id: "planning-admission-grant:release",
          kind: "release",
          authority: "release",
          source: "confirmed-intent-capability-envelope",
          status: "detected",
          evidenceRefs: [
            {
              fieldPath: "capabilityEnvelope.releaseGrant",
              detectionSource: "explicit-grant-field"
            },
            {
              fieldPath: "capabilityEnvelope.grants.release",
              detectionSource: "explicit-grant-field"
            },
            {
              fieldPath: "capabilityEnvelope.toolPermissions.1.reason",
              detectionSource: "tool-permission"
            },
            {
              fieldPath: "capabilityEnvelope.executeGrants.1.command",
              detectionSource: "execute-grant"
            }
          ]
        }
      ]
    });
    assert.equal(JSON.stringify(grantModel).includes("gh release create"), false);
  });

  it("attaches grant field detections to PlanGraph validation from the admitted intent envelope", () => {
    const intent = defineConfirmedIntent({
      id: "intent_planning_grant_field_detection",
      title: "Detect capability grant fields during planning admission",
      problem:
        "Planning admission must see write, PR, and release authority before execution receives an admitted plan.",
      requester: "ouroboros-ac-50001",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_planning_detect_grant_fields",
          statement: "Planning admission records write, PR, and release grant field detections.",
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
            reason: "Open PRs and create release records only after admission.",
            risk: "medium"
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
            reason: "Create the release."
          }
        ],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Planning admission must not infer grants downstream from execution state."]
    });
    const graph = createPlanGraph({
      planId: "plan_planning_grant_field_detection",
      intent,
      strategy: "Detect capability grant fields before plan admission completes.",
      tasks: [
        {
          id: "task-detect-capability-grant-fields",
          title: "Detect capability grant fields",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_detect_grant_fields"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const validation = validatePlanGraph({
      graph,
      intent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.capabilityEnvelopeGrantFieldDetections.detectedGrantKinds, [
      "write",
      "pr",
      "release"
    ]);
    assert.equal(validation.capabilityEnvelopeGrantFieldDetections.writeGrantFields.length, 1);
    assert.equal(validation.capabilityEnvelopeGrantFieldDetections.prGrantFields.length, 2);
    assert.equal(validation.capabilityEnvelopeGrantFieldDetections.releaseGrantFields.length, 2);
    assert.deepEqual(validation.planningAdmissionGrantModel, {
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
          status: "detected",
          evidenceRefs: [
            {
              fieldPath: "capabilityEnvelope.toolPermissions.0.reason",
              detectionSource: "tool-permission"
            },
            {
              fieldPath: "capabilityEnvelope.executeGrants.0.command",
              detectionSource: "execute-grant"
            }
          ]
        },
        {
          id: "planning-admission-grant:release",
          kind: "release",
          authority: "release",
          source: "confirmed-intent-capability-envelope",
          status: "detected",
          evidenceRefs: [
            {
              fieldPath: "capabilityEnvelope.toolPermissions.0.reason",
              detectionSource: "tool-permission"
            },
            {
              fieldPath: "capabilityEnvelope.executeGrants.1.command",
              detectionSource: "execute-grant"
            }
          ]
        }
      ]
    });

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent
    });

    assert.equal(artifact.admitted, true);
    assert.deepEqual(artifact.details.grantModel, validation.planningAdmissionGrantModel);
  });
});
