import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTENT_DRAFT_REQUIRED_FIELD_CHECKLIST,
  INTENT_DRAFT_REQUIRED_DIMENSIONS,
  detectMissingIntentDraftFields,
  evaluateIntentDraftCompleteness,
  requiredIntentDraftFieldChecklist,
  requiredIntentDraftDimensions,
  requiredIntentDraftFieldPaths,
  validateIntentDraftPresence,
  validateIntentDraftWellFormedness,
  type IntentDraft
} from "./index.js";

describe("IntentDraft structural completeness dimensions", () => {
  it("defines the required greenfield and brownfield structural dimensions deterministically", () => {
    assert.deepEqual(
      INTENT_DRAFT_REQUIRED_DIMENSIONS.map(({ id, requiredFields, modes }) => ({ id, requiredFields, modes })),
      [
        {
          id: "goal",
          requiredFields: ["title", "problem"],
          modes: ["greenfield", "brownfield"]
        },
        {
          id: "requester",
          requiredFields: ["requester"],
          modes: ["greenfield", "brownfield"]
        },
        {
          id: "goalArchetype",
          requiredFields: ["goalArchetype"],
          modes: ["greenfield", "brownfield"]
        },
        {
          id: "successCriteria",
          requiredFields: ["acceptanceCriteria"],
          modes: ["greenfield", "brownfield"]
        },
        {
          id: "constraints",
          requiredFields: ["constraints"],
          modes: ["greenfield", "brownfield"]
        },
        {
          id: "stopConditions",
          requiredFields: ["stopConditions"],
          modes: ["greenfield", "brownfield"]
        },
        {
          id: "capabilityEnvelope",
          requiredFields: [
            "capabilityEnvelope.repoScopes",
            "capabilityEnvelope.toolPermissions",
            "capabilityEnvelope.budget"
          ],
          modes: ["greenfield", "brownfield"]
        },
        {
          id: "brownfieldContext",
          requiredFields: ["context"],
          modes: ["brownfield"]
        }
      ]
    );

    assert.deepEqual(
      requiredIntentDraftFieldPaths("greenfield"),
      [
        "title",
        "problem",
        "requester",
        "goalArchetype",
        "acceptanceCriteria",
        "constraints",
        "stopConditions",
        "capabilityEnvelope.repoScopes",
        "capabilityEnvelope.toolPermissions",
        "capabilityEnvelope.budget"
      ]
    );
    assert.deepEqual(
      requiredIntentDraftFieldPaths("brownfield"),
      [
        "title",
        "problem",
        "requester",
        "goalArchetype",
        "acceptanceCriteria",
        "constraints",
        "stopConditions",
        "capabilityEnvelope.repoScopes",
        "capabilityEnvelope.toolPermissions",
        "capabilityEnvelope.budget",
        "context"
      ]
    );
    assert.deepEqual(
      requiredIntentDraftDimensions("brownfield").map((dimension) => dimension.id),
      [
        "goal",
        "requester",
        "goalArchetype",
        "successCriteria",
        "constraints",
        "stopConditions",
        "capabilityEnvelope",
        "brownfieldContext"
      ]
    );
  });

  it("exports the canonical required field checklist with per-field well-formedness rules", () => {
    assert.deepEqual(
      INTENT_DRAFT_REQUIRED_FIELD_CHECKLIST.map(
        ({ fieldPath, dimensionId, modes, wellFormedness, failureMessage }) => ({
          fieldPath,
          dimensionId,
          modes,
          rule: wellFormedness.kind,
          failureMessage
        })
      ),
      [
        {
          fieldPath: "title",
          dimensionId: "goal",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-text",
          failureMessage: "title must be provided before promotion."
        },
        {
          fieldPath: "problem",
          dimensionId: "goal",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-text",
          failureMessage: "problem must be provided before promotion."
        },
        {
          fieldPath: "requester",
          dimensionId: "requester",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-text",
          failureMessage: "requester must be provided before promotion."
        },
        {
          fieldPath: "goalArchetype",
          dimensionId: "goalArchetype",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-text",
          failureMessage: "goalArchetype must be provided before promotion."
        },
        {
          fieldPath: "acceptanceCriteria",
          dimensionId: "successCriteria",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-acceptance-criteria",
          failureMessage: "acceptanceCriteria must contain at least one entry before promotion."
        },
        {
          fieldPath: "constraints",
          dimensionId: "constraints",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-string-list",
          failureMessage: "constraints must contain at least one non-empty entry before promotion."
        },
        {
          fieldPath: "stopConditions",
          dimensionId: "stopConditions",
          modes: ["greenfield", "brownfield"],
          rule: "deterministic-stop-condition",
          failureMessage: "stopConditions must define a deterministic halt, pause, or escalation condition before promotion."
        },
        {
          fieldPath: "capabilityEnvelope.repoScopes",
          dimensionId: "capabilityEnvelope",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-repo-scope-list",
          failureMessage: "capabilityEnvelope.repoScopes must contain at least one repository scope before promotion."
        },
        {
          fieldPath: "capabilityEnvelope.toolPermissions",
          dimensionId: "capabilityEnvelope",
          modes: ["greenfield", "brownfield"],
          rule: "non-empty-tool-permission-list",
          failureMessage: "capabilityEnvelope.toolPermissions must contain at least one tool grant before promotion."
        },
        {
          fieldPath: "capabilityEnvelope.budget",
          dimensionId: "capabilityEnvelope",
          modes: ["greenfield", "brownfield"],
          rule: "at-least-one-budget-limit",
          failureMessage: "capabilityEnvelope.budget must contain at least one non-negative finite limit before promotion."
        },
        {
          fieldPath: "context",
          dimensionId: "brownfieldContext",
          modes: ["brownfield"],
          rule: "non-empty-text",
          failureMessage: "context must be provided for brownfield promotion."
        }
      ]
    );

    assert.deepEqual(
      requiredIntentDraftFieldChecklist("greenfield").map((entry) => entry.fieldPath),
      requiredIntentDraftFieldPaths("greenfield")
    );
    assert.deepEqual(
      requiredIntentDraftFieldChecklist("brownfield").map((entry) => entry.fieldPath),
      requiredIntentDraftFieldPaths("brownfield")
    );
  });

  it("validates required-field presence with deterministic per-checklist-item failures", () => {
    const first = validateIntentDraftPresence({
      draft: {},
      mode: "brownfield"
    });
    const second = validateIntentDraftPresence({
      draft: {},
      mode: "brownfield"
    });
    const checklist = requiredIntentDraftFieldChecklist("brownfield");

    assert.deepEqual(second, first);
    assert.equal(first.passed, false);
    assert.deepEqual(first.checklist, checklist);
    assert.equal(first.checks.length, checklist.length);
    assert.equal(first.failures.length, checklist.length);
    assert.deepEqual(first.missingFields, checklist.map((entry) => entry.fieldPath));
    assert.deepEqual(
      first.failures.map(({ code, checklistIndex, fieldPath, dimensionId, label, message }) => ({
        code,
        checklistIndex,
        fieldPath,
        dimensionId,
        label,
        message
      })),
      checklist.map((entry, checklistIndex) => ({
        code: "missing-required-field",
        checklistIndex,
        fieldPath: entry.fieldPath,
        dimensionId: entry.dimensionId,
        label: entry.label,
        message: entry.failureMessage
      }))
    );
    assert.deepEqual(
      first.checks.map(({ checklistIndex, fieldPath, passed, failure }) => ({
        checklistIndex,
        fieldPath,
        passed,
        failureCode: failure?.code
      })),
      checklist.map((entry, checklistIndex) => ({
        checklistIndex,
        fieldPath: entry.fieldPath,
        passed: false,
        failureCode: "missing-required-field"
      }))
    );
  });

  it("reports missing required dimensions and fields deterministically for brownfield drafts", () => {
    const first = evaluateIntentDraftCompleteness({
      draft: {},
      mode: "brownfield"
    });
    const second = evaluateIntentDraftCompleteness({
      draft: {},
      mode: "brownfield"
    });

    assert.deepEqual(second, first);
    assert.equal(first.complete, false);
    assert.deepEqual(first.missingDimensions, [
      "goal",
      "requester",
      "goalArchetype",
      "successCriteria",
      "constraints",
      "stopConditions",
      "capabilityEnvelope",
      "brownfieldContext"
    ]);
    assert.deepEqual(first.missingFields, [
      "title",
      "problem",
      "requester",
      "goalArchetype",
      "acceptanceCriteria",
      "constraints",
      "stopConditions",
      "capabilityEnvelope.repoScopes",
      "capabilityEnvelope.toolPermissions",
      "capabilityEnvelope.budget",
      "context"
    ]);
    assert.deepEqual(
      first.dimensions
        .filter((dimension) => !dimension.passed)
        .map(({ dimensionId, missingFields }) => ({ dimensionId, missingFields })),
      [
        {
          dimensionId: "goal",
          missingFields: ["title", "problem"]
        },
        {
          dimensionId: "requester",
          missingFields: ["requester"]
        },
        {
          dimensionId: "goalArchetype",
          missingFields: ["goalArchetype"]
        },
        {
          dimensionId: "successCriteria",
          missingFields: ["acceptanceCriteria"]
        },
        {
          dimensionId: "constraints",
          missingFields: ["constraints"]
        },
        {
          dimensionId: "stopConditions",
          missingFields: ["stopConditions"]
        },
        {
          dimensionId: "capabilityEnvelope",
          missingFields: [
            "capabilityEnvelope.repoScopes",
            "capabilityEnvelope.toolPermissions",
            "capabilityEnvelope.budget"
          ]
        },
        {
          dimensionId: "brownfieldContext",
          missingFields: ["context"]
        }
      ]
    );

    const titleCheck = first.fieldChecks.find((check) => check.fieldPath === "title");
    assert.equal(titleCheck?.passed, false);
    assert.deepEqual(titleCheck?.wellFormedness, {
      kind: "non-empty-text",
      description: "Must be a non-empty string after whitespace normalization."
    });
    assert.equal(titleCheck?.message, "title must be provided before promotion.");
    assert.equal(titleCheck?.failure?.code, "missing-required-field");

    assert.deepEqual(
      first.presenceFailures.map(({ checklistIndex, fieldPath, code }) => ({ checklistIndex, fieldPath, code })),
      first.missingFields.map((fieldPath, checklistIndex) => ({
        checklistIndex,
        fieldPath,
        code: "missing-required-field"
      }))
    );
    assert.deepEqual(first.presenceValidation.failures, first.presenceFailures);

    assert.deepEqual(
      detectMissingIntentDraftFields({ draft: {}, mode: "brownfield" }),
      first
    );
  });

  it("reports malformed required fields with stable codes, paths, and checklist ordering", () => {
    const draft = malformedGreenfieldDraft();
    const first = validateIntentDraftWellFormedness({
      draft,
      mode: "greenfield"
    });
    const second = validateIntentDraftWellFormedness({
      draft,
      mode: "greenfield"
    });

    assert.deepEqual(second, first);
    assert.deepEqual(validateIntentDraftPresence({ draft, mode: "greenfield" }), first);
    assert.equal(first.passed, false);
    assert.deepEqual(first.missingFields, []);
    assert.deepEqual(first.malformedFields, [
      "title",
      "acceptanceCriteria.1.verification",
      "acceptanceCriteria.2.statement",
      "constraints.1",
      "stopConditions.0",
      "capabilityEnvelope.repoScopes.0.path",
      "capabilityEnvelope.repoScopes.0.access",
      "capabilityEnvelope.repoScopes.1",
      "capabilityEnvelope.toolPermissions.0.reason",
      "capabilityEnvelope.toolPermissions.0.risk",
      "capabilityEnvelope.budget.maxTokens",
      "capabilityEnvelope.budget.timeoutMs"
    ]);
    assert.deepEqual(
      first.failures.map(({ code, kind, checklistIndex, fieldPath, message }) => ({
        code,
        kind,
        checklistIndex,
        fieldPath,
        message
      })),
      [
        {
          code: "malformed-text-field",
          kind: "malformed",
          checklistIndex: 0,
          fieldPath: "title",
          message: "title must be a non-empty string after whitespace normalization."
        },
        {
          code: "malformed-verification-mode",
          kind: "malformed",
          checklistIndex: 4,
          fieldPath: "acceptanceCriteria.1.verification",
          message: "acceptanceCriteria.1.verification must be test, evidence, or manual."
        },
        {
          code: "malformed-acceptance-criterion",
          kind: "malformed",
          checklistIndex: 4,
          fieldPath: "acceptanceCriteria.2.statement",
          message: "acceptanceCriteria.2.statement must be a non-empty string."
        },
        {
          code: "malformed-string-list",
          kind: "malformed",
          checklistIndex: 5,
          fieldPath: "constraints.1",
          message: "constraints.1 must be a non-empty string."
        },
        {
          code: "malformed-stop-condition",
          kind: "malformed",
          checklistIndex: 6,
          fieldPath: "stopConditions.0",
          message:
            "stopConditions.0 must name a concrete timeout, budget, repair cap, policy gate, human checkpoint, verification failure, or escalation condition."
        },
        {
          code: "malformed-repo-scope",
          kind: "malformed",
          checklistIndex: 7,
          fieldPath: "capabilityEnvelope.repoScopes.0.path",
          message: "capabilityEnvelope.repoScopes.0.path must be a non-empty string."
        },
        {
          code: "malformed-repo-scope",
          kind: "malformed",
          checklistIndex: 7,
          fieldPath: "capabilityEnvelope.repoScopes.0.access",
          message: "capabilityEnvelope.repoScopes.0.access must be read, write, or execute."
        },
        {
          code: "malformed-repo-scope",
          kind: "malformed",
          checklistIndex: 7,
          fieldPath: "capabilityEnvelope.repoScopes.1",
          message: "capabilityEnvelope.repoScopes.1 must be an object with workspace, path, and access fields."
        },
        {
          code: "malformed-tool-permission",
          kind: "malformed",
          checklistIndex: 8,
          fieldPath: "capabilityEnvelope.toolPermissions.0.reason",
          message: "capabilityEnvelope.toolPermissions.0.reason must be a non-empty string."
        },
        {
          code: "malformed-tool-permission",
          kind: "malformed",
          checklistIndex: 8,
          fieldPath: "capabilityEnvelope.toolPermissions.0.risk",
          message: "capabilityEnvelope.toolPermissions.0.risk must be low, medium, or high."
        },
        {
          code: "malformed-budget-limit",
          kind: "malformed",
          checklistIndex: 9,
          fieldPath: "capabilityEnvelope.budget.maxTokens",
          message: "capabilityEnvelope.budget.maxTokens must be a non-negative finite number."
        },
        {
          code: "malformed-budget-limit",
          kind: "malformed",
          checklistIndex: 9,
          fieldPath: "capabilityEnvelope.budget.timeoutMs",
          message: "capabilityEnvelope.budget.timeoutMs must be a non-negative finite number."
        }
      ]
    );
  });

  it("flags acceptance criteria that are empty after normalization before promotion", () => {
    const report = validateIntentDraftWellFormedness({
      draft: {
        ...completeGreenfieldDraft(),
        acceptanceCriteria: [
          {
            statement: " \n\t\u00a0 ",
            verification: "test"
          },
          {
            text: " \u2003 ",
            verification: "evidence"
          }
        ]
      },
      mode: "greenfield"
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.missingFields, []);
    assert.deepEqual(report.malformedFields, [
      "acceptanceCriteria.0.statement",
      "acceptanceCriteria.1.statement"
    ]);
    assert.deepEqual(
      report.failures.map(({ code, kind, checklistIndex, fieldPath, message }) => ({
        code,
        kind,
        checklistIndex,
        fieldPath,
        message
      })),
      [
        {
          code: "malformed-acceptance-criterion",
          kind: "malformed",
          checklistIndex: 4,
          fieldPath: "acceptanceCriteria.0.statement",
          message: "acceptanceCriteria.0.statement is empty after normalization."
        },
        {
          code: "malformed-acceptance-criterion",
          kind: "malformed",
          checklistIndex: 4,
          fieldPath: "acceptanceCriteria.1.statement",
          message: "acceptanceCriteria.1.statement is empty after normalization."
        }
      ]
    );
  });

  it("flags missing, invalid, and multiple AC verification modes before promotion", () => {
    const draft: IntentDraft = {
      ...completeGreenfieldDraft(),
      acceptanceCriteria: [
        {
          statement: "Missing verification mode is a deterministic admission failure."
        },
        {
          statement: "Invalid verification mode is a deterministic admission failure.",
          verification: "review" as never
        },
        {
          statement: "Multiple verification modes are a deterministic admission failure.",
          verification: ["test", "manual"]
        }
      ]
    };

    const report = validateIntentDraftWellFormedness({
      draft,
      mode: "greenfield"
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.malformedFields, [
      "acceptanceCriteria.0.verification",
      "acceptanceCriteria.1.verification",
      "acceptanceCriteria.2.verification"
    ]);
    assert.deepEqual(
      report.failures.map(({ code, kind, checklistIndex, fieldPath, message }) => ({
        code,
        kind,
        checklistIndex,
        fieldPath,
        message
      })),
      [
        {
          code: "missing-verification-mode",
          kind: "malformed",
          checklistIndex: 4,
          fieldPath: "acceptanceCriteria.0.verification",
          message: "acceptanceCriteria.0.verification must choose exactly one mode: test, evidence, or manual."
        },
        {
          code: "malformed-verification-mode",
          kind: "malformed",
          checklistIndex: 4,
          fieldPath: "acceptanceCriteria.1.verification",
          message: "acceptanceCriteria.1.verification must be test, evidence, or manual."
        },
        {
          code: "multiple-verification-modes",
          kind: "malformed",
          checklistIndex: 4,
          fieldPath: "acceptanceCriteria.2.verification",
          message: "acceptanceCriteria.2.verification must choose exactly one verification mode; received 2."
        }
      ]
    );
  });

  it("uses the selected mode when deciding whether brownfield context is required", () => {
    const greenfield = evaluateIntentDraftCompleteness({
      draft: completeGreenfieldDraft(),
      mode: "greenfield"
    });
    const brownfield = evaluateIntentDraftCompleteness({
      draft: completeGreenfieldDraft(),
      mode: "brownfield"
    });

    assert.equal(greenfield.complete, true);
    assert.deepEqual(greenfield.missingDimensions, []);
    assert.deepEqual(greenfield.missingFields, []);
    assert.equal(
      greenfield.fieldChecks.some((check) => check.fieldPath === "context"),
      false
    );

    assert.equal(brownfield.complete, false);
    assert.deepEqual(brownfield.missingDimensions, ["brownfieldContext"]);
    assert.deepEqual(brownfield.missingFields, ["context"]);
  });
});

function completeGreenfieldDraft(): IntentDraft {
  return {
    title: "Scaffold deterministic intent admission checks",
    problem:
      "The factory front door needs a deterministic completeness report before mutable drafts can be promoted.",
    requester: "ouroboros-ac-30002",
    mode: "greenfield",
    goalArchetype: "cosmetic-tweak",
    acceptanceCriteria: [
      {
        statement: "Completeness checks report every missing required intent dimension in deterministic order.",
        verification: "test"
      }
    ],
    constraints: ["Keep the implementation scoped to the intent and policy admission surfaces."],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/intent",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          reason: "Exercise deterministic completeness checks.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 30_000
      }
    }
  };
}

function malformedGreenfieldDraft(): IntentDraft {
  return {
    ...completeGreenfieldDraft(),
    title: 42 as never,
    acceptanceCriteria: [
      {
        statement: "A well-formed criterion remains in place so malformed siblings are ordered precisely.",
        verification: "test"
      },
      {
        statement: "Every acceptance criterion chooses exactly one closed verification mode.",
        verification: "review" as never
      },
      {
        text: 17 as never,
        verification: "evidence"
      }
    ],
    constraints: ["Keep the implementation scoped to intent admission.", ""],
    stopConditions: ["done"],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "",
          access: "admin" as never
        },
        null as never
      ],
      toolPermissions: [
        {
          tool: "node:test",
          reason: "",
          risk: "extreme" as never
        }
      ],
      budget: {
        maxTokens: Number.NaN,
        timeoutMs: -1
      }
    }
  };
}
