import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTENT_AMBIGUITY_WEIGHTING_PROFILES,
  createClarificationQuestionKey,
  normalizeAcceptanceCriteria,
  validateCapabilityEnvelopeRepairLoopCount,
  type IntentDraft,
  type IntentDraftFieldPath
} from "@protostar/intent";

import {
  ARCHETYPE_POLICY_TABLE,
  BUGFIX_GOAL_ARCHETYPE,
  CAPABILITY_ENVELOPE_BUDGET_LIMIT_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_EXECUTE_GRANT_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_TOOL_PERMISSION_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_WRITE_GRANT_VIOLATION_CODES,
  COSMETIC_TWEAK_GOAL_ARCHETYPE,
  ADMISSION_DECISION_ARTIFACT_NAME,
  ADMISSION_DECISION_OUTCOMES,
  ADMISSION_DECISION_SCHEMA_VERSION,
  DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE,
  FEATURE_ADD_GOAL_ARCHETYPE,
  admitBugfixCapabilityEnvelope,
  admitCosmeticTweakCapabilityEnvelope,
  admitFeatureAddCapabilityEnvelope,
  admitRefactorCapabilityEnvelope,
  autoTagIntentDraftArchetype,
  createAdmissionDecisionArtifact,
  detectCapabilityEnvelopeOverages,
  evaluateIntentAmbiguityAdmission,
  evaluateRepoScopeAdmission,
  GOAL_ARCHETYPE_POLICY_TABLE,
  INTENT_ARCHETYPE_REGISTRY,
  INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE,
  MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE,
  REFACTOR_GOAL_ARCHETYPE,
  REPO_SCOPE_ACCESS_VALUES,
  REPO_SCOPE_ADMISSION_REASON_CODES,
  promoteIntentDraft,
  SUPPORTED_GOAL_ARCHETYPES,
  V0_0_1_INTENT_ARCHETYPE_IDS,
  V0_0_1_INTENT_ARCHETYPE_REGISTRY,
  validateCapabilityEnvelopeBudgetLimits,
  validateCapabilityEnvelopeExecuteGrants,
  validateCapabilityEnvelopeWriteGrants,
  validateCapabilityEnvelopeRepoScopes,
  validateCapabilityEnvelopeToolPermissions,
  validateIntentDraftCapabilityEnvelopeAdmission,
  type GoalArchetype,
  type GoalArchetypeCapabilityGrantKind,
  type GoalArchetypePolicyEntry,
  type GoalArchetypePolicyTable,
  type PromoteIntentDraftResult
} from "./index.js";

describe("intent admission policy", () => {
  describe("AC 40104 focused draft gate coverage", () => {
    it("promotes complete valid drafts with normalized confirmed-intent output", () => {
      const result = promoteIntentDraft({
        draft: clearCosmeticDraft(),
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assertPromotionSucceeded(result);
      assert.equal(result.intent.id, "intent_cosmetic_copy_update");
      assert.equal(result.intent.confirmedAt, "2026-04-25T00:00:00.000Z");
      assert.equal(result.ambiguityAssessment.accepted, true);
      assert.equal(result.ambiguityAssessment.ambiguity <= 0.2, true);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.missingFieldDetections, []);
      assert.deepEqual(result.requiredClarifications, []);
      assert.deepEqual(result.hardZeroReasons, []);
    assert.deepEqual(
        result.intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
          id,
          statement,
          verification
        })),
        [
          {
            id: "ac_359329cba7b9a27b",
            statement: "The settings page copy uses the approved operator-facing wording without changing behavior.",
            verification: "evidence"
          },
          {
            id: "ac_b96898ca038f7649",
            statement: "The focused intent admission tests pass with deterministic ordering and stable normalized AC ids.",
            verification: "test"
          }
        ]
      );
    });

    it("covers AC 40203 promotion gating for pass, ambiguity-fail, checklist-fail, and combined-fail cases", () => {
      const clearDraft = clearCosmeticDraft();
      const highRiskCapabilityEnvelope = {
        ...clearDraft.capabilityEnvelope,
        toolPermissions: [
          {
            tool: "shell",
            reason: "Exercise an otherwise complete draft whose authority overage must bump ambiguity.",
            risk: "high" as const
          }
        ]
      };
      const { requester: _omittedRequester, ...checklistFailDraft } = clearDraft;

      const pass = promoteIntentDraft({
        draft: clearDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      assertPromotionSucceeded(pass);
      assert.equal(pass.ambiguityAssessment.accepted, true);
      assert.equal(pass.ambiguityAssessment.ambiguity <= 0.2, true);
      assert.equal(pass.requiredDimensionChecklist.every((check) => check.passed), true);
      assert.equal(pass.requiredFieldChecklist.every((check) => check.passed), true);
      assert.deepEqual(pass.errors, []);

      const ambiguityFail = promoteIntentDraft({
        draft: {
          ...clearDraft,
          capabilityEnvelope: highRiskCapabilityEnvelope
        },
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      assertPromotionFailed(ambiguityFail, "ambiguity-only");
      assert.equal(ambiguityFail.failureDetails.checklistFailed, false);
      assert.equal(ambiguityFail.failureDetails.ambiguityFailed, true);
      assert.equal(ambiguityFail.requiredDimensionChecklist.every((check) => check.passed), true);
      assert.equal(ambiguityFail.requiredFieldChecklist.every((check) => check.passed), true);
      assert.equal(ambiguityFail.ambiguityAssessment.ambiguity > 0.2, true);
      assert.equal(ambiguityFail.policyFindings[0]?.code, "tool-authority-overage");

      const checklistFail = promoteIntentDraft({
        draft: checklistFailDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      assertPromotionFailed(checklistFail, "checklist-only");
      assert.equal(checklistFail.failureDetails.checklistFailed, true);
      assert.equal(checklistFail.failureDetails.ambiguityFailed, false);
      assert.equal(checklistFail.ambiguityAssessment.accepted, true);
      assert.equal(checklistFail.ambiguityAssessment.ambiguity <= 0.2, true);
      assert.ok(
        checklistFail.failureDetails.checklistErrors.includes("requester must be provided before promotion.")
      );
      assert.deepEqual(checklistFail.failureDetails.ambiguityErrors, []);

      const combinedFail = promoteIntentDraft({
        draft: {
          ...checklistFailDraft,
          capabilityEnvelope: highRiskCapabilityEnvelope
        },
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      assertPromotionFailed(combinedFail, "combined");
      assert.equal(combinedFail.failureDetails.checklistFailed, true);
      assert.equal(combinedFail.failureDetails.ambiguityFailed, true);
      assert.ok(combinedFail.failureDetails.checklistErrors.includes("requester must be provided before promotion."));
      assert.ok(
        combinedFail.failureDetails.ambiguityErrors.some((error) =>
          error.includes("exceeds admission ceiling 0.20")
        )
      );
      assert.equal(combinedFail.policyFindings[0]?.code, "tool-authority-overage");
    });

    it("defines the admission-decision.json payload contract for allow, block, and escalate decisions", () => {
      const clearDraft = clearCosmeticDraft();
      const allowPromotion = promoteIntentDraft({
        draft: clearDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      assertPromotionSucceeded(allowPromotion);
      const allowArtifact = createAdmissionDecisionArtifact({
        draft: clearDraft,
        promotion: allowPromotion
      });

      assert.equal(ADMISSION_DECISION_ARTIFACT_NAME, "admission-decision.json");
      assert.equal(ADMISSION_DECISION_SCHEMA_VERSION, "protostar.intent.admission-decision.v1");
      assert.deepEqual(ADMISSION_DECISION_OUTCOMES, ["allow", "block", "escalate"]);
      assert.equal(allowArtifact.artifact, ADMISSION_DECISION_ARTIFACT_NAME);
      assert.equal(allowArtifact.schemaVersion, ADMISSION_DECISION_SCHEMA_VERSION);
      assert.equal(allowArtifact.decision, "allow");
      assert.equal(allowArtifact.admitted, true);
      assert.equal(allowArtifact.draftId, clearDraft.draftId);
      assert.equal(allowArtifact.confirmedIntentId, allowPromotion.intent.id);
      assert.deepEqual(allowArtifact.details.gate, {
        ambiguityPassed: true,
        requiredChecklistPassed: true,
        policyPassed: true,
        structurallyMissingAutoFail: false,
        confirmedIntentCreated: true
      });
      assert.deepEqual(allowArtifact.errors, []);
      assert.deepEqual(allowArtifact.details.missingFieldDetections, []);
      assert.deepEqual(allowArtifact.details.requiredClarifications, []);
      assert.deepEqual(allowArtifact.details.policyFindings, []);

      const { requester: _requester, ...missingRequesterDraft } = clearDraft;
      const blockPromotion = promoteIntentDraft({
        draft: missingRequesterDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      assertPromotionFailed(blockPromotion, "checklist-only");
      const blockArtifact = createAdmissionDecisionArtifact({
        draft: missingRequesterDraft,
        promotion: blockPromotion
      });

      assert.equal(blockArtifact.decision, "block");
      assert.equal(blockArtifact.admitted, false);
      assert.equal(blockArtifact.details.gate.requiredChecklistPassed, false);
      assert.equal(blockArtifact.details.gate.ambiguityPassed, true);
      assert.equal(blockArtifact.details.gate.confirmedIntentCreated, false);
      assert.equal(blockArtifact.details.failure?.state, "checklist-only");
      assert.equal(blockArtifact.details.failure?.confirmedIntentCreated, false);
      assert.ok(
        blockArtifact.details.missingFieldDetections.some((detection) => detection.fieldPath === "requester")
      );
      assert.ok(
        blockArtifact.details.requiredClarifications.some((clarification) =>
          clarification.fieldPath.includes("requester")
        )
      );

      const escalateDraft = {
        ...clearDraft,
        capabilityEnvelope: {
          ...clearDraft.capabilityEnvelope,
          toolPermissions: [
            {
              tool: "shell",
              reason: "Exercise an otherwise complete draft whose authority overage must escalate admission.",
              risk: "high" as const
            }
          ]
        }
      };
      const escalatePromotion = promoteIntentDraft({
        draft: escalateDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      assertPromotionFailed(escalatePromotion, "ambiguity-only");
      const escalateArtifact = createAdmissionDecisionArtifact({
        draft: escalateDraft,
        promotion: escalatePromotion
      });

      assert.equal(escalateArtifact.decision, "escalate");
      assert.equal(escalateArtifact.admitted, false);
      assert.equal(escalateArtifact.details.gate.requiredChecklistPassed, true);
      assert.equal(escalateArtifact.details.gate.ambiguityPassed, false);
      assert.equal(escalateArtifact.details.gate.policyPassed, false);
      assert.equal(escalateArtifact.details.failure?.state, "ambiguity-only");
      assert.ok(
        escalateArtifact.details.policyFindings.some((finding) => finding.code === "tool-authority-overage")
      );
      assert.ok(
        escalateArtifact.details.requiredClarifications.some((clarification) =>
          clarification.source === "policy-finding"
        )
      );
    });

    it("blocks drafts with missing required fields and surfaces resolvable clarification prompts", () => {
      const result = promoteIntentDraft({
        draft: {},
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assert.equal(result.ok, false);
      assert.equal("ambiguityAssessment" in result, true);
      assert.equal(result.failureDetails.confirmedIntentCreated, false);
    assert.deepEqual(
        result.missingFieldDetections
          .filter((detection) => detection.source === "required-field-checklist")
          .map(({ code, fieldPath }) => ({ code, fieldPath })),
        [
          { code: "missing-required-field", fieldPath: "title" },
          { code: "missing-required-field", fieldPath: "problem" },
          { code: "missing-required-field", fieldPath: "requester" },
          { code: "missing-required-field", fieldPath: "goalArchetype" },
          { code: "missing-required-field", fieldPath: "acceptanceCriteria" },
          { code: "missing-required-field", fieldPath: "constraints" },
          { code: "missing-required-field", fieldPath: "stopConditions" },
          { code: "missing-required-field", fieldPath: "capabilityEnvelope.repoScopes" },
          { code: "missing-required-field", fieldPath: "capabilityEnvelope.toolPermissions" },
          { code: "missing-required-field", fieldPath: "capabilityEnvelope.budget" },
          { code: "missing-required-field", fieldPath: "context" }
        ]
      );
    assert.deepEqual(
        result.hardZeroReasons
          .filter((reason) => reason.source === "required-dimension-checklist")
          .map(({ dimensionId, missingFields }) => ({ dimensionId, missingFields })),
        [
          { dimensionId: "goal", missingFields: ["title", "problem"] },
          { dimensionId: "requester", missingFields: ["requester"] },
          { dimensionId: "goalArchetype", missingFields: ["goalArchetype"] },
          { dimensionId: "successCriteria", missingFields: ["acceptanceCriteria"] },
          { dimensionId: "constraints", missingFields: ["constraints"] },
          { dimensionId: "stopConditions", missingFields: ["stopConditions"] },
          {
            dimensionId: "capabilityEnvelope",
            missingFields: [
              "capabilityEnvelope.repoScopes",
              "capabilityEnvelope.toolPermissions",
              "capabilityEnvelope.budget"
            ]
          },
          { dimensionId: "brownfieldContext", missingFields: ["context"] }
        ]
      );
      for (const fieldPath of [
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
      ]) {
        assert.ok(
          result.requiredClarifications.some((clarification) => clarification.fieldPath === fieldPath),
          `Expected a required clarification for ${fieldPath}.`
        );
      }
    });

    it("blocks drafts with malformed required fields and reports nested failure paths", () => {
      const result = promoteIntentDraft({
        draft: malformedCosmeticDraft(),
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assert.equal(result.ok, false);
      assert.equal("ambiguityAssessment" in result, true);
      assert.equal(result.failureDetails.confirmedIntentCreated, false);
      assert.deepEqual(
        result.missingFieldDetections
          .filter((detection) => detection.source === "required-field-checklist")
          .map(({ code, fieldPath }) => ({ code, fieldPath })),
        [
          { code: "malformed-text-field", fieldPath: "title" },
          { code: "malformed-verification-mode", fieldPath: "acceptanceCriteria.0.verification" },
          { code: "malformed-repo-scope", fieldPath: "capabilityEnvelope.repoScopes.0.path" },
          { code: "malformed-repo-scope", fieldPath: "capabilityEnvelope.repoScopes.0.access" },
          { code: "malformed-tool-permission", fieldPath: "capabilityEnvelope.toolPermissions.0.tool" },
          { code: "malformed-tool-permission", fieldPath: "capabilityEnvelope.toolPermissions.0.risk" },
          { code: "malformed-budget-limit", fieldPath: "capabilityEnvelope.budget.timeoutMs" }
        ]
      );
      assert.deepEqual(
        result.requiredClarifications
          .filter((clarification) => clarification.source === "clarification-question-generator")
          .map(({ fieldPath }) => fieldPath),
        [
          "acceptanceCriteria.0.verification",
          "capabilityEnvelope",
          "capabilityEnvelope.repoScopes.0.path",
          "capabilityEnvelope.repoScopes.0.access",
          "capabilityEnvelope.toolPermissions.0.tool",
          "capabilityEnvelope.toolPermissions.0.risk",
          "capabilityEnvelope.budget.timeoutMs"
        ]
      );
    });

    it("treats invalid manual justifications as manual-unjustified ambiguity instead of checklist malformation", () => {
      const draft = {
        ...clearCosmeticDraft(),
        acceptanceCriteria: [
          {
            statement: "The operator records the manually inspected admission-control report.",
            verification: "manual",
            justification: { reason: "operator review" } as never
          }
        ]
      } satisfies IntentDraft;
      const result = promoteIntentDraft({
        draft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      const repeated = promoteIntentDraft({
        draft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      const normalized = normalizeAcceptanceCriteria(draft.acceptanceCriteria);
      const [weakCriterion] = normalized.weakAcceptanceCriteria;
      assert.ok(weakCriterion);

      assert.equal(result.ok, false);
      assert.deepEqual(repeated, result);
      assert.equal(result.failureState, "ambiguity-only");
      assert.deepEqual(result.failureDetails.checklistErrors, []);
      assert.equal(result.failureDetails.checklistFailed, false);
      assert.equal(result.failureDetails.ambiguityFailed, true);
      assert.deepEqual(
        result.requiredFieldChecklist.flatMap((check) =>
          check.failures.map(({ fieldPath, message }) => ({ fieldPath, message }))
        ),
        []
      );
      assert.deepEqual(
        result.ambiguityAssessment.dimensionScores
          .filter((score) => score.dimension === "successCriteria")
          .map(({ score, missingFields }) => ({ score, missingFields })),
        [
          {
            score: 0.85,
            missingFields: ["acceptanceCriteria.0.justification"]
          }
        ]
      );
      assert.ok(
        result.requiredClarifications.some(
          (clarification) =>
            clarification.fieldPath === "acceptanceCriteria.0.justification" &&
            clarification.source === "clarification-question-generator"
        )
      );
      assert.deepEqual(
        result.policyFindings.map((finding) => ({
          code: finding.code,
          fieldPath: finding.fieldPath,
          severity: finding.severity,
          overridable: finding.overridable,
          overridden: finding.overridden,
          ambiguityDimension: finding.ambiguityDimension,
          acceptanceCriterionId: finding.acceptanceCriterionId,
          acceptanceCriterionIndex: finding.acceptanceCriterionIndex,
          affectedAcceptanceCriterionIds: finding.affectedAcceptanceCriterionIds,
          references: finding.references
        })),
        [
          {
            code: MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE,
            fieldPath: "acceptanceCriteria.0.justification",
            severity: "ambiguity",
            overridable: false,
            overridden: false,
            ambiguityDimension: "successCriteria",
            acceptanceCriterionId: weakCriterion.criterionId,
            acceptanceCriterionIndex: 0,
            affectedAcceptanceCriterionIds: [weakCriterion.criterionId],
            references: [
              {
                type: "acceptance-criterion",
                id: weakCriterion.criterionId,
                index: 0,
                fieldPath: "acceptanceCriteria.0"
              }
            ]
          }
        ]
      );
      assert.ok(
        result.requiredClarifications.some(
          (clarification) =>
            clarification.source === "policy-finding" &&
            clarification.issueCode === MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE &&
            clarification.fieldPath === "acceptanceCriteria.0.justification" &&
            clarification.affectedAcceptanceCriterionIds?.[0] === weakCriterion.criterionId &&
            clarification.references?.[0]?.id === weakCriterion.criterionId
        )
      );
    });

    it("covers AC 50304 manual justification cases without affecting non-manual ACs", () => {
      const justifiedManualDraft = {
        ...clearCosmeticDraft(),
        acceptanceCriteria: [
          {
            statement: "The operator records the manually inspected admission-control report.",
            verification: "manual",
            justification: "  Operator comparison is required because the rendered report is not machine-readable. "
          },
          {
            statement: "The admission report artifact is captured as review evidence.",
            verification: "evidence"
          },
          {
            statement: "The focused admission-control tests pass.",
            verification: "test",
            justification: " \n\t "
          }
        ]
      } satisfies IntentDraft;
      const promoted = promoteIntentDraft({
        draft: justifiedManualDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assertPromotionSucceeded(promoted);
      assert.deepEqual(promoted.policyFindings, []);
      assert.deepEqual(promoted.requiredClarifications, []);
      assert.equal(
        promoted.intent.acceptanceCriteria[0]?.justification,
        "Operator comparison is required because the rendered report is not machine-readable."
      );
      assert.equal(Object.hasOwn(promoted.intent.acceptanceCriteria[1]!, "justification"), false);
      assert.equal(Object.hasOwn(promoted.intent.acceptanceCriteria[2]!, "justification"), false);

      const weakManualDraft = {
        ...clearCosmeticDraft(),
        acceptanceCriteria: [
          {
            statement: "Manual admission report inspection has a missing justification.",
            verification: "manual"
          },
          {
            statement: "Manual release report inspection has a blank justification.",
            verification: "manual",
            justification: " \n\t "
          },
          {
            statement: "Manual policy report inspection has an invalid justification value.",
            verification: "manual",
            justification: ["operator review"] as never
          },
          {
            statement: "Automated tests remain unaffected by manual-justification rules.",
            verification: "test",
            justification: " \n\t "
          },
          {
            statement: "Evidence capture remains unaffected by manual-justification rules.",
            verification: "evidence"
          }
        ]
      } satisfies IntentDraft;
      const normalized = normalizeAcceptanceCriteria(weakManualDraft.acceptanceCriteria);
      const blocked = promoteIntentDraft({
        draft: weakManualDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assert.equal(normalized.ok, true);
      assert.deepEqual(
        normalized.acceptanceCriteria.map((criterion) => ({
          verification: criterion.verification,
          weak: criterion.weak,
          justification: criterion.justification
        })),
        [
          { verification: "manual", weak: true, justification: "" },
          { verification: "manual", weak: true, justification: "" },
          { verification: "manual", weak: true, justification: "" },
          { verification: "test", weak: false, justification: undefined },
          { verification: "evidence", weak: false, justification: undefined }
        ]
      );
      assert.deepEqual(
        normalized.weakAcceptanceCriteria.map(({ index, fieldPath, reason }) => ({
          index,
          fieldPath,
          reason
        })),
        [
          {
            index: 0,
            fieldPath: "acceptanceCriteria.0.justification",
            reason: "manual-without-justification"
          },
          {
            index: 1,
            fieldPath: "acceptanceCriteria.1.justification",
            reason: "manual-without-justification"
          },
          {
            index: 2,
            fieldPath: "acceptanceCriteria.2.justification",
            reason: "manual-without-justification"
          }
        ]
      );
      assertPromotionFailed(blocked, "ambiguity-only");
      assert.deepEqual(blocked.failureDetails.checklistErrors, []);
      assert.deepEqual(
        blocked.policyFindings.map((finding) => ({
          code: finding.code,
          fieldPath: finding.fieldPath,
          acceptanceCriterionIndex: finding.acceptanceCriterionIndex,
          acceptanceCriterionId: finding.acceptanceCriterionId,
          affectedAcceptanceCriterionIds: finding.affectedAcceptanceCriterionIds
        })),
        normalized.weakAcceptanceCriteria.map((weakness) => ({
          code: MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE,
          fieldPath: weakness.fieldPath,
          acceptanceCriterionIndex: weakness.index,
          acceptanceCriterionId: weakness.criterionId,
          affectedAcceptanceCriterionIds: [weakness.criterionId]
        }))
      );
      assert.deepEqual(
        blocked.ambiguityAssessment.dimensionScores
          .filter((score) => score.dimension === "successCriteria")
          .map(({ score, missingFields }) => ({ score, missingFields })),
        [
          {
            score: 0.85,
            missingFields: [
              "acceptanceCriteria.0.justification",
              "acceptanceCriteria.1.justification",
              "acceptanceCriteria.2.justification"
            ]
          }
        ]
      );
      assert.deepEqual(
        blocked.requiredClarifications
          .filter(
            (clarification) =>
              clarification.source === "policy-finding" &&
              clarification.issueCode === MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE
          )
          .map((clarification) => clarification.fieldPath),
        [
          "acceptanceCriteria.0.justification",
          "acceptanceCriteria.1.justification",
          "acceptanceCriteria.2.justification"
        ]
      );
    });

    it("flags duplicate normalized acceptance criteria as admission ambiguity", () => {
      const duplicateDraft = {
        ...clearCosmeticDraft(),
        stopConditions: ["Stop if duplicate acceptance-criterion admission diagnostics are not surfaced."],
        acceptanceCriteria: [
          {
            statement: "  The operator-visible admission report lists each normalized acceptance criterion.\n",
            verification: "evidence"
          },
          {
            text: "The operator-visible admission   report lists each normalized acceptance criterion.",
            verification: "test"
          }
        ]
      } satisfies IntentDraft;
      const normalized = normalizeAcceptanceCriteria(duplicateDraft.acceptanceCriteria);
      const blocked = promoteIntentDraft({
        draft: duplicateDraft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      const duplicateCriterionId = normalized.diagnostics.find(
        (diagnostic) => diagnostic.code === DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE
      )?.criterionId;
      assert.ok(duplicateCriterionId);

      assert.equal(normalized.ok, true);
      assert.equal(normalized.acceptanceCriteria.length, 1);
      assert.deepEqual(normalized.errors, []);
      assert.deepEqual(
        normalized.diagnostics.map(({ code, severity, fieldPath, index, criterionId, message }) => ({
          code,
          severity,
          fieldPath,
          index,
          criterionId,
          message
        })),
        [
          {
            code: "duplicate-acceptance-criterion",
            severity: "weak",
            fieldPath: "acceptanceCriteria.1.statement",
            index: 1,
            criterionId: duplicateCriterionId,
            message: "acceptanceCriteria.1.statement duplicates acceptanceCriteria.0.statement after normalization."
          }
        ]
      );
      assertPromotionFailed(blocked, "ambiguity-only");
      assert.deepEqual(blocked.failureDetails.checklistErrors, []);
      assert.deepEqual(
        blocked.policyFindings.map((finding) => ({
          code: finding.code,
          fieldPath: finding.fieldPath,
          acceptanceCriterionIndex: finding.acceptanceCriterionIndex,
          acceptanceCriterionId: finding.acceptanceCriterionId,
          affectedAcceptanceCriterionIds: finding.affectedAcceptanceCriterionIds
        })),
        [
          {
            code: DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE,
            fieldPath: "acceptanceCriteria.1.statement",
            acceptanceCriterionIndex: 1,
            acceptanceCriterionId: duplicateCriterionId,
            affectedAcceptanceCriterionIds: [duplicateCriterionId]
          }
        ]
      );
      assert.deepEqual(
        blocked.ambiguityAssessment.dimensionScores
          .filter((score) => score.dimension === "successCriteria")
          .map(({ score, missingFields }) => ({ score, missingFields })),
        [
          {
            score: 0.85,
            missingFields: ["acceptanceCriteria.1.statement"]
          }
        ]
      );
      assert.deepEqual(
        blocked.requiredClarifications
          .filter((clarification) => clarification.fieldPath === "acceptanceCriteria.1.statement")
          .map((clarification) => clarification.prompt),
        [
          "acceptanceCriteria.1.statement duplicates acceptanceCriteria.0.statement after normalization."
        ]
      );
    });

    it("keeps deterministic failure ordering stable across repeated blocked promotions", () => {
      const missingFirst = promoteIntentDraft({
        draft: {},
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      const missingSecond = promoteIntentDraft({
        draft: {},
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      const malformedFirst = promoteIntentDraft({
        draft: malformedCosmeticDraft(),
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });
      const malformedSecond = promoteIntentDraft({
        draft: malformedCosmeticDraft(),
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assert.equal(missingFirst.ok, false);
      assert.equal(malformedFirst.ok, false);
      assert.deepEqual(missingSecond, missingFirst);
      assert.deepEqual(malformedSecond, malformedFirst);
      assert.equal(missingFirst.failureState, "combined");
      assert.equal(malformedFirst.failureState, "combined");
      assert.equal("intent" in missingFirst, false);
      assert.equal("intent" in malformedFirst, false);
      assert.deepEqual(
        missingFirst.failureDetails.checklistErrors,
        [
          "title and problem must describe the requested factory outcome.",
          "requester must identify the accountable operator or workflow.",
          "goalArchetype must select the policy cap table row for admission.",
          "acceptanceCriteria must contain at least one measurable outcome.",
          "constraints must state operator, product, policy, or safety boundaries.",
          "stopConditions must define deterministic halt, pause, or escalation criteria.",
          "capabilityEnvelope must bound repository access, tool authority, and budget.",
          "context must describe the existing repository or product state for brownfield work.",
          "title must be provided before promotion.",
          "problem must be provided before promotion.",
          "requester must be provided before promotion.",
          "goalArchetype must be provided before promotion.",
          "acceptanceCriteria must contain at least one entry before promotion.",
          "constraints must contain at least one non-empty entry before promotion.",
          "stopConditions must define a deterministic halt, pause, or escalation condition before promotion.",
          "capabilityEnvelope.repoScopes must contain at least one repository scope before promotion.",
          "capabilityEnvelope.toolPermissions must contain at least one tool grant before promotion.",
          "capabilityEnvelope.budget must contain at least one non-negative finite limit before promotion.",
          "context must be provided for brownfield promotion.",
          "goalArchetype is structurally missing, so capability caps cannot be selected."
        ]
      );
      assert.deepEqual(missingFirst.failureDetails.ambiguityErrors.slice(0, 2), [
        "Intent ambiguity 1.00 exceeds admission ceiling 0.20.",
        "Structurally missing dimensions: goal, constraints, successCriteria, context."
      ]);
      assert.deepEqual(
        malformedFirst.failureDetails.checklistErrors,
        [
          "title and problem must describe the requested factory outcome.",
          "acceptanceCriteria must contain at least one measurable outcome.",
          "capabilityEnvelope must bound repository access, tool authority, and budget.",
          "title must be a non-empty string after whitespace normalization.",
          "acceptanceCriteria.0.verification must be test, evidence, or manual.",
          "capabilityEnvelope.repoScopes.0.path must be a non-empty string.",
          "capabilityEnvelope.repoScopes.0.access must be read, write, or execute.",
          "capabilityEnvelope.toolPermissions.0.tool must be a non-empty string.",
          "capabilityEnvelope.toolPermissions.0.risk must be low, medium, or high.",
          "capabilityEnvelope.budget.timeoutMs must be a non-negative finite number."
        ]
      );
      assert.deepEqual(malformedFirst.failureDetails.ambiguityErrors.slice(0, 2), [
        "Intent ambiguity 0.63 exceeds admission ceiling 0.20.",
        "Structurally missing dimensions: goal, successCriteria."
      ]);
    });
  });

  it("defines typed goal-archetype policy entries for capability admission caps", () => {
    const policyTable: GoalArchetypePolicyTable = GOAL_ARCHETYPE_POLICY_TABLE;
    const publicPolicyTable: GoalArchetypePolicyTable = ARCHETYPE_POLICY_TABLE;
    const cosmeticPolicy: GoalArchetypePolicyEntry = policyTable["cosmetic-tweak"];

    assert.equal(publicPolicyTable, policyTable);
    assert.deepEqual(Object.keys(policyTable), [...SUPPORTED_GOAL_ARCHETYPES]);
    for (const archetype of SUPPORTED_GOAL_ARCHETYPES) {
      const policy = policyTable[archetype];
      assert.equal(policy.repo_scope.required, true);
      assert.deepEqual(policy.allowedRepoScopeValues, policy.repo_scope.allowedValues);
      assert.equal(policy.tool_permissions.required, true);
      assert.equal(policy.writeGrant.access, "write");
      assert.equal(policy.executeGrant.access, "execute");
      assert.equal(policy.toolPermissionLimits.required, policy.tool_permissions.required);
      assert.ok(policy.toolPermissionGrants.allowedTools.length > 0);
      assert.ok(policy.toolPermissionGrants.allowedPermissionLevels.length > 0);
      assert.ok(policy.grants.required.includes("repo_scope"));
      assert.ok(policy.grants.required.includes("tool_permissions"));
      assert.ok(policy.grants.required.includes("budgets"));
      assert.equal(policy.status, archetype === "cosmetic-tweak" ? "wired" : "stub");
    }

    assert.equal(cosmeticPolicy.status, "wired");
    assert.deepEqual(cosmeticPolicy.repo_scope, {
      required: true,
      allowedValues: ["read", "write"],
      maxAccess: "write",
      pathBoundary: "bounded"
    });
    assert.deepEqual(cosmeticPolicy.allowedRepoScopeValues, ["read", "write"]);
    assert.deepEqual(cosmeticPolicy.grants.required, [
      "repo_scope",
      "tool_permissions",
      "budgets",
      "repair_loop_count"
    ]);
    assert.deepEqual(cosmeticPolicy.grants.optional, []);
    assert.deepEqual(cosmeticPolicy.grants.forbidden, []);
    assert.deepEqual(cosmeticPolicy.writeGrant, {
      access: "write",
      allowed: true,
      pathBoundary: "bounded",
      overridable: false
    });
    assert.deepEqual(cosmeticPolicy.executeGrant, {
      access: "execute",
      allowed: false,
      pathBoundary: "bounded",
      overridable: true,
      allowedCommands: [],
      allowedExecutionScopes: []
    });
    assert.deepEqual(cosmeticPolicy.tool_permissions, {
      required: true,
      maxToolRisk: "low",
      allowedRiskLevels: ["low"]
    });
    assert.deepEqual(cosmeticPolicy.toolPermissionLimits, {
      required: true,
      maxRisk: "low",
      allowedRiskLevels: ["low"]
    });
    assert.deepEqual(cosmeticPolicy.toolPermissionGrants, {
      allowedTools: ["node:test", "typescript", "shell"],
      allowedPermissionLevels: ["read", "use"],
      maxPermissionLevel: "use"
    });
    assert.deepEqual(cosmeticPolicy.budgets, {
      timeoutMs: 300_000,
      repair_loop_count: 1
    });
    assert.equal(cosmeticPolicy.repair_loop_count, 1);
    assert.equal(cosmeticPolicy.budgetCaps.maxRepairLoops, cosmeticPolicy.budgets.repair_loop_count);
  });

  it("defines the v0.0.1 intent archetype registry with one supported wired archetype and unsupported stub caps", () => {
    assert.equal(V0_0_1_INTENT_ARCHETYPE_REGISTRY, INTENT_ARCHETYPE_REGISTRY);
    assert.deepEqual(Object.keys(INTENT_ARCHETYPE_REGISTRY), [...V0_0_1_INTENT_ARCHETYPE_IDS]);
    assert.equal(INTENT_ARCHETYPE_REGISTRY["cosmetic-tweak"].supportStatus, "supported");
    assert.equal(INTENT_ARCHETYPE_REGISTRY["cosmetic-tweak"].supported, true);
    assert.equal(INTENT_ARCHETYPE_REGISTRY["cosmetic-tweak"].capabilityCapStatus, "wired");
    assert.equal(INTENT_ARCHETYPE_REGISTRY["cosmetic-tweak"].policy, GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"]);

    for (const archetype of ["feature-add", "refactor", "bugfix"] as const) {
      assert.equal(INTENT_ARCHETYPE_REGISTRY[archetype].supportStatus, "unsupported");
      assert.equal(INTENT_ARCHETYPE_REGISTRY[archetype].supported, false);
      assert.equal(INTENT_ARCHETYPE_REGISTRY[archetype].capabilityCapStatus, "stub");
      assert.equal(INTENT_ARCHETYPE_REGISTRY[archetype].policy, GOAL_ARCHETYPE_POLICY_TABLE[archetype]);
    }
  });

  it("covers every goal-archetype policy entry with required scope, grants, permissions, budget, and repair-loop limits", () => {
    const policyTable: GoalArchetypePolicyTable = GOAL_ARCHETYPE_POLICY_TABLE;
    const policyGrantKinds = [
      "repo_scope",
      "tool_permissions",
      "budgets",
      "repair_loop_count"
    ] as const satisfies readonly GoalArchetypeCapabilityGrantKind[];

    assert.deepEqual(Object.keys(policyTable), [...SUPPORTED_GOAL_ARCHETYPES]);

    for (const archetype of SUPPORTED_GOAL_ARCHETYPES) {
      const policy = policyTable[archetype];
      const grantBuckets = [
        ...policy.grants.required,
        ...policy.grants.optional,
        ...policy.grants.forbidden
      ];

      assert.equal(policy.repo_scope.required, true, `${archetype} must require an explicit repo scope.`);
      assert.ok(["read", "write", "execute"].includes(policy.repo_scope.maxAccess), `${archetype} repo access cap.`);
      assert.deepEqual(
        policy.allowedRepoScopeValues,
        policy.repo_scope.allowedValues,
        `${archetype} top-level allowed repo-scope values must mirror repo_scope.allowedValues.`
      );
      assert.ok(
        policy.allowedRepoScopeValues.length > 0,
        `${archetype} must list at least one allowed repo-scope value.`
      );
      assert.deepEqual(
        policy.allowedRepoScopeValues.filter((value) => REPO_SCOPE_ACCESS_VALUES.includes(value)),
        policy.allowedRepoScopeValues,
        `${archetype} allowed repo-scope values must stay within the repo access value set.`
      );
      assert.ok(
        policy.allowedRepoScopeValues.includes(policy.repo_scope.maxAccess),
        `${archetype} allowed repo-scope values must include the max access cap.`
      );
      assert.equal(policy.writeGrant.access, "write", `${archetype} must expose an explicit write grant.`);
      assert.equal(
        policy.writeGrant.allowed,
        policy.allowedRepoScopeValues.includes("write"),
        `${archetype} write grant must mirror write access admission.`
      );
      assert.equal(
        policy.writeGrant.pathBoundary,
        policy.repo_scope.pathBoundary,
        `${archetype} write grant must carry the repo-scope path boundary.`
      );
      assert.equal(policy.executeGrant.access, "execute", `${archetype} must expose an explicit execute grant.`);
      assert.equal(
        policy.executeGrant.allowed,
        policy.allowedRepoScopeValues.includes("execute"),
        `${archetype} execute grant must mirror execute access admission.`
      );
      assert.equal(
        policy.executeGrant.pathBoundary,
        policy.repo_scope.pathBoundary,
        `${archetype} execute grant must carry the repo-scope path boundary.`
      );
      assert.ok(
        ["bounded", "workspace", "repository"].includes(policy.repo_scope.pathBoundary),
        `${archetype} repo scope path boundary.`
      );
      assert.ok(policy.grants.required.includes("repo_scope"), `${archetype} must require repo_scope grants.`);
      assert.ok(
        policy.grants.required.includes("tool_permissions"),
        `${archetype} must require tool permission grants.`
      );
      assert.ok(policy.grants.required.includes("budgets"), `${archetype} must require budget grants.`);
      assert.deepEqual(
        [...new Set(grantBuckets)].sort(),
        [...policyGrantKinds].sort(),
        `${archetype} must classify every supported grant kind exactly once.`
      );
      assert.equal(
        new Set(grantBuckets).size,
        grantBuckets.length,
        `${archetype} must not duplicate grant classifications.`
      );
      assert.equal(policy.tool_permissions.required, true, `${archetype} must require tool permissions.`);
      assert.ok(
        policy.tool_permissions.allowedRiskLevels.includes(policy.tool_permissions.maxToolRisk),
        `${archetype} allowed risk levels must include its max tool risk cap.`
      );
      assert.equal(
        policy.toolPermissionLimits.required,
        policy.tool_permissions.required,
        `${archetype} explicit tool permission limits must mirror required tool policy.`
      );
      assert.equal(
        policy.toolPermissionLimits.maxRisk,
        policy.tool_permissions.maxToolRisk,
        `${archetype} explicit tool permission limit must mirror the compatibility risk cap.`
      );
      assert.deepEqual(
        policy.toolPermissionLimits.allowedRiskLevels,
        policy.tool_permissions.allowedRiskLevels,
        `${archetype} explicit tool permission limits must mirror allowed risk levels.`
      );
      assert.ok(
        policy.toolPermissionGrants.allowedTools.length > 0,
        `${archetype} must list at least one allowed tool permission target.`
      );
      assert.ok(
        policy.toolPermissionGrants.allowedPermissionLevels.includes(
          policy.toolPermissionGrants.maxPermissionLevel
        ),
        `${archetype} allowed permission levels must include the max permission level cap.`
      );
      assert.equal(policy.maxRepoAccess, policy.repo_scope.maxAccess, `${archetype} compatibility repo cap.`);
      assert.equal(policy.maxToolRisk, policy.tool_permissions.maxToolRisk, `${archetype} compatibility risk cap.`);
      assert.equal(
        Number.isFinite(policy.budgets.timeoutMs) && policy.budgets.timeoutMs > 0,
        true,
        `${archetype} must define a positive timeout budget cap.`
      );
      assert.equal(
        Number.isInteger(policy.budgets.repair_loop_count) && policy.budgets.repair_loop_count >= 0,
        true,
        `${archetype} must define a non-negative repair-loop budget cap.`
      );
      assert.equal(
        policy.repair_loop_count,
        policy.budgets.repair_loop_count,
        `${archetype} repair_loop_count must mirror budgets.repair_loop_count.`
      );
      assert.equal(policy.budgetCaps.timeoutMs, policy.budgets.timeoutMs, `${archetype} timeout compatibility cap.`);
      assert.equal(
        policy.budgetCaps.maxRepairLoops,
        policy.budgets.repair_loop_count,
        `${archetype} maxRepairLoops compatibility cap.`
      );
    }
  });

  it("exports the cosmetic-tweak policy caps and promotes a clear draft deterministically", () => {
    const wiredArchetype: GoalArchetype = "cosmetic-tweak";

    assert.equal(GOAL_ARCHETYPE_POLICY_TABLE[wiredArchetype].status, "wired");
    assert.equal(GOAL_ARCHETYPE_POLICY_TABLE[wiredArchetype].maxRepoAccess, "write");
    assert.equal(GOAL_ARCHETYPE_POLICY_TABLE[wiredArchetype].maxToolRisk, "low");

    const first = promoteIntentDraft({
      draft: clearCosmeticDraft(),
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    const second = promoteIntentDraft({
      draft: clearCosmeticDraft(),
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionSucceeded(first);
    assertPromotionSucceeded(second);
    assert.deepEqual(second.intent, first.intent);
    assert.deepEqual(first.weightingProfile, INTENT_AMBIGUITY_WEIGHTING_PROFILES.brownfield);
    assert.deepEqual(first.ambiguityAssessment.weightingProfile, first.weightingProfile);
    assert.deepEqual(second.ambiguityAssessment, first.ambiguityAssessment);
    assert.equal(first.ambiguityAssessment.accepted, true);
    assert.equal(first.ambiguityAssessment.ambiguity, 0);
    assert.equal(first.intent.sourceDraftId, "draft_cosmetic_copy_update");
    assert.equal(first.intent.mode, "brownfield");
    assert.equal(first.intent.goalArchetype, "cosmetic-tweak");
    assert.equal(first.archetypeSuggestion.archetype, "cosmetic-tweak");
    assert.equal(first.archetypeSuggestion.confidence, 0.955);
    assert.deepEqual(
      first.archetypeSuggestion.scores[0],
      {
        archetype: "cosmetic-tweak",
        score: 1,
        rawScore: 19.92,
        signals: [
          {
            archetype: "cosmetic-tweak",
            source: "explicit-goal-archetype",
            fieldPath: "goalArchetype",
            matchedText: "cosmetic-tweak",
            weight: 6
          },
          {
            archetype: "cosmetic-tweak",
            source: "goal-text",
            fieldPath: "title",
            matchedText: "polish",
            weight: 3.36
          },
          {
            archetype: "cosmetic-tweak",
            source: "goal-text",
            fieldPath: "problem",
            matchedText: "copy",
            weight: 2.8
          },
          {
            archetype: "cosmetic-tweak",
            source: "goal-text",
            fieldPath: "problem",
            matchedText: "operator-facing",
            weight: 2
          },
          {
            archetype: "cosmetic-tweak",
            source: "acceptance-criteria",
            fieldPath: "acceptanceCriteria.0.statement",
            matchedText: "copy",
            weight: 2.38
          },
          {
            archetype: "cosmetic-tweak",
            source: "acceptance-criteria",
            fieldPath: "acceptanceCriteria.0.statement",
            matchedText: "operator-facing",
            weight: 1.7
          },
          {
            archetype: "cosmetic-tweak",
            source: "constraints",
            fieldPath: "stopConditions.0",
            matchedText: "cosmetic",
            weight: 1.68
          }
        ]
      }
    );
    assert.equal(
      first.intent.context,
      "The change is limited to the settings surface in the current Protostar repository checkout."
    );
    assert.deepEqual(first.intent.stopConditions, [
      "Stop after one bounded cosmetic admission repair loop is consumed."
    ]);
    assert.deepEqual(
      first.ambiguityAssessment.dimensionScores.map((score) => score.weightingProfile),
      [
        first.ambiguityAssessment.weightingProfile,
        first.ambiguityAssessment.weightingProfile,
        first.ambiguityAssessment.weightingProfile,
        first.ambiguityAssessment.weightingProfile
      ]
    );
    assert.equal(first.questions.length, 0);
    assert.deepEqual(first.missingFieldDetections, []);
    assert.deepEqual(first.requiredClarifications, []);
    assert.deepEqual(first.hardZeroReasons, []);
    assert.deepEqual(first.policyFindings, []);
    assert.deepEqual(
      first.intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      [
        {
          id: "ac_359329cba7b9a27b",
          statement: "The settings page copy uses the approved operator-facing wording without changing behavior.",
          verification: "evidence"
        },
        {
          id: "ac_b96898ca038f7649",
          statement: "The focused intent admission tests pass with deterministic ordering and stable normalized AC ids.",
          verification: "test"
        }
      ]
    );
  });

  it("grants clear cosmetic-tweak capability envelopes through the explicit admission path", () => {
    const draft = clearCosmeticDraft();
    const grant = admitCosmeticTweakCapabilityEnvelope({
      draft
    });

    assert.equal(COSMETIC_TWEAK_GOAL_ARCHETYPE, "cosmetic-tweak");
    assert.equal(grant.ok, true, grant.errors.join("; "));
    assert.equal(grant.goalArchetype, COSMETIC_TWEAK_GOAL_ARCHETYPE);
    assert.equal(grant.grant.source, "cosmetic-tweak-policy-admission");
    assert.equal(grant.grant.goalArchetype, COSMETIC_TWEAK_GOAL_ARCHETYPE);
    assert.equal(grant.grant.policy, GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"]);
    assert.equal(grant.admission.ok, true);
    assert.deepEqual(grant.errors, []);
    assert.deepEqual(grant.findings, []);
    assert.deepEqual(grant.grant.capabilityEnvelope, {
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
          reason: "Run the focused deterministic admission tests.",
          risk: "low"
        }
      ],
      workspace: {
        allowDirty: false
      },
      network: {
        allow: "loopback"
      },
      budget: {
        adapterRetriesPerTask: 4,
        taskWallClockMs: 180_000,
        timeoutMs: 120_000,
        maxRepairLoops: 1
      }
    });

    const promoted = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionSucceeded(promoted);
    assert.deepEqual(promoted.intent.capabilityEnvelope, grant.grant.capabilityEnvelope);
  });

  it("refuses to grant the cosmetic-tweak envelope for another known archetype", () => {
    const result = admitCosmeticTweakCapabilityEnvelope({
      draft: {
        ...clearCosmeticDraft(),
        goalArchetype: "feature-add"
      }
    });

    assert.equal(result.ok, false);
    assert.equal(result.goalArchetype, "feature-add");
    assert.equal(result.findings[0]?.code, "unsupported-goal-archetype");
    assert.equal(result.findings[0]?.severity, "block");
    assert.match(result.errors[0] ?? "", /cannot grant a capability envelope/);
  });

  it("returns an explicit unsupported feature-add admission decision with stub caps", () => {
    const draft = clearFeatureAddDraft();
    const result = admitFeatureAddCapabilityEnvelope({
      draft
    });

    assert.equal(FEATURE_ADD_GOAL_ARCHETYPE, "feature-add");
    assert.equal(result.ok, false);
    assert.equal(result.goalArchetype, FEATURE_ADD_GOAL_ARCHETYPE);
    assert.equal(result.decision.source, "feature-add-policy-admission");
    assert.equal(result.decision.goalArchetype, FEATURE_ADD_GOAL_ARCHETYPE);
    assert.equal(result.decision.requestedGoalArchetype, FEATURE_ADD_GOAL_ARCHETYPE);
    assert.equal(result.decision.decision, "unsupported");
    assert.equal(result.decision.supportStatus, "unsupported");
    assert.equal(result.decision.capabilityCapStatus, "stub");
    assert.equal(result.decision.stubCap, GOAL_ARCHETYPE_POLICY_TABLE["feature-add"]);
    assert.equal(result.decision.stubCap.status, "stub");
    assert.deepEqual(result.admission.blockingFindings.map((finding) => finding.code), [
      "unsupported-goal-archetype"
    ]);
    assert.deepEqual(
      result.findings.map(({ code, fieldPath, severity, overridable, overridden }) => ({
        code,
        fieldPath,
        severity,
        overridable,
        overridden
      })),
      [
        {
          code: "unsupported-goal-archetype",
          fieldPath: "goalArchetype",
          severity: "block",
          overridable: false,
          overridden: false
        }
      ]
    );
    assert.match(
      result.errors[0] ?? "",
      /Feature-add admission path is unsupported in v0\.0\.1/
    );
  });

  it("blocks feature-add draft promotion through the explicit unsupported admission path", () => {
    const draft = clearFeatureAddDraft();
    const result = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionFailed(result, "checklist-only");
    assert.equal("intent" in result, false);
    assert.deepEqual(result.failureDetails.ambiguityErrors, []);
    assert.deepEqual(result.policyFindings.map(({ code, fieldPath, severity }) => ({ code, fieldPath, severity })), [
      {
        code: "unsupported-goal-archetype",
        fieldPath: "goalArchetype",
        severity: "block"
      }
    ]);
    assert.deepEqual(result.missingFieldDetections.map(({ code, fieldPath, source }) => ({ code, fieldPath, source })), [
      {
        code: "unsupported-goal-archetype",
        fieldPath: "goalArchetype",
        source: "policy-finding"
      }
    ]);
    assert.match(result.errors[0] ?? "", /Feature-add admission path is unsupported in v0\.0\.1/);
  });

  it("returns an explicit unsupported refactor admission decision with stub caps", () => {
    const draft = clearRefactorDraft();
    const result = admitRefactorCapabilityEnvelope({
      draft
    });

    assert.equal(REFACTOR_GOAL_ARCHETYPE, "refactor");
    assert.equal(result.ok, false);
    assert.equal(result.goalArchetype, REFACTOR_GOAL_ARCHETYPE);
    assert.equal(result.decision.source, "refactor-policy-admission");
    assert.equal(result.decision.goalArchetype, REFACTOR_GOAL_ARCHETYPE);
    assert.equal(result.decision.requestedGoalArchetype, REFACTOR_GOAL_ARCHETYPE);
    assert.equal(result.decision.decision, "unsupported");
    assert.equal(result.decision.supportStatus, "unsupported");
    assert.equal(result.decision.capabilityCapStatus, "stub");
    assert.equal(result.decision.stubCap, GOAL_ARCHETYPE_POLICY_TABLE.refactor);
    assert.equal(result.decision.stubCap.status, "stub");
    assert.deepEqual(result.admission.blockingFindings.map((finding) => finding.code), [
      "unsupported-goal-archetype"
    ]);
    assert.deepEqual(
      result.findings.map(({ code, fieldPath, severity, overridable, overridden }) => ({
        code,
        fieldPath,
        severity,
        overridable,
        overridden
      })),
      [
        {
          code: "unsupported-goal-archetype",
          fieldPath: "goalArchetype",
          severity: "block",
          overridable: false,
          overridden: false
        }
      ]
    );
    assert.match(
      result.errors[0] ?? "",
      /Refactor admission path is unsupported in v0\.0\.1/
    );
  });

  it("blocks refactor draft promotion through the explicit unsupported admission path", () => {
    const draft = clearRefactorDraft();
    const result = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionFailed(result, "checklist-only");
    assert.equal("intent" in result, false);
    assert.deepEqual(result.failureDetails.ambiguityErrors, []);
    assert.deepEqual(result.policyFindings.map(({ code, fieldPath, severity }) => ({ code, fieldPath, severity })), [
      {
        code: "unsupported-goal-archetype",
        fieldPath: "goalArchetype",
        severity: "block"
      }
    ]);
    assert.deepEqual(result.missingFieldDetections.map(({ code, fieldPath, source }) => ({ code, fieldPath, source })), [
      {
        code: "unsupported-goal-archetype",
        fieldPath: "goalArchetype",
        source: "policy-finding"
      }
    ]);
    assert.match(result.errors[0] ?? "", /Refactor admission path is unsupported in v0\.0\.1/);
  });

  it("returns an explicit unsupported bugfix admission decision with stub caps", () => {
    const draft = clearBugfixDraft();
    const result = admitBugfixCapabilityEnvelope({
      draft
    });

    assert.equal(BUGFIX_GOAL_ARCHETYPE, "bugfix");
    assert.equal(result.ok, false);
    assert.equal(result.goalArchetype, BUGFIX_GOAL_ARCHETYPE);
    assert.equal(result.decision.source, "bugfix-policy-admission");
    assert.equal(result.decision.goalArchetype, BUGFIX_GOAL_ARCHETYPE);
    assert.equal(result.decision.requestedGoalArchetype, BUGFIX_GOAL_ARCHETYPE);
    assert.equal(result.decision.decision, "unsupported");
    assert.equal(result.decision.supportStatus, "unsupported");
    assert.equal(result.decision.capabilityCapStatus, "stub");
    assert.equal(result.decision.stubCap, GOAL_ARCHETYPE_POLICY_TABLE.bugfix);
    assert.equal(result.decision.stubCap.status, "stub");
    assert.deepEqual(result.admission.blockingFindings.map((finding) => finding.code), [
      "unsupported-goal-archetype"
    ]);
    assert.deepEqual(
      result.findings.map(({ code, fieldPath, severity, overridable, overridden }) => ({
        code,
        fieldPath,
        severity,
        overridable,
        overridden
      })),
      [
        {
          code: "unsupported-goal-archetype",
          fieldPath: "goalArchetype",
          severity: "block",
          overridable: false,
          overridden: false
        }
      ]
    );
    assert.match(
      result.errors[0] ?? "",
      /Bugfix admission path is unsupported in v0\.0\.1/
    );
  });

  it("blocks bugfix draft promotion through the explicit unsupported admission path", () => {
    const draft = clearBugfixDraft();
    const result = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionFailed(result, "checklist-only");
    assert.equal("intent" in result, false);
    assert.deepEqual(result.failureDetails.ambiguityErrors, []);
    assert.deepEqual(result.policyFindings.map(({ code, fieldPath, severity }) => ({ code, fieldPath, severity })), [
      {
        code: "unsupported-goal-archetype",
        fieldPath: "goalArchetype",
        severity: "block"
      }
    ]);
    assert.deepEqual(result.missingFieldDetections.map(({ code, fieldPath, source }) => ({ code, fieldPath, source })), [
      {
        code: "unsupported-goal-archetype",
        fieldPath: "goalArchetype",
        source: "policy-finding"
      }
    ]);
    assert.match(result.errors[0] ?? "", /Bugfix admission path is unsupported in v0\.0\.1/);
  });

  it("auto-tags draft archetypes deterministically without live model calls", () => {
    const { goalArchetype: _cosmeticArchetype, ...cosmeticDraft } = clearCosmeticDraft();
    const cases = [
      {
        expected: "cosmetic-tweak",
        draft: cosmeticDraft
      },
      {
        expected: "bugfix",
        draft: {
          title: "Fix failing admission regression",
          problem:
            "A broken policy admission path now rejects valid drafts with an error, so the bug fix must restore the expected passing regression test.",
          acceptanceCriteria: [
            {
              statement: "The regression test passes when the fixed admission path accepts the valid draft.",
              verification: "test"
            }
          ]
        }
      },
      {
        expected: "feature-add",
        draft: {
          title: "Add draft intent CLI flag",
          problem:
            "Operators need a new CLI flag that accepts draft intent input and routes it through the admission workflow.",
          acceptanceCriteria: [
            {
              statement: "The CLI accepts the new draft flag and writes the expected artifact.",
              verification: "test"
            }
          ]
        }
      },
      {
        expected: "refactor",
        draft: {
          title: "Refactor policy admission helpers",
          problem:
            "The policy package needs internal helper extraction to simplify the admission code without changing behavior.",
          constraints: ["Keep this as a refactor with no operator-visible feature changes."]
        }
      },
      {
        expected: "factory-scaffold",
        draft: {
          title: "Scaffold factory run manifest spine",
          problem:
            "Bootstrap the dark software factory control plane with monorepo package boundaries, stage composition, and a run manifest."
        }
      }
    ] as const satisfies readonly {
      readonly expected: GoalArchetype;
      readonly draft: IntentDraft;
    }[];

    for (const testCase of cases) {
      const first = autoTagIntentDraftArchetype(testCase.draft);
      const second = autoTagIntentDraftArchetype(testCase.draft);

      assert.deepEqual(second, first);
      assert.equal(first.archetype, testCase.expected);
      assert.equal(first.scores[0]?.archetype, testCase.expected);
      assert.equal(first.confidence > 0, true, first.rationale);
      assert.ok(
        first.signals.some((signal) => signal.archetype === testCase.expected),
        `Expected at least one ${testCase.expected} signal.`
      );
    }

    const empty = autoTagIntentDraftArchetype({});
    assert.equal(empty.archetype, "feature-add");
    assert.equal(empty.confidence, 0);
    assert.deepEqual(empty.signals, []);
  });

  it("returns an auto-tag suggestion without satisfying the required goalArchetype gate", () => {
    const { goalArchetype: _goalArchetype, ...draft } = clearCosmeticDraft();
    const result = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionFailed(result, "combined");
    assert.equal(result.archetypeSuggestion.archetype, "cosmetic-tweak");
    assert.equal(result.archetypeSuggestion.confidence > 0, true);
    assert.ok(result.failureDetails.checklistErrors.includes("goalArchetype must be provided before promotion."));
    assert.ok(
      result.missingFieldDetections.some(
        (detection) =>
          detection.source === "required-field-checklist" &&
          detection.fieldPath === "goalArchetype"
      )
    );
  });

  it("converts low-confidence archetype proposals into required hardening clarifications", () => {
    const { goalArchetype: _goalArchetype, ...baseDraft } = clearCosmeticDraft();
    const draft = {
      ...baseDraft,
      title: "Fix copy",
      problem:
        "Operators need the admission gate to ask for the exact policy row when the draft has mixed labels and no decisive row evidence.",
      context: "The request references one existing repository surface but does not identify a single best policy row.",
      acceptanceCriteria: [
        {
          statement: "The admission response lists a required clarification for the weak archetype proposal.",
          verification: "test"
        },
        {
          statement: "The intent remains unconfirmed until the operator selects one supported policy archetype.",
          verification: "evidence"
        }
      ],
      constraints: [
        "Protostar may only ask the operator to choose the policy row and must preserve downstream internals."
      ],
      stopConditions: ["Stop after the operator selects a policy row or the admission gate blocks confirmation."]
    } satisfies IntentDraft;
    const suggestion = autoTagIntentDraftArchetype(draft);

    assert.equal(suggestion.confidence > 0, true);
    assert.equal(
      suggestion.confidence < INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD,
      true,
      suggestion.rationale
    );

    const first = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    const second = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.deepEqual(second, first);
    assertPromotionFailed(first, "combined");
    assert.equal(first.archetypeSuggestion.archetype, suggestion.archetype);
    assert.equal(first.archetypeSuggestion.confidence, suggestion.confidence);

    const finding = first.policyFindings.find(
      (candidate) => candidate.code === LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE
    );
    assert.ok(finding);
    assert.equal(finding.fieldPath, "goalArchetype");
    assert.equal(finding.severity, "ambiguity");
    assert.equal(finding.overridden, false);
    assert.equal(finding.ambiguityDimension, "goal");
    assert.match(finding.message, /low confidence/);
    assert.match(finding.message, new RegExp(suggestion.archetype));

    assert.ok(
      first.requiredClarifications.some(
        (clarification) =>
          clarification.source === "policy-finding" &&
          clarification.issueCode === LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE &&
          clarification.fieldPath === "goalArchetype" &&
          clarification.prompt === finding.message &&
          clarification.rationale.includes("explicit supported goalArchetype")
      )
    );
    assert.ok(
      first.ambiguityAssessment.dimensionScores.some(
        (score) =>
          score.dimension === "goal" &&
          score.score === 0.85 &&
          score.missingFields.includes("goalArchetype") &&
          score.requiredClarifications.includes(finding.message)
      )
    );
  });

  it("returns explicit output contract sections for missing fields and required clarifications", () => {
    const result = promoteIntentDraft({
      draft: {},
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.weightingProfile, INTENT_AMBIGUITY_WEIGHTING_PROFILES.brownfield);
    assert.equal("ambiguityAssessment" in result, true);
    assert.equal(result.failureDetails.confirmedIntentCreated, false);
    assert.deepEqual(
      result.requiredDimensionChecklist
        .filter((check) => !check.passed)
        .map((check) => check.dimensionId),
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

    const missingTitle = result.missingFieldDetections.find((detection) => detection.fieldPath === "title");
    assert.ok(missingTitle);
    assert.equal(missingTitle.code, "missing-required-field");
    assert.equal(missingTitle.checklistIndex, 0);
    assert.equal(missingTitle.dimensionId, "goal");
    assert.equal(missingTitle.label, "Title");
    assert.equal(missingTitle.source, "required-field-checklist");
    assert.equal(missingTitle.message, "title must be provided before promotion.");

      assert.deepEqual(
      result.hardZeroReasons
        .filter((reason) => reason.source === "required-dimension-checklist")
        .map(({ dimensionId, fieldPath, score, clarity, source }) => ({
          dimensionId,
          fieldPath,
          score,
          clarity,
          source
        })),
      [
        {
          dimensionId: "goal",
          fieldPath: "dimension:goal",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        },
        {
          dimensionId: "requester",
          fieldPath: "dimension:requester",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        },
        {
          dimensionId: "goalArchetype",
          fieldPath: "dimension:goalArchetype",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        },
        {
          dimensionId: "successCriteria",
          fieldPath: "dimension:successCriteria",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        },
        {
          dimensionId: "constraints",
          fieldPath: "dimension:constraints",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        },
        {
          dimensionId: "stopConditions",
          fieldPath: "dimension:stopConditions",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        },
        {
          dimensionId: "capabilityEnvelope",
          fieldPath: "dimension:capabilityEnvelope",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        },
        {
          dimensionId: "brownfieldContext",
          fieldPath: "dimension:brownfieldContext",
          score: 1,
          clarity: 0,
          source: "required-dimension-checklist"
        }
      ]
    );
    assert.equal(
      result.hardZeroReasons[0]?.message,
      "goal dimension is structurally missing; deterministic hard-zero reason (score 1, clarity 0) blocks promotion. missing fields: title, problem."
    );

    const titleClarification = result.requiredClarifications.find(
      (clarification) => clarification.questionKey === "field:title"
    );
    assert.ok(titleClarification);
    assert.equal(titleClarification.source, "missing-field-detection");
    assert.equal(titleClarification.fieldPath, "title");
    assert.match(titleClarification.prompt, /concrete goal/);

    const requiredMissingFields = result.missingFieldDetections
      .filter((detection) => detection.source === "required-field-checklist")
      .map((detection) => detection.fieldPath);
    for (const fieldPath of requiredMissingFields) {
      assert.ok(
        result.requiredClarifications.some(
          (clarification) =>
            clarification.source === "missing-field-detection" &&
            clarification.fieldPath === fieldPath &&
            clarification.questionKey === createClarificationQuestionKey(fieldPath as IntentDraftFieldPath)
        ),
        `Expected missing field ${fieldPath} to expose a required clarification.`
      );
    }

    assert.ok(
      result.missingFieldDetections.some(
        (detection) => detection.fieldPath === "goalArchetype" && detection.source === "policy-finding"
      )
    );
    assert.ok(
      result.requiredClarifications.some(
        (clarification) =>
          clarification.source === "required-dimension-checklist" &&
          clarification.fieldPath === "dimension:goal" &&
          clarification.prompt.includes("hard-zero reason")
      )
    );
  });

  it("exposes the selected weighting profile on structurally blocked policy results", () => {
    const result = promoteIntentDraft({
      draft: {},
      mode: "greenfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.weightingProfile, INTENT_AMBIGUITY_WEIGHTING_PROFILES.greenfield);
    assert.equal("ambiguityAssessment" in result, true);
    assert.equal(result.failureDetails.confirmedIntentCreated, false);
    assert.deepEqual(result.weightingProfile.dimensions, [
      {
        dimension: "goal",
        weight: 0.4
      },
      {
        dimension: "constraints",
        weight: 0.3
      },
      {
        dimension: "successCriteria",
        weight: 0.3
      }
    ]);
  });

  it("keeps blocked-admission missing-field output and clarification ordering deterministic", () => {
    const first = promoteIntentDraft({
      draft: {},
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    const second = promoteIntentDraft({
      draft: {},
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(first.ok, false);
    assert.deepEqual(second, first);
    assert.deepEqual(
      first.missingFieldDetections
        .filter((detection) => detection.source !== "ambiguity-assessment")
        .map(({ fieldPath, source }) => ({ fieldPath, source })),
      [
        { fieldPath: "title", source: "required-field-checklist" },
        { fieldPath: "problem", source: "required-field-checklist" },
        { fieldPath: "requester", source: "required-field-checklist" },
        { fieldPath: "goalArchetype", source: "required-field-checklist" },
        { fieldPath: "acceptanceCriteria", source: "required-field-checklist" },
        { fieldPath: "constraints", source: "required-field-checklist" },
        { fieldPath: "stopConditions", source: "required-field-checklist" },
        { fieldPath: "capabilityEnvelope.repoScopes", source: "required-field-checklist" },
        { fieldPath: "capabilityEnvelope.toolPermissions", source: "required-field-checklist" },
        { fieldPath: "capabilityEnvelope.budget", source: "required-field-checklist" },
        { fieldPath: "context", source: "required-field-checklist" },
        { fieldPath: "goalArchetype", source: "policy-finding" }
      ]
    );
    assert.deepEqual(
      first.missingFieldDetections
        .filter((detection) => detection.source === "ambiguity-assessment")
        .map(({ fieldPath, source }) => ({ fieldPath, source })),
      [
        { fieldPath: "title", source: "ambiguity-assessment" },
        { fieldPath: "problem", source: "ambiguity-assessment" },
        { fieldPath: "constraints", source: "ambiguity-assessment" },
        { fieldPath: "capabilityEnvelope.repoScopes", source: "ambiguity-assessment" },
        { fieldPath: "capabilityEnvelope.toolPermissions", source: "ambiguity-assessment" },
        { fieldPath: "capabilityEnvelope.budget", source: "ambiguity-assessment" },
        { fieldPath: "stopConditions", source: "ambiguity-assessment" },
        { fieldPath: "goalArchetype", source: "ambiguity-assessment" },
        { fieldPath: "acceptanceCriteria", source: "ambiguity-assessment" },
        { fieldPath: "context", source: "ambiguity-assessment" },
        { fieldPath: "capabilityEnvelope.repoScopes", source: "ambiguity-assessment" }
      ]
    );
    assert.deepEqual(
      first.missingFieldDetections
        .filter((detection) => detection.source === "required-field-checklist")
        .map(({ code, checklistIndex, fieldPath }) => ({ code, checklistIndex, fieldPath })),
      [
        { code: "missing-required-field", checklistIndex: 0, fieldPath: "title" },
        { code: "missing-required-field", checklistIndex: 1, fieldPath: "problem" },
        { code: "missing-required-field", checklistIndex: 2, fieldPath: "requester" },
        { code: "missing-required-field", checklistIndex: 3, fieldPath: "goalArchetype" },
        { code: "missing-required-field", checklistIndex: 4, fieldPath: "acceptanceCriteria" },
        { code: "missing-required-field", checklistIndex: 5, fieldPath: "constraints" },
        { code: "missing-required-field", checklistIndex: 6, fieldPath: "stopConditions" },
        { code: "missing-required-field", checklistIndex: 7, fieldPath: "capabilityEnvelope.repoScopes" },
        { code: "missing-required-field", checklistIndex: 8, fieldPath: "capabilityEnvelope.toolPermissions" },
        { code: "missing-required-field", checklistIndex: 9, fieldPath: "capabilityEnvelope.budget" },
        { code: "missing-required-field", checklistIndex: 10, fieldPath: "context" }
      ]
    );
    assert.deepEqual(
      first.questions.map(({ category, key }) => ({ category, key })),
      [
        { category: "required-field", key: createClarificationQuestionKey("requester") },
        { category: "required-field", key: createClarificationQuestionKey("goalArchetype") },
        { category: "required-field", key: createClarificationQuestionKey("acceptanceCriteria") },
        { category: "required-field", key: createClarificationQuestionKey("capabilityEnvelope.repoScopes") },
        { category: "required-field", key: createClarificationQuestionKey("capabilityEnvelope.toolPermissions") },
        { category: "required-field", key: createClarificationQuestionKey("capabilityEnvelope.budget") },
        { category: "goal", key: createClarificationQuestionKey("title") },
        { category: "goal", key: createClarificationQuestionKey("problem") },
        { category: "capability-envelope", key: createClarificationQuestionKey("capabilityEnvelope") },
        { category: "policy", key: createClarificationQuestionKey("constraints") },
        { category: "policy", key: createClarificationQuestionKey("stopConditions") },
        { category: "context", key: createClarificationQuestionKey("context") }
      ]
    );
      assert.deepEqual(
      first.requiredClarifications
        .filter((clarification) => clarification.source !== "ambiguity-assessment")
        .map(({ fieldPath, questionKey, source }) => ({
          fieldPath,
          questionKey,
          source
        })),
      [
        {
          fieldPath: "dimension:goal",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "dimension:requester",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "dimension:goalArchetype",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "dimension:successCriteria",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "dimension:constraints",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "dimension:stopConditions",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "dimension:capabilityEnvelope",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "dimension:brownfieldContext",
          questionKey: undefined,
          source: "required-dimension-checklist"
        },
        {
          fieldPath: "title",
          questionKey: createClarificationQuestionKey("title"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "problem",
          questionKey: createClarificationQuestionKey("problem"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "requester",
          questionKey: createClarificationQuestionKey("requester"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "goalArchetype",
          questionKey: createClarificationQuestionKey("goalArchetype"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "acceptanceCriteria",
          questionKey: createClarificationQuestionKey("acceptanceCriteria"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "constraints",
          questionKey: createClarificationQuestionKey("constraints"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "stopConditions",
          questionKey: createClarificationQuestionKey("stopConditions"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "capabilityEnvelope.repoScopes",
          questionKey: createClarificationQuestionKey("capabilityEnvelope.repoScopes"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "capabilityEnvelope.toolPermissions",
          questionKey: createClarificationQuestionKey("capabilityEnvelope.toolPermissions"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "capabilityEnvelope.budget",
          questionKey: createClarificationQuestionKey("capabilityEnvelope.budget"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "context",
          questionKey: createClarificationQuestionKey("context"),
          source: "missing-field-detection"
        },
        {
          fieldPath: "capabilityEnvelope",
          questionKey: createClarificationQuestionKey("capabilityEnvelope"),
          source: "clarification-question-generator"
          }
        ]
      );
    });

  it("surfaces malformed required-field failures with deterministic codes and nested paths", () => {
    const result = promoteIntentDraft({
      draft: malformedCosmeticDraft(),
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(result.ok, false);
    assert.equal("ambiguityAssessment" in result, true);
    assert.equal(result.failureDetails.confirmedIntentCreated, false);
    assert.deepEqual(
      result.missingFieldDetections
        .filter((detection) => detection.source === "required-field-checklist")
        .map(({ code, checklistIndex, fieldPath }) => ({ code, checklistIndex, fieldPath })),
      [
        { code: "malformed-text-field", checklistIndex: 0, fieldPath: "title" },
        { code: "malformed-verification-mode", checklistIndex: 4, fieldPath: "acceptanceCriteria.0.verification" },
        { code: "malformed-repo-scope", checklistIndex: 7, fieldPath: "capabilityEnvelope.repoScopes.0.path" },
        { code: "malformed-repo-scope", checklistIndex: 7, fieldPath: "capabilityEnvelope.repoScopes.0.access" },
        {
          code: "malformed-tool-permission",
          checklistIndex: 8,
          fieldPath: "capabilityEnvelope.toolPermissions.0.tool"
        },
        {
          code: "malformed-tool-permission",
          checklistIndex: 8,
          fieldPath: "capabilityEnvelope.toolPermissions.0.risk"
        },
        { code: "malformed-budget-limit", checklistIndex: 9, fieldPath: "capabilityEnvelope.budget.timeoutMs" }
      ]
    );
    assert.ok(
      result.errors.includes("title must be a non-empty string after whitespace normalization."),
      result.errors.join("; ")
    );
    assert.ok(
      result.requiredClarifications.some(
        (clarification) =>
          clarification.fieldPath === "acceptanceCriteria.0.verification" &&
          clarification.source === "clarification-question-generator"
      )
    );
  });

  it("surfaces authority policy bumps alongside structural completeness failures", () => {
    const completeDraft = clearCosmeticDraft();
    const { context: _context, ...draftWithoutContext } = completeDraft;
    const envelope = completeDraft.capabilityEnvelope;
    assert.ok(envelope);

    const result = promoteIntentDraft({
      draft: {
        ...draftWithoutContext,
        capabilityEnvelope: {
          ...envelope,
          toolPermissions: [
            {
              tool: "shell",
              reason: "This overage should not be evaluated until structural completeness passes.",
              risk: "high"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(result.ok, false);
    assert.equal("ambiguityAssessment" in result, true);
    assert.equal(result.failureDetails.confirmedIntentCreated, false);
    assert.deepEqual(
      result.policyFindings.map(({ code, fieldPath, overridden }) => ({ code, fieldPath, overridden })),
      [
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.0.risk",
          overridden: false
        }
      ]
    );
    assert.deepEqual(
      result.requiredDimensionChecklist
        .filter((check) => !check.passed)
        .map((check) => check.dimensionId),
      ["brownfieldContext"]
    );
    assert.deepEqual(result.hardZeroReasons.filter((reason) => reason.source === "required-dimension-checklist"), [
      {
        dimensionId: "brownfieldContext",
        fieldPath: "dimension:brownfieldContext",
        score: 1,
        clarity: 0,
        missingFields: ["context"],
        message:
          "brownfieldContext dimension is structurally missing; deterministic hard-zero reason (score 1, clarity 0) blocks promotion. missing fields: context.",
        source: "required-dimension-checklist"
      }
    ]);
    assert.equal(
      result.missingFieldDetections.some((detection) => detection.source === "ambiguity-assessment"),
      true
    );
    assert.equal(
      result.requiredClarifications.some(
        (clarification) =>
          clarification.source === "ambiguity-assessment" || clarification.source === "policy-finding"
      ),
      true
    );
  });

  it("returns AC 40202 failure details for checklist-only, ambiguity-only, and combined states", () => {
    const clearDraft = clearCosmeticDraft();
    const { requester: _requester, ...draftWithoutRequester } = clearDraft;
    const highRiskCapabilityEnvelope = {
      ...clearDraft.capabilityEnvelope,
      toolPermissions: [
        {
          tool: "shell",
          reason: "Exercise deterministic admission failure details without confirming intent.",
          risk: "high" as const
        }
      ]
    };
    const cases = [
      {
        draft: draftWithoutRequester,
        expectedState: "checklist-only",
        expectedChecklistFailed: true,
        expectedAmbiguityFailed: false
      },
      {
        draft: {
          ...clearDraft,
          capabilityEnvelope: highRiskCapabilityEnvelope
        },
        expectedState: "ambiguity-only",
        expectedChecklistFailed: false,
        expectedAmbiguityFailed: true
      },
      {
        draft: {
          ...draftWithoutRequester,
          capabilityEnvelope: highRiskCapabilityEnvelope
        },
        expectedState: "combined",
        expectedChecklistFailed: true,
        expectedAmbiguityFailed: true
      }
    ];

    for (const testCase of cases) {
      const first = promoteIntentDraft({
        draft: testCase.draft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z",
        threshold: 1
      });
      const second = promoteIntentDraft({
        draft: testCase.draft,
        mode: "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z",
        threshold: 1
      });

      assert.equal(first.ok, false);
      assert.deepEqual(second, first);
      assert.equal("intent" in first, false);
      assert.equal(first.failureState, testCase.expectedState);
      assert.equal(first.failureDetails.state, testCase.expectedState);
      assert.equal(first.failureDetails.confirmedIntentCreated, false);
      assert.equal(first.failureDetails.checklistFailed, testCase.expectedChecklistFailed);
      assert.equal(first.failureDetails.ambiguityFailed, testCase.expectedAmbiguityFailed);
      assert.equal(first.failureDetails.checklistErrors.length > 0, testCase.expectedChecklistFailed);
      assert.equal(first.failureDetails.ambiguityErrors.length > 0, testCase.expectedAmbiguityFailed);
    }
  });

  it("admits finite ambiguity at the configured boundary when it is within the canonical ceiling", () => {
    const result = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        title: "Polish",
        problem: "Fix copy.",
        acceptanceCriteria: [
          {
            statement: "Tests pass",
            verification: "test"
          }
        ]
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z",
      threshold: 0.196
    });

    assertPromotionSucceeded(result);
    assert.equal(result.ambiguityAssessment.ambiguity, 0.196);
    assert.equal(result.ambiguityAssessment.accepted, true);
  });

  it("blocks ambiguity above the canonical 0.2 ceiling even when a caller provides a looser threshold", () => {
    const result = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          toolPermissions: [
            {
              tool: "shell",
              reason: "Exercise the canonical ambiguity ceiling with an otherwise structurally complete draft.",
              risk: "high"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z",
      threshold: 1
    });

    assert.equal(result.ok, false);
    assert.equal(result.ambiguityAssessment?.ambiguity, 0.213);
    assert.equal(result.ambiguityAssessment?.accepted, false);
    assert.ok(
      result.errors.includes("Intent ambiguity 0.21 exceeds admission ceiling 0.20."),
      result.errors.join("; ")
    );
  });

  it("rejects non-finite ambiguity decisions even when an assessment claims acceptance", () => {
    const promoted = promoteIntentDraft({
      draft: clearCosmeticDraft(),
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    assertPromotionSucceeded(promoted);

    const nanDecision = evaluateIntentAmbiguityAdmission({
      ...promoted.ambiguityAssessment,
      ambiguity: Number.NaN,
      accepted: true
    });
    const infiniteDecision = evaluateIntentAmbiguityAdmission({
      ...promoted.ambiguityAssessment,
      ambiguity: Number.POSITIVE_INFINITY,
      accepted: true
    });

    assert.equal(nanDecision.accepted, false);
    assert.equal(nanDecision.finite, false);
    assert.deepEqual(nanDecision.errors, ["Intent ambiguity must be finite before promotion."]);
    assert.equal(infiniteDecision.accepted, false);
    assert.equal(infiniteDecision.finite, false);
    assert.deepEqual(infiniteDecision.errors, ["Intent ambiguity must be finite before promotion."]);
  });

  it("keeps authority overage as an ambiguity finding unless explicit authority justification overrides it", () => {
    const blocked = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          toolPermissions: [
            {
              tool: "shell",
              reason: "Exercise overage ambiguity for the admission gate.",
              risk: "high"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    assertPromotionFailed(blocked, "ambiguity-only");
    assert.deepEqual(blocked.failureDetails.checklistErrors, []);
    assert.equal(blocked.policyFindings[0]?.code, "tool-authority-overage");
    assert.equal(blocked.policyFindings[0]?.fieldPath, "capabilityEnvelope.toolPermissions.0.risk");
    assert.equal(blocked.policyFindings[0]?.overridable, true);
    assert.equal(blocked.policyFindings[0]?.overridden, false);
    assert.equal(blocked.policyFindings[0]?.authorityJustification, undefined);
    assert.equal(blocked.policyFindings[0]?.overage?.authorityJustificationRequired, true);
    assert.equal(blocked.policyFindings[0]?.overage?.overrideFieldPath, "capabilityEnvelope.authorityJustification");
    assert.ok(
      blocked.requiredClarifications.some(
        (clarification) =>
          clarification.source === "policy-finding" &&
          clarification.issueCode === "tool-authority-overage" &&
          clarification.fieldPath === "capabilityEnvelope.toolPermissions.0.risk"
      )
    );

    const authorityJustification = "The operator explicitly authorizes a one-off shell inspection boundary.";
    const overridden = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          authority_justification: `  ${authorityJustification}  `,
          toolPermissions: [
            {
              tool: "shell",
              reason: "Exercise explicit authority override for the admission gate.",
              risk: "high"
            }
          ]
        } as NonNullable<IntentDraft["capabilityEnvelope"]>
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionSucceeded(overridden);
    assert.deepEqual(overridden.errors, []);
    assert.equal(overridden.policyFindings[0]?.code, "tool-authority-overage");
    assert.equal(overridden.policyFindings[0]?.fieldPath, "capabilityEnvelope.toolPermissions.0.risk");
    assert.equal(overridden.policyFindings[0]?.overridden, true);
    assert.equal(overridden.policyFindings[0]?.authorityJustification, authorityJustification);
    assert.equal(overridden.policyFindings[0]?.overage?.authorityJustification, authorityJustification);
  });

  it("blocks ConfirmedIntent creation when capability-envelope admission has unresolved policy findings", () => {
    const draft: IntentDraft = {
      ...clearCosmeticDraft(),
      capabilityEnvelope: {
        ...clearCosmeticDraft().capabilityEnvelope,
        toolPermissions: [
          {
            tool: "browser",
            permissionLevel: "admin",
            reason: "Exercise the explicit capability-envelope admission gate before confirmation.",
            risk: "high"
          }
        ]
      }
    };
    const admission = validateIntentDraftCapabilityEnvelopeAdmission({ draft });
    const blocked = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(admission.ok, false);
    assert.deepEqual(
      admission.unresolvedFindings.map(({ code, fieldPath, overridden }) => ({ code, fieldPath, overridden })),
      [
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.0.tool",
          overridden: false
        },
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.0.risk",
          overridden: false
        },
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.0.permissionLevel",
          overridden: false
        }
      ]
    );
    assertPromotionFailed(blocked, "ambiguity-only");
    assert.equal("intent" in blocked, false);
    assert.deepEqual(blocked.failureDetails.checklistErrors, []);
    assert.equal(blocked.policyFindings.length, admission.findings.length);
    assert.ok(
      blocked.errors.some((error) => error.includes("exceeds admission ceiling 0.20")),
      blocked.errors.join("; ")
    );
  });

  it("detects requested capability envelope overages against the selected archetype policy", () => {
    const cosmeticPolicy = GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"];
    const requestedCapabilities = {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/intent",
          access: "execute"
        }
      ],
      toolPermissions: [
        {
          tool: "shell",
          reason: "Run a broad shell inspection beyond cosmetic-tweak caps.",
          risk: "high"
        }
      ],
      budget: {
        timeoutMs: cosmeticPolicy.budgetCaps.timeoutMs + 1,
        maxRepairLoops: cosmeticPolicy.budgetCaps.maxRepairLoops + 1
      }
    } satisfies IntentDraft["capabilityEnvelope"];

    const detection = detectCapabilityEnvelopeOverages({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: requestedCapabilities
    });

    assert.equal(detection.ok, false);
    assert.equal(detection.goalArchetype, "cosmetic-tweak");
    assert.deepEqual(detection.requestedCapabilities, requestedCapabilities);
    assert.deepEqual(detection.allowedEnvelope, cosmeticPolicy);
    assert.deepEqual(
      detection.findings.map(({ code, fieldPath, severity, overridable, overridden }) => ({
        code,
        fieldPath,
        severity,
        overridable,
        overridden
      })),
      [
        {
          code: "repo-authority-overage",
          fieldPath: "capabilityEnvelope.repoScopes.0.access",
          severity: "ambiguity",
          overridable: true,
          overridden: false
        },
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.0.risk",
          severity: "ambiguity",
          overridable: true,
          overridden: false
        },
        {
          code: "budget-authority-overage",
          fieldPath: "capabilityEnvelope.budget",
          severity: "ambiguity",
          overridable: true,
          overridden: false
        },
        {
          code: "budget-authority-overage",
          fieldPath: "capabilityEnvelope.budget",
          severity: "ambiguity",
          overridable: true,
          overridden: false
        }
      ]
    );
    assert.match(
      detection.findings[0]?.message ?? "",
      /allowed repo-scope values \(read, write; cap write\)\. execute grant is disabled\./
    );
    assert.deepEqual(
      detection.findings.map((finding) => finding.overage),
      [
        {
          kind: "repo_scope",
          goalArchetype: "cosmetic-tweak",
          fieldPath: "capabilityEnvelope.repoScopes.0.access",
          authorityJustificationRequired: true,
          overrideFieldPath: "capabilityEnvelope.authorityJustification",
          scopeIndex: 0,
          reasonCode: "repo_scope_disallowed_access",
          requested: {
            access: "execute",
            workspace: "protostar",
            path: "packages/intent"
          },
          allowed: {
            accessLevels: ["read", "write"],
            maxAccess: "write",
            pathBoundary: "bounded",
            writeGrantAllowed: true,
            executeGrantAllowed: false
          }
        },
        {
          kind: "tool_permission",
          goalArchetype: "cosmetic-tweak",
          fieldPath: "capabilityEnvelope.toolPermissions.0.risk",
          authorityJustificationRequired: true,
          overrideFieldPath: "capabilityEnvelope.authorityJustification",
          toolPermissionIndex: 0,
          requested: {
            risk: "high",
            tool: "shell"
          },
          allowed: {
            riskLevels: ["low"],
            maxRisk: "low"
          }
        },
        {
          kind: "budget",
          goalArchetype: "cosmetic-tweak",
          fieldPath: "capabilityEnvelope.budget",
          authorityJustificationRequired: true,
          overrideFieldPath: "capabilityEnvelope.authorityJustification",
          budgetKey: "timeoutMs",
          requested: {
            key: "timeoutMs",
            value: cosmeticPolicy.budgetCaps.timeoutMs + 1
          },
          allowed: {
            key: "timeoutMs",
            cap: cosmeticPolicy.budgetCaps.timeoutMs
          }
        },
        {
          kind: "budget",
          goalArchetype: "cosmetic-tweak",
          fieldPath: "capabilityEnvelope.budget",
          authorityJustificationRequired: true,
          overrideFieldPath: "capabilityEnvelope.authorityJustification",
          budgetKey: "maxRepairLoops",
          requested: {
            key: "maxRepairLoops",
            value: cosmeticPolicy.budgetCaps.maxRepairLoops + 1
          },
          allowed: {
            key: "maxRepairLoops",
            cap: cosmeticPolicy.budgetCaps.maxRepairLoops
          }
        }
      ]
    );

    const directOverrideJustification = "The operator explicitly authorizes this bounded capability overage.";
    const overridden = detectCapabilityEnvelopeOverages({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        ...requestedCapabilities,
        authorityJustification: directOverrideJustification
      }
    });

    assert.equal(overridden.ok, false);
    assert.equal(overridden.authorityJustification, directOverrideJustification);
    assert.equal(overridden.findings.length, detection.findings.length);
    assert.equal(overridden.findings.every((finding) => finding.overridden), true);
    assert.deepEqual(
      overridden.findings.map((finding) => ({
        authorityJustification: finding.authorityJustification,
        overageAuthorityJustification: finding.overage?.authorityJustification
      })),
      detection.findings.map(() => ({
        authorityJustification: directOverrideJustification,
        overageAuthorityJustification: directOverrideJustification
      }))
    );
  });

  it("validates budget limits against archetype caps with deterministic admission failures", () => {
    assert.deepEqual([...CAPABILITY_ENVELOPE_BUDGET_LIMIT_VIOLATION_CODES], [
      "budget_limit_unknown_archetype",
      "budget_limit_exceeds_cap"
    ]);
    assert.deepEqual(
      validateCapabilityEnvelopeBudgetLimits({
        goalArchetype: "unknown-archetype",
        capabilityEnvelope: {
          budget: {
            timeoutMs: 1
          }
        }
      }).violations.map(({ code, fieldPath, severity, overridable, overridden }) => ({
        code,
        fieldPath,
        severity,
        overridable,
        overridden
      })),
      [
        {
          code: "budget_limit_unknown_archetype",
          fieldPath: "goalArchetype",
          severity: "block",
          overridable: false,
          overridden: false
        }
      ]
    );

    const cosmeticPolicy = GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"];
    const input = {
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        budget: {
          maxUsd: 25,
          timeoutMs: cosmeticPolicy.budgetCaps.timeoutMs + 1,
          maxRepairLoops: cosmeticPolicy.budgetCaps.maxRepairLoops + 1
        }
      }
    } satisfies Parameters<typeof validateCapabilityEnvelopeBudgetLimits>[0];

    const first = validateCapabilityEnvelopeBudgetLimits(input);
    const second = validateCapabilityEnvelopeBudgetLimits(input);

    assert.deepEqual(second, first);
    assert.equal(first.ok, false);
    assert.deepEqual(
      first.violations.map((violation) => ({
        code: violation.code,
        fieldPath: violation.fieldPath,
        severity: violation.severity,
        overridable: violation.overridable,
        overridden: violation.overridden,
        budgetKey: violation.budgetKey,
        requestedValue: violation.requestedValue,
        allowedCap: violation.allowedCap,
        overageKind: violation.overage?.kind
      })),
      [
        {
          code: "budget_limit_exceeds_cap",
          fieldPath: "capabilityEnvelope.budget",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          budgetKey: "timeoutMs",
          requestedValue: cosmeticPolicy.budgetCaps.timeoutMs + 1,
          allowedCap: cosmeticPolicy.budgetCaps.timeoutMs,
          overageKind: "budget"
        },
        {
          code: "budget_limit_exceeds_cap",
          fieldPath: "capabilityEnvelope.budget",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          budgetKey: "maxRepairLoops",
          requestedValue: cosmeticPolicy.budgetCaps.maxRepairLoops + 1,
          allowedCap: cosmeticPolicy.budgetCaps.maxRepairLoops,
          overageKind: "budget"
        }
      ]
    );
    assert.match(first.violations[1]?.message ?? "", /policy repair_loop_count cap of 1/);
    assert.deepEqual(
      validateCapabilityEnvelopeBudgetLimits({
        ...input,
        capabilityEnvelope: {
          ...input.capabilityEnvelope,
          budget: {
            timeoutMs: cosmeticPolicy.budgetCaps.timeoutMs,
            maxRepairLoops: cosmeticPolicy.budgetCaps.maxRepairLoops
          }
        }
      }).violations,
      []
    );

    const authorityJustification = "The operator explicitly authorizes this bounded budget overage.";
    const overridden = validateCapabilityEnvelopeBudgetLimits({
      ...input,
      capabilityEnvelope: {
        ...input.capabilityEnvelope,
        authorityJustification
      }
    });

    assert.equal(overridden.ok, false);
    assert.equal(overridden.violations.every((violation) => violation.overridden), true);
    assert.deepEqual(
      overridden.violations.map((violation) => ({
        authorityJustification: violation.authorityJustification,
        overageAuthorityJustification: violation.overage?.authorityJustification
      })),
      first.violations.map(() => ({
        authorityJustification,
        overageAuthorityJustification: authorityJustification
      }))
    );
  });

  it("covers AC 60305 accepted and rejected budget and repair_loop_count admission using the exported policy table", () => {
    const policyTable: GoalArchetypePolicyTable = GOAL_ARCHETYPE_POLICY_TABLE;
    const goalArchetype: GoalArchetype = "cosmetic-tweak";
    const cosmeticPolicy = policyTable[goalArchetype];
    const timeoutCap = cosmeticPolicy.budgets.timeoutMs;
    const repairLoopCap = cosmeticPolicy.budgets.repair_loop_count;

    assert.equal(ARCHETYPE_POLICY_TABLE, policyTable);
    assert.equal(cosmeticPolicy.budgetCaps.timeoutMs, timeoutCap);
    assert.equal(cosmeticPolicy.budgetCaps.maxRepairLoops, repairLoopCap);

    const acceptedBudget = validateCapabilityEnvelopeBudgetLimits({
      policyTable,
      goalArchetype,
      capabilityEnvelope: {
        budget: {
          timeoutMs: timeoutCap,
          maxRepairLoops: repairLoopCap
        }
      }
    });
    const rejectedBudget = validateCapabilityEnvelopeBudgetLimits({
      policyTable,
      goalArchetype,
      capabilityEnvelope: {
        budget: {
          timeoutMs: timeoutCap + 1,
          maxRepairLoops: repairLoopCap
        }
      }
    });

    assert.deepEqual(acceptedBudget, {
      ok: true,
      goalArchetype,
      violations: []
    });
    assert.equal(rejectedBudget.ok, false);
    assert.deepEqual(
      rejectedBudget.violations.map(
        ({ code, fieldPath, severity, overridable, overridden, budgetKey, requestedValue, allowedCap }) => ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          budgetKey,
          requestedValue,
          allowedCap
        })
      ),
      [
        {
          code: "budget_limit_exceeds_cap",
          fieldPath: "capabilityEnvelope.budget",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          budgetKey: "timeoutMs",
          requestedValue: timeoutCap + 1,
          allowedCap: timeoutCap
        }
      ]
    );

    const acceptedRepairLoopCount = validateCapabilityEnvelopeRepairLoopCount({
      goalArchetype,
      selectedGoalArchetypePolicy: cosmeticPolicy,
      capabilityEnvelope: {
        budget: {
          maxRepairLoops: repairLoopCap
        }
      }
    });
    const rejectedRepairLoopCount = validateCapabilityEnvelopeRepairLoopCount({
      goalArchetype,
      selectedGoalArchetypePolicy: cosmeticPolicy,
      capabilityEnvelope: {
        budget: {
          maxRepairLoops: repairLoopCap + 1
        }
      }
    });
    const rejectedRepairLoopBudget = validateCapabilityEnvelopeBudgetLimits({
      policyTable,
      goalArchetype,
      capabilityEnvelope: {
        budget: {
          maxRepairLoops: repairLoopCap + 1
        }
      }
    });

    assert.deepEqual(acceptedRepairLoopCount, {
      ok: true,
      goalArchetype,
      failures: []
    });
    assert.equal(rejectedRepairLoopCount.ok, false);
    assert.deepEqual(
      rejectedRepairLoopCount.failures.map(
        ({ code, fieldPath, severity, requestedRepairLoopCount, allowedRepairLoopCount, policyField }) => ({
          code,
          fieldPath,
          severity,
          requestedRepairLoopCount,
          allowedRepairLoopCount,
          policyField
        })
      ),
      [
        {
          code: "repair_loop_count_exceeds_cap",
          fieldPath: "capabilityEnvelope.budget.maxRepairLoops",
          severity: "ambiguity",
          requestedRepairLoopCount: repairLoopCap + 1,
          allowedRepairLoopCount: repairLoopCap,
          policyField: "repair_loop_count"
        }
      ]
    );
    assert.deepEqual(
      rejectedRepairLoopBudget.violations.map(
        ({ code, fieldPath, severity, budgetKey, requestedValue, allowedCap, overage }) => ({
          code,
          fieldPath,
          severity,
          budgetKey,
          requestedValue,
          allowedCap,
          overage
        })
      ),
      [
        {
          code: "budget_limit_exceeds_cap",
          fieldPath: "capabilityEnvelope.budget",
          severity: "ambiguity",
          budgetKey: "maxRepairLoops",
          requestedValue: repairLoopCap + 1,
          allowedCap: repairLoopCap,
          overage: {
            kind: "budget",
            goalArchetype,
            fieldPath: "capabilityEnvelope.budget",
            authorityJustificationRequired: true,
            overrideFieldPath: "capabilityEnvelope.authorityJustification",
            budgetKey: "maxRepairLoops",
            requested: {
              key: "maxRepairLoops",
              value: repairLoopCap + 1
            },
            allowed: {
              key: "maxRepairLoops",
              cap: repairLoopCap
            }
          }
        }
      ]
    );
  });

  it("returns stable allow and deny repo-scope results with deterministic reason codes", () => {
    assert.deepEqual([...REPO_SCOPE_ADMISSION_REASON_CODES], [
      "repo_scope_allowed",
      "repo_scope_missing",
      "repo_scope_unknown_archetype",
      "repo_scope_unknown_access",
      "repo_scope_disallowed_access",
      "repo_scope_disallowed_path_boundary",
      "repo_scope_workspace_trust_refused"
    ]);

    const allowedInput = {
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: "packages/intent",
            access: "write"
          }
        ]
      }
    } satisfies Parameters<typeof evaluateRepoScopeAdmission>[0];
    const allowed = evaluateRepoScopeAdmission(allowedInput);

    assert.deepEqual(evaluateRepoScopeAdmission(allowedInput), allowed);
    assert.equal(allowed.decision, "allow");
    assert.equal(allowed.allowed, true);
    assert.deepEqual(allowed.reasonCodes, ["repo_scope_allowed"]);
    assert.deepEqual(
      allowed.results.map(({ decision, kind, reasonCode, fieldPath, severity, scopeIndex }) => ({
        decision,
        kind,
        reasonCode,
        fieldPath,
        severity,
        scopeIndex
      })),
      [
        {
          decision: "allow",
          kind: "allowed",
          reasonCode: "repo_scope_allowed",
          fieldPath: "capabilityEnvelope.repoScopes.0",
          severity: "allow",
          scopeIndex: 0
        }
      ]
    );

    const denialCases: {
      readonly label: string;
      readonly input: Parameters<typeof evaluateRepoScopeAdmission>[0];
      readonly expected: readonly {
        readonly decision: "deny";
        readonly kind: "missing" | "unknown" | "disallowed";
        readonly reasonCode: string;
        readonly fieldPath: string;
        readonly severity: "block" | "ambiguity";
      }[];
    }[] = [
      {
        label: "missing repoScopes",
        input: {
          goalArchetype: "cosmetic-tweak",
          capabilityEnvelope: {}
        },
        expected: [
          {
            decision: "deny",
            kind: "missing",
            reasonCode: "repo_scope_missing",
            fieldPath: "capabilityEnvelope.repoScopes",
            severity: "block"
          }
        ]
      },
      {
        label: "unknown archetype",
        input: {
          goalArchetype: "unknown-archetype",
          capabilityEnvelope: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/intent",
                access: "write"
              }
            ]
          }
        },
        expected: [
          {
            decision: "deny",
            kind: "unknown",
            reasonCode: "repo_scope_unknown_archetype",
            fieldPath: "goalArchetype",
            severity: "block"
          }
        ]
      },
      {
        label: "unknown access",
        input: {
          goalArchetype: "cosmetic-tweak",
          capabilityEnvelope: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/intent",
                access: "admin" as never
              }
            ]
          }
        },
        expected: [
          {
            decision: "deny",
            kind: "unknown",
            reasonCode: "repo_scope_unknown_access",
            fieldPath: "capabilityEnvelope.repoScopes.0.access",
            severity: "block"
          }
        ]
      },
      {
        label: "disallowed access",
        input: {
          goalArchetype: "cosmetic-tweak",
          capabilityEnvelope: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/intent",
                access: "execute"
              }
            ]
          }
        },
        expected: [
          {
            decision: "deny",
            kind: "disallowed",
            reasonCode: "repo_scope_disallowed_access",
            fieldPath: "capabilityEnvelope.repoScopes.0.access",
            severity: "ambiguity"
          }
        ]
      }
    ];

    for (const testCase of denialCases) {
      const first = evaluateRepoScopeAdmission(testCase.input);
      const second = evaluateRepoScopeAdmission(testCase.input);

      assert.deepEqual(second, first, `${testCase.label} should be stable.`);
      assert.equal(first.decision, "deny", testCase.label);
      assert.equal(first.allowed, false, testCase.label);
      assert.deepEqual(
        first.reasonCodes,
        testCase.expected.map((result) => result.reasonCode),
        testCase.label
      );
      assert.deepEqual(
        first.results.map(({ decision, kind, reasonCode, fieldPath, severity }) => ({
          decision,
          kind,
          reasonCode,
          fieldPath,
          severity
        })),
        testCase.expected,
        testCase.label
      );
    }
  });

  it("blocks workspace repo scope admission when workspace trust is untrusted", () => {
    const cosmeticPolicy = GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"];
    const workspacePolicy: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": {
        ...cosmeticPolicy,
        repo_scope: {
          ...cosmeticPolicy.repo_scope,
          pathBoundary: "workspace"
        },
        writeGrant: {
          ...cosmeticPolicy.writeGrant,
          pathBoundary: "workspace"
        }
      }
    };
    const trusted = evaluateRepoScopeAdmission({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: ".",
            access: "read"
          }
        ]
      },
      policyTable: workspacePolicy,
      workspaceTrust: { protostar: "trusted" }
    });
    assert.equal(trusted.decision, "allow");

    const untrusted = evaluateRepoScopeAdmission({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: ".",
            access: "read"
          }
        ]
      },
      policyTable: workspacePolicy,
      workspaceTrust: { protostar: "untrusted" }
    });

    assert.equal(untrusted.decision, "deny");
    assert.equal(untrusted.allowed, false);
    assert.deepEqual(untrusted.reasonCodes, ["repo_scope_workspace_trust_refused"]);
    assert.match(untrusted.results[0]?.message ?? "", /executionScope "workspace"/);
  });

  it("covers AC 60104 repo-scope admission for allowed scopes, denied scopes, and unknown archetypes", () => {
    const cases = [
      {
        label: "two bounded cosmetic scopes are allowed",
        input: {
          goalArchetype: "cosmetic-tweak",
          capabilityEnvelope: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/intent",
                access: "read"
              },
              {
                workspace: "protostar",
                path: "packages/policy/src/admission-control.test.ts",
                access: "write"
              }
            ]
          }
        },
        expectedDecision: "allow",
        expectedAllowed: true,
        expectedReasonCodes: ["repo_scope_allowed"],
        expectedResults: [
          {
            decision: "allow",
            kind: "allowed",
            reasonCode: "repo_scope_allowed",
            fieldPath: "capabilityEnvelope.repoScopes.0",
            severity: "allow",
            overridable: false,
            overridden: false,
            scopeIndex: 0
          },
          {
            decision: "allow",
            kind: "allowed",
            reasonCode: "repo_scope_allowed",
            fieldPath: "capabilityEnvelope.repoScopes.1",
            severity: "allow",
            overridable: false,
            overridden: false,
            scopeIndex: 1
          }
        ]
      },
      {
        label: "execute access and repo-root path are denied for bounded cosmetic scopes",
        input: {
          goalArchetype: "cosmetic-tweak",
          capabilityEnvelope: {
            repoScopes: [
              {
                workspace: "protostar",
                path: ".",
                access: "execute"
              }
            ]
          }
        },
        expectedDecision: "deny",
        expectedAllowed: false,
        expectedReasonCodes: ["repo_scope_disallowed_access", "repo_scope_disallowed_path_boundary"],
        expectedResults: [
          {
            decision: "deny",
            kind: "disallowed",
            reasonCode: "repo_scope_disallowed_access",
            fieldPath: "capabilityEnvelope.repoScopes.0.access",
            severity: "ambiguity",
            overridable: true,
            overridden: false,
            scopeIndex: 0
          },
          {
            decision: "deny",
            kind: "disallowed",
            reasonCode: "repo_scope_disallowed_path_boundary",
            fieldPath: "capabilityEnvelope.repoScopes.0.path",
            severity: "ambiguity",
            overridable: true,
            overridden: false,
            scopeIndex: 0
          }
        ]
      },
      {
        label: "unknown archetype blocks before scope caps can be selected",
        input: {
          goalArchetype: "large-rewrite",
          capabilityEnvelope: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/intent",
                access: "write"
              }
            ]
          }
        },
        expectedDecision: "deny",
        expectedAllowed: false,
        expectedReasonCodes: ["repo_scope_unknown_archetype"],
        expectedResults: [
          {
            decision: "deny",
            kind: "unknown",
            reasonCode: "repo_scope_unknown_archetype",
            fieldPath: "goalArchetype",
            severity: "block",
            overridable: false,
            overridden: false,
            scopeIndex: undefined
          }
        ]
      }
    ] as const;

    for (const testCase of cases) {
      const first = evaluateRepoScopeAdmission(testCase.input);
      const second = evaluateRepoScopeAdmission(testCase.input);
      const third = evaluateRepoScopeAdmission(testCase.input);

      assert.deepEqual(second, first, `${testCase.label} should repeat deterministically.`);
      assert.deepEqual(third, first, `${testCase.label} should remain deterministic across repeated calls.`);
      assert.equal(first.decision, testCase.expectedDecision, testCase.label);
      assert.equal(first.allowed, testCase.expectedAllowed, testCase.label);
      assert.deepEqual(first.reasonCodes, testCase.expectedReasonCodes, testCase.label);
      assert.deepEqual(
        first.results.map(
          ({ decision, kind, reasonCode, fieldPath, severity, overridable, overridden, scopeIndex }) => ({
            decision,
            kind,
            reasonCode,
            fieldPath,
            severity,
            overridable,
            overridden,
            scopeIndex
          })
        ),
        testCase.expectedResults,
        testCase.label
      );
    }
  });

  it("hard-blocks unknown draft archetypes deterministically before authority overrides apply", () => {
    const draft: IntentDraft = {
      ...clearCosmeticDraft(),
      goalArchetype: "large-rewrite",
      capabilityEnvelope: {
        ...clearCosmeticDraft().capabilityEnvelope,
        authorityJustification: "The operator explicitly authorizes broader authority, but no policy row exists.",
        repoScopes: [
          {
            workspace: "protostar",
            path: "packages/intent",
            access: "write"
          }
        ]
      }
    };
    const first = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    const second = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.deepEqual(second, first);
    assertPromotionFailed(first, "checklist-only");
    assert.deepEqual(first.policyFindings, [
      {
        code: "unknown-goal-archetype",
        fieldPath: "goalArchetype",
        severity: "block",
        message: "goalArchetype 'large-rewrite' is not present in the policy table.",
        overridable: false,
        overridden: false
      }
    ]);
    assert.deepEqual(first.failureDetails.checklistErrors, [
      "goalArchetype 'large-rewrite' is not present in the policy table."
    ]);
    assert.deepEqual(first.failureDetails.ambiguityErrors, []);
    assert.equal(first.ambiguityAssessment.ambiguity <= 0.2, true);
  });

  it("uses allowed repo-scope values from the archetype policy table for repo authority findings", () => {
    const blocked = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          repoScopes: [
            {
              workspace: "protostar",
              path: "packages/intent",
              access: "execute"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.policyFindings[0]?.code, "repo-authority-overage");
    assert.equal(blocked.policyFindings[0]?.fieldPath, "capabilityEnvelope.repoScopes.0.access");
    assert.equal(blocked.policyFindings[0]?.overridden, false);
    assert.match(
      blocked.policyFindings[0]?.message ?? "",
      /allowed repo-scope values \(read, write; cap write\)\. execute grant is disabled\./
    );

    const overridden = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          authorityJustification: "The operator explicitly authorizes executing a bounded repo-scoped inspection.",
          repoScopes: [
            {
              workspace: "protostar",
              path: "packages/intent",
              access: "execute"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionSucceeded(overridden);
    assert.equal(overridden.policyFindings[0]?.code, "repo-authority-overage");
    assert.equal(overridden.policyFindings[0]?.overridden, true);
  });

  it("drives execute access admission from the explicit execute grant", () => {
    const cosmeticPolicy = GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"];
    const executeDeniedPolicy: GoalArchetypePolicyEntry = {
      ...cosmeticPolicy,
      repo_scope: {
        ...cosmeticPolicy.repo_scope,
        allowedValues: ["read", "write", "execute"],
        maxAccess: "execute"
      },
      allowedRepoScopeValues: ["read", "write", "execute"],
      executeGrant: {
        ...cosmeticPolicy.executeGrant,
        allowed: false
      },
      maxRepoAccess: "execute"
    };
    const executeDeniedPolicyTable: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": executeDeniedPolicy
    };
    const denied = evaluateRepoScopeAdmission({
      policyTable: executeDeniedPolicyTable,
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: "packages/intent",
            access: "execute"
          }
        ]
      }
    });

    assert.equal(denied.allowed, false);
    assert.equal(denied.reasonCodes[0], "repo_scope_disallowed_access");
    assert.match(denied.results[0]?.message ?? "", /execute grant is disabled/);

    const executeAllowedPolicy: GoalArchetypePolicyEntry = {
      ...executeDeniedPolicy,
      executeGrant: {
        ...executeDeniedPolicy.executeGrant,
        allowed: true
      }
    };
    const executeAllowedPolicyTable: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": executeAllowedPolicy
    };
    const allowed = evaluateRepoScopeAdmission({
      policyTable: executeAllowedPolicyTable,
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: "packages/intent",
            access: "execute"
          }
        ]
      }
    });

    assert.equal(allowed.allowed, true);
    assert.deepEqual(allowed.reasonCodes, ["repo_scope_allowed"]);
  });

  it("validates repo-scope path boundaries against the exported archetype policy table", () => {
    const blocked = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          repoScopes: [
            {
              workspace: "protostar",
              path: ".",
              access: "write"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(blocked.ok, false);
    const pathFinding = blocked.policyFindings.find(
      (finding) => finding.fieldPath === "capabilityEnvelope.repoScopes.0.path"
    );
    assert.ok(pathFinding);
    assert.equal(pathFinding.code, "repo-authority-overage");
    assert.equal(pathFinding.overridden, false);
    assert.match(pathFinding.message, /repo-scope path boundary \(bounded\)/);

    const overridden = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          authorityJustification: "The operator explicitly authorizes treating this cosmetic edit as repo-wide.",
          repoScopes: [
            {
              workspace: "protostar",
              path: ".",
              access: "write"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });

    assertPromotionSucceeded(overridden);
    assert.equal(overridden.policyFindings[0]?.fieldPath, "capabilityEnvelope.repoScopes.0.path");
    assert.equal(overridden.policyFindings[0]?.overridden, true);
  });

  it("covers AC 60205 allowed and denied write, execute, and tool permission envelopes", () => {
    const strictWritePolicy: GoalArchetypePolicyEntry = {
      ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"],
      repo_scope: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].repo_scope,
        allowedValues: ["read"],
        maxAccess: "read"
      },
      allowedRepoScopeValues: ["read"],
      writeGrant: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].writeGrant,
        allowed: false
      },
      maxRepoAccess: "read"
    };
    const strictWritePolicyTable: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": strictWritePolicy
    };
    const executeEnabledPolicy: GoalArchetypePolicyEntry = {
      ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"],
      executeGrant: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].executeGrant,
        allowed: true,
        allowedCommands: ["pnpm test"],
        allowedExecutionScopes: ["bounded"]
      }
    };
    const executePolicyTable: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": executeEnabledPolicy
    };

    assert.deepEqual(
      validateCapabilityEnvelopeWriteGrants({
        goalArchetype: "cosmetic-tweak",
        capabilityEnvelope: {
          repoScopes: [
            {
              workspace: "protostar",
              path: "packages/policy/src/admission-control.test.ts",
              access: "write"
            }
          ]
        }
      }),
      {
        ok: true,
        goalArchetype: "cosmetic-tweak",
        violations: []
      }
    );

    const deniedWrite = validateCapabilityEnvelopeWriteGrants({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: ".",
            access: "write"
          }
        ]
      },
      policyTable: strictWritePolicyTable
    });
    assert.equal(deniedWrite.ok, false);
    assert.deepEqual(
      deniedWrite.violations.map(
        ({
          code,
          reasonCode,
          fieldPath,
          severity,
          overridable,
          overridden,
          scopeIndex,
          workspace,
          path,
          requestedAccess,
          allowedAccess,
          pathBoundary,
          overage
        }) => ({
          code,
          reasonCode,
          fieldPath,
          severity,
          overridable,
          overridden,
          scopeIndex,
          workspace,
          path,
          requestedAccess,
          allowedAccess,
          pathBoundary,
          overageKind: overage?.kind,
          overageFieldPath: overage?.fieldPath,
          overageRequested: overage?.requested,
          overageAllowed: overage?.allowed
        })
      ),
      [
        {
          code: "write_grant_disallowed_scope",
          reasonCode: "repo_scope_disallowed_access",
          fieldPath: "capabilityEnvelope.repoScopes.0.access",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          scopeIndex: 0,
          workspace: "protostar",
          path: ".",
          requestedAccess: "write",
          allowedAccess: ["read"],
          pathBoundary: "bounded",
          overageKind: "repo_scope",
          overageFieldPath: "capabilityEnvelope.repoScopes.0.access",
          overageRequested: {
            access: "write",
            workspace: "protostar",
            path: "."
          },
          overageAllowed: {
            accessLevels: ["read"],
            maxAccess: "read",
            pathBoundary: "bounded",
            writeGrantAllowed: false,
            executeGrantAllowed: false
          }
        },
        {
          code: "write_grant_disallowed_path",
          reasonCode: "repo_scope_disallowed_path_boundary",
          fieldPath: "capabilityEnvelope.repoScopes.0.path",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          scopeIndex: 0,
          workspace: "protostar",
          path: ".",
          requestedAccess: "write",
          allowedAccess: ["read"],
          pathBoundary: "bounded",
          overageKind: "repo_scope",
          overageFieldPath: "capabilityEnvelope.repoScopes.0.path",
          overageRequested: {
            access: "write",
            workspace: "protostar",
            path: "."
          },
          overageAllowed: {
            accessLevels: ["read"],
            maxAccess: "read",
            pathBoundary: "bounded",
            writeGrantAllowed: false,
            executeGrantAllowed: false
          }
        }
      ]
    );

    assert.deepEqual(
      validateCapabilityEnvelopeExecuteGrants({
        goalArchetype: "cosmetic-tweak",
        capabilityEnvelope: {
          executeGrants: [
            {
              command: "pnpm test",
              scope: "bounded",
              reason: "Run the package test gate."
            }
          ]
        },
        policyTable: executePolicyTable
      }),
      {
        ok: true,
        goalArchetype: "cosmetic-tweak",
        violations: []
      }
    );

    const deniedExecute = validateCapabilityEnvelopeExecuteGrants({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        executeGrants: [
          {
            command: "pnpm deploy",
            scope: "repository",
            reason: "Exercise execute command and scope denial."
          }
        ]
      },
      policyTable: executePolicyTable
    });
    assert.equal(deniedExecute.ok, false);
    assert.deepEqual(
      deniedExecute.violations.map(
        ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          executeGrantIndex,
          command,
          executionScope,
          allowedCommands,
          allowedExecutionScopes,
          executeGrantAllowed,
          pathBoundary,
          overage
        }) => ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          executeGrantIndex,
          command,
          executionScope,
          allowedCommands,
          allowedExecutionScopes,
          executeGrantAllowed,
          pathBoundary,
          overageKind: overage?.kind,
          overageFieldPath: overage?.fieldPath,
          overageViolationCode: overage?.violationCode,
          overageRequested: overage?.requested,
          overageAllowed: overage?.allowed
        })
      ),
      [
        {
          code: "execute_grant_disallowed_command",
          fieldPath: "capabilityEnvelope.executeGrants.0.command",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          executeGrantIndex: 0,
          command: "pnpm deploy",
          executionScope: "repository",
          allowedCommands: ["pnpm test"],
          allowedExecutionScopes: ["bounded"],
          executeGrantAllowed: true,
          pathBoundary: "bounded",
          overageKind: "execute_grant",
          overageFieldPath: "capabilityEnvelope.executeGrants.0.command",
          overageViolationCode: "execute_grant_disallowed_command",
          overageRequested: {
            command: "pnpm deploy",
            executionScope: "repository"
          },
          overageAllowed: {
            executeGrantAllowed: true,
            commands: ["pnpm test"],
            executionScopes: ["bounded"],
            pathBoundary: "bounded"
          }
        },
        {
          code: "execute_grant_disallowed_scope",
          fieldPath: "capabilityEnvelope.executeGrants.0.scope",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          executeGrantIndex: 0,
          command: "pnpm deploy",
          executionScope: "repository",
          allowedCommands: ["pnpm test"],
          allowedExecutionScopes: ["bounded"],
          executeGrantAllowed: true,
          pathBoundary: "bounded",
          overageKind: "execute_grant",
          overageFieldPath: "capabilityEnvelope.executeGrants.0.scope",
          overageViolationCode: "execute_grant_disallowed_scope",
          overageRequested: {
            command: "pnpm deploy",
            executionScope: "repository"
          },
          overageAllowed: {
            executeGrantAllowed: true,
            commands: ["pnpm test"],
            executionScopes: ["bounded"],
            pathBoundary: "bounded"
          }
        }
      ]
    );

    assert.deepEqual(
      validateCapabilityEnvelopeToolPermissions({
        goalArchetype: "cosmetic-tweak",
        capabilityEnvelope: {
          toolPermissions: [
            {
              tool: "shell",
              permissionLevel: "use",
              reason: "Run local deterministic package commands.",
              risk: "low"
            }
          ]
        }
      }),
      {
        ok: true,
        goalArchetype: "cosmetic-tweak",
        violations: []
      }
    );

    const deniedToolPermission = validateCapabilityEnvelopeToolPermissions({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        toolPermissions: [
          {
            tool: "browser",
            permissionLevel: "admin",
            reason: "Exercise tool, risk, and permission-level denial.",
            risk: "high"
          }
        ]
      }
    });
    assert.equal(deniedToolPermission.ok, false);
    assert.deepEqual(
      deniedToolPermission.violations.map(
        ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          toolPermissionIndex,
          requestedTool,
          requestedRisk,
          requestedPermissionLevel,
          allowedTools,
          allowedRiskLevels,
          maxRisk,
          allowedPermissionLevels,
          maxPermissionLevel,
          overage
        }) => ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          toolPermissionIndex,
          requestedTool,
          requestedRisk,
          requestedPermissionLevel,
          allowedTools,
          allowedRiskLevels,
          maxRisk,
          allowedPermissionLevels,
          maxPermissionLevel,
          overageKind: overage?.kind,
          overageFieldPath: overage?.fieldPath,
          overageViolationCode: overage?.violationCode,
          overageRequested: overage?.requested,
          overageAllowed: overage?.allowed
        })
      ),
      [
        {
          code: "tool_permission_disallowed_tool",
          fieldPath: "capabilityEnvelope.toolPermissions.0.tool",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          toolPermissionIndex: 0,
          requestedTool: "browser",
          requestedRisk: "high",
          requestedPermissionLevel: "admin",
          allowedTools: ["node:test", "typescript", "shell"],
          allowedRiskLevels: ["low"],
          maxRisk: "low",
          allowedPermissionLevels: ["read", "use"],
          maxPermissionLevel: "use",
          overageKind: "tool_permission",
          overageFieldPath: "capabilityEnvelope.toolPermissions.0.tool",
          overageViolationCode: "tool_permission_disallowed_tool",
          overageRequested: {
            tool: "browser",
            risk: "high",
            permissionLevel: "admin"
          },
          overageAllowed: {
            tools: ["node:test", "typescript", "shell"]
          }
        },
        {
          code: "tool_permission_disallowed_risk",
          fieldPath: "capabilityEnvelope.toolPermissions.0.risk",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          toolPermissionIndex: 0,
          requestedTool: "browser",
          requestedRisk: "high",
          requestedPermissionLevel: "admin",
          allowedTools: ["node:test", "typescript", "shell"],
          allowedRiskLevels: ["low"],
          maxRisk: "low",
          allowedPermissionLevels: ["read", "use"],
          maxPermissionLevel: "use",
          overageKind: "tool_permission",
          overageFieldPath: "capabilityEnvelope.toolPermissions.0.risk",
          overageViolationCode: undefined,
          overageRequested: {
            tool: "browser",
            risk: "high",
            permissionLevel: "admin"
          },
          overageAllowed: {
            riskLevels: ["low"],
            maxRisk: "low"
          }
        },
        {
          code: "tool_permission_disallowed_level",
          fieldPath: "capabilityEnvelope.toolPermissions.0.permissionLevel",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          toolPermissionIndex: 0,
          requestedTool: "browser",
          requestedRisk: "high",
          requestedPermissionLevel: "admin",
          allowedTools: ["node:test", "typescript", "shell"],
          allowedRiskLevels: ["low"],
          maxRisk: "low",
          allowedPermissionLevels: ["read", "use"],
          maxPermissionLevel: "use",
          overageKind: "tool_permission",
          overageFieldPath: "capabilityEnvelope.toolPermissions.0.permissionLevel",
          overageViolationCode: "tool_permission_disallowed_level",
          overageRequested: {
            tool: "browser",
            risk: "high",
            permissionLevel: "admin"
          },
          overageAllowed: {
            permissionLevels: ["read", "use"],
            maxPermissionLevel: "use"
          }
        }
      ]
    );
  });

  it("validates capability-envelope write grants with structured path and scope violations", () => {
    assert.deepEqual([...CAPABILITY_ENVELOPE_WRITE_GRANT_VIOLATION_CODES], [
      "write_grant_unknown_archetype",
      "write_grant_disallowed_scope",
      "write_grant_disallowed_path"
    ]);

    const strictCosmeticPolicy: GoalArchetypePolicyEntry = {
      ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"],
      repo_scope: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].repo_scope,
        allowedValues: ["read"],
        maxAccess: "read"
      },
      allowedRepoScopeValues: ["read"],
      writeGrant: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].writeGrant,
        allowed: false
      },
      maxRepoAccess: "read"
    };
    const strictPolicyTable: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": strictCosmeticPolicy
    };
    const input = {
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: ".",
            access: "write"
          },
          {
            workspace: "protostar",
            path: ".",
            access: "read"
          }
        ]
      },
      policyTable: strictPolicyTable
    } satisfies Parameters<typeof validateCapabilityEnvelopeWriteGrants>[0];
    const result = validateCapabilityEnvelopeWriteGrants(input);

    assert.deepEqual(validateCapabilityEnvelopeWriteGrants(input), result);
    assert.equal(result.ok, false);
    assert.equal(result.goalArchetype, "cosmetic-tweak");
    assert.deepEqual(
      result.violations.map(
        ({
          code,
          reasonCode,
          fieldPath,
          severity,
          overridable,
          overridden,
          scopeIndex,
          workspace,
          path,
          requestedAccess,
          allowedAccess,
          pathBoundary
        }) => ({
          code,
          reasonCode,
          fieldPath,
          severity,
          overridable,
          overridden,
          scopeIndex,
          workspace,
          path,
          requestedAccess,
          allowedAccess,
          pathBoundary
        })
      ),
      [
        {
          code: "write_grant_disallowed_scope",
          reasonCode: "repo_scope_disallowed_access",
          fieldPath: "capabilityEnvelope.repoScopes.0.access",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          scopeIndex: 0,
          workspace: "protostar",
          path: ".",
          requestedAccess: "write",
          allowedAccess: ["read"],
          pathBoundary: "bounded"
        },
        {
          code: "write_grant_disallowed_path",
          reasonCode: "repo_scope_disallowed_path_boundary",
          fieldPath: "capabilityEnvelope.repoScopes.0.path",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          scopeIndex: 0,
          workspace: "protostar",
          path: ".",
          requestedAccess: "write",
          allowedAccess: ["read"],
          pathBoundary: "bounded"
        }
      ]
    );

    const overridden = validateCapabilityEnvelopeWriteGrants({
      ...input,
      capabilityEnvelope: {
        ...input.capabilityEnvelope,
        authorityJustification: "The operator explicitly authorizes a one-off broad write grant."
      }
    });
    assert.equal(overridden.ok, false);
    assert.deepEqual(
      overridden.violations.map(({ code, overridden: isOverridden }) => ({ code, overridden: isOverridden })),
      [
        {
          code: "write_grant_disallowed_scope",
          overridden: true
        },
        {
          code: "write_grant_disallowed_path",
          overridden: true
        }
      ]
    );
  });

  it("validates capability-envelope execute grants with structured command and execution-scope violations", () => {
    assert.deepEqual([...CAPABILITY_ENVELOPE_EXECUTE_GRANT_VIOLATION_CODES], [
      "execute_grant_unknown_archetype",
      "execute_grant_disallowed_command",
      "execute_grant_disallowed_scope"
    ]);

    const executeEnabledPolicy: GoalArchetypePolicyEntry = {
      ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"],
      executeGrant: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].executeGrant,
        allowed: true,
        allowedCommands: ["pnpm test"],
        allowedExecutionScopes: ["bounded"]
      }
    };
    const executePolicyTable: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": executeEnabledPolicy
    };
    const input = {
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        executeGrants: [
          {
            command: "pnpm test",
            scope: "bounded",
            reason: "Run the focused admission tests inside the package boundary."
          },
          {
            command: "rm -rf .",
            scope: "repository",
            reason: "Exercise command and scope denial reporting."
          }
        ]
      },
      policyTable: executePolicyTable
    } satisfies Parameters<typeof validateCapabilityEnvelopeExecuteGrants>[0];
    const result = validateCapabilityEnvelopeExecuteGrants(input);

    assert.deepEqual(validateCapabilityEnvelopeExecuteGrants(input), result);
    assert.equal(result.ok, false);
    assert.equal(result.goalArchetype, "cosmetic-tweak");
    assert.deepEqual(
      result.violations.map(
        ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          executeGrantIndex,
          command,
          executionScope,
          allowedCommands,
          allowedExecutionScopes,
          executeGrantAllowed,
          pathBoundary
        }) => ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          executeGrantIndex,
          command,
          executionScope,
          allowedCommands,
          allowedExecutionScopes,
          executeGrantAllowed,
          pathBoundary
        })
      ),
      [
        {
          code: "execute_grant_disallowed_command",
          fieldPath: "capabilityEnvelope.executeGrants.1.command",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          executeGrantIndex: 1,
          command: "rm -rf .",
          executionScope: "repository",
          allowedCommands: ["pnpm test"],
          allowedExecutionScopes: ["bounded"],
          executeGrantAllowed: true,
          pathBoundary: "bounded"
        },
        {
          code: "execute_grant_disallowed_scope",
          fieldPath: "capabilityEnvelope.executeGrants.1.scope",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          executeGrantIndex: 1,
          command: "rm -rf .",
          executionScope: "repository",
          allowedCommands: ["pnpm test"],
          allowedExecutionScopes: ["bounded"],
          executeGrantAllowed: true,
          pathBoundary: "bounded"
        }
      ]
    );

    const detection = detectCapabilityEnvelopeOverages(input);
    assert.deepEqual(
      detection.findings.map(({ code, fieldPath, overage }) => ({
        code,
        fieldPath,
        overageKind: overage?.kind
      })),
      [
        {
          code: "execute-authority-overage",
          fieldPath: "capabilityEnvelope.executeGrants.1.command",
          overageKind: "execute_grant"
        },
        {
          code: "execute-authority-overage",
          fieldPath: "capabilityEnvelope.executeGrants.1.scope",
          overageKind: "execute_grant"
        }
      ]
    );

    const blocked = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          executeGrants: [
            {
              command: "rm -rf .",
              scope: "repository",
              reason: "Exercise default cosmetic execute denial."
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    assertPromotionFailed(blocked, "ambiguity-only");
    assert.deepEqual(
      blocked.policyFindings.map(({ code, fieldPath, overridden }) => ({ code, fieldPath, overridden })),
      [
        {
          code: "execute-authority-overage",
          fieldPath: "capabilityEnvelope.executeGrants.0.command",
          overridden: false
        },
        {
          code: "execute-authority-overage",
          fieldPath: "capabilityEnvelope.executeGrants.0.scope",
          overridden: false
        }
      ]
    );

    const overridden = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          authorityJustification: "The operator explicitly authorizes this bounded execute overage.",
          executeGrants: [
            {
              command: "pnpm test",
              scope: "bounded",
              reason: "Run the focused admission tests."
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    assertPromotionSucceeded(overridden);
    assert.equal(overridden.policyFindings.every((finding) => finding.overridden), true);
    assert.deepEqual(overridden.intent.capabilityEnvelope.executeGrants, [
      {
        command: "pnpm test",
        scope: "bounded",
        reason: "Run the focused admission tests."
      }
    ]);
  });

  it("validates capability-envelope tool permissions with structured tool and permission-level violations", () => {
    assert.deepEqual([...CAPABILITY_ENVELOPE_TOOL_PERMISSION_VIOLATION_CODES], [
      "tool_permission_unknown_archetype",
      "tool_permission_disallowed_tool",
      "tool_permission_disallowed_risk",
      "tool_permission_disallowed_level"
    ]);

    const input = {
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        toolPermissions: [
          {
            tool: "node:test",
            permissionLevel: "use",
            reason: "Run the focused deterministic admission tests.",
            risk: "low"
          },
          {
            tool: "browser",
            permissionLevel: "use",
            reason: "Exercise disallowed tool reporting without exceeding the risk cap.",
            risk: "low"
          },
          {
            tool: "typescript",
            permissionLevel: "admin",
            reason: "Exercise disallowed permission-level reporting without exceeding the risk cap.",
            risk: "low"
          }
        ]
      }
    } satisfies Parameters<typeof validateCapabilityEnvelopeToolPermissions>[0];
    const result = validateCapabilityEnvelopeToolPermissions(input);

    assert.deepEqual(validateCapabilityEnvelopeToolPermissions(input), result);
    assert.equal(result.ok, false);
    assert.equal(result.goalArchetype, "cosmetic-tweak");
    assert.deepEqual(
      result.violations.map(
        ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          toolPermissionIndex,
          requestedTool,
          requestedRisk,
          requestedPermissionLevel,
          allowedTools,
          allowedPermissionLevels,
          maxPermissionLevel
        }) => ({
          code,
          fieldPath,
          severity,
          overridable,
          overridden,
          toolPermissionIndex,
          requestedTool,
          requestedRisk,
          requestedPermissionLevel,
          allowedTools,
          allowedPermissionLevels,
          maxPermissionLevel
        })
      ),
      [
        {
          code: "tool_permission_disallowed_tool",
          fieldPath: "capabilityEnvelope.toolPermissions.1.tool",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          toolPermissionIndex: 1,
          requestedTool: "browser",
          requestedRisk: "low",
          requestedPermissionLevel: "use",
          allowedTools: ["node:test", "typescript", "shell"],
          allowedPermissionLevels: ["read", "use"],
          maxPermissionLevel: "use"
        },
        {
          code: "tool_permission_disallowed_level",
          fieldPath: "capabilityEnvelope.toolPermissions.2.permissionLevel",
          severity: "ambiguity",
          overridable: true,
          overridden: false,
          toolPermissionIndex: 2,
          requestedTool: "typescript",
          requestedRisk: "low",
          requestedPermissionLevel: "admin",
          allowedTools: ["node:test", "typescript", "shell"],
          allowedPermissionLevels: ["read", "use"],
          maxPermissionLevel: "use"
        }
      ]
    );
    assert.deepEqual(
      result.violations.map((violation) => violation.overage),
      [
        {
          kind: "tool_permission",
          goalArchetype: "cosmetic-tweak",
          fieldPath: "capabilityEnvelope.toolPermissions.1.tool",
          authorityJustificationRequired: true,
          overrideFieldPath: "capabilityEnvelope.authorityJustification",
          toolPermissionIndex: 1,
          violationCode: "tool_permission_disallowed_tool",
          requested: {
            tool: "browser",
            risk: "low",
            permissionLevel: "use"
          },
          allowed: {
            tools: ["node:test", "typescript", "shell"]
          }
        },
        {
          kind: "tool_permission",
          goalArchetype: "cosmetic-tweak",
          fieldPath: "capabilityEnvelope.toolPermissions.2.permissionLevel",
          authorityJustificationRequired: true,
          overrideFieldPath: "capabilityEnvelope.authorityJustification",
          toolPermissionIndex: 2,
          violationCode: "tool_permission_disallowed_level",
          requested: {
            tool: "typescript",
            risk: "low",
            permissionLevel: "admin"
          },
          allowed: {
            permissionLevels: ["read", "use"],
            maxPermissionLevel: "use"
          }
        }
      ]
    );

    const detection = detectCapabilityEnvelopeOverages(input);
    assert.deepEqual(
      detection.findings.map(({ code, fieldPath, toolPermissionViolationCode, overage }) => ({
        code,
        fieldPath,
        toolPermissionViolationCode,
        overageKind: overage?.kind
      })),
      [
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.1.tool",
          toolPermissionViolationCode: "tool_permission_disallowed_tool",
          overageKind: "tool_permission"
        },
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.2.permissionLevel",
          toolPermissionViolationCode: "tool_permission_disallowed_level",
          overageKind: "tool_permission"
        }
      ]
    );

    const blocked = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          toolPermissions: [
            {
              tool: "browser",
              permissionLevel: "use",
              reason: "Exercise default cosmetic tool denial.",
              risk: "low"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    assertPromotionFailed(blocked, "ambiguity-only");
    assert.deepEqual(
      blocked.policyFindings.map(({ code, fieldPath, toolPermissionViolationCode, overridden }) => ({
        code,
        fieldPath,
        toolPermissionViolationCode,
        overridden
      })),
      [
        {
          code: "tool-authority-overage",
          fieldPath: "capabilityEnvelope.toolPermissions.0.tool",
          toolPermissionViolationCode: "tool_permission_disallowed_tool",
          overridden: false
        }
      ]
    );

    const overridden = promoteIntentDraft({
      draft: {
        ...clearCosmeticDraft(),
        capabilityEnvelope: {
          ...clearCosmeticDraft().capabilityEnvelope,
          authorityJustification: "The operator explicitly authorizes this one-off admin tool permission.",
          toolPermissions: [
            {
              tool: "typescript",
              permissionLevel: "admin",
              reason: "Exercise explicit authority override for a permission-level overage.",
              risk: "low"
            }
          ]
        }
      },
      mode: "brownfield",
      confirmedAt: "2026-04-25T00:00:00.000Z"
    });
    assertPromotionSucceeded(overridden);
    assert.equal(overridden.policyFindings[0]?.overridden, true);
    assert.deepEqual(overridden.intent.capabilityEnvelope.toolPermissions, [
      {
        tool: "typescript",
        permissionLevel: "admin",
        reason: "Exercise explicit authority override for a permission-level overage.",
        risk: "low"
      }
    ]);
  });

  it("lets repo-scope validation consume a supplied policy table", () => {
    const strictCosmeticPolicy: GoalArchetypePolicyEntry = {
      ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"],
      repo_scope: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].repo_scope,
        allowedValues: ["read"],
        maxAccess: "read",
        pathBoundary: "repository"
      },
      allowedRepoScopeValues: ["read"],
      writeGrant: {
        ...GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"].writeGrant,
        allowed: false,
        pathBoundary: "repository"
      },
      maxRepoAccess: "read"
    };
    const strictPolicyTable: GoalArchetypePolicyTable = {
      ...GOAL_ARCHETYPE_POLICY_TABLE,
      "cosmetic-tweak": strictCosmeticPolicy
    };

    const findings = validateCapabilityEnvelopeRepoScopes({
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: ".",
            access: "write"
          }
        ]
      },
      policyTable: strictPolicyTable
    });

    assert.deepEqual(
      findings.map(({ fieldPath }) => fieldPath),
      ["capabilityEnvelope.repoScopes.0.access"]
    );
    assert.match(findings[0]?.message ?? "", /allowed repo-scope values \(read; cap read\)/);
    assert.equal(findings[0]?.writeGrantViolationCode, "write_grant_disallowed_scope");
  });
});

function assertPromotionSucceeded(
  result: PromoteIntentDraftResult
): asserts result is Extract<PromoteIntentDraftResult, { readonly ok: true }> {
  assert.equal(result.ok, true, result.errors.join("; "));
}

type FailedPromotionResult = Extract<PromoteIntentDraftResult, { readonly ok: false }>;

function assertPromotionFailed(
  result: PromoteIntentDraftResult,
  expectedState: FailedPromotionResult["failureState"]
): asserts result is FailedPromotionResult {
  assert.equal(result.ok, false);
  assert.equal("intent" in result, false);
  assert.equal(result.failureState, expectedState);
  assert.equal(result.failureDetails.state, expectedState);
  assert.equal(result.failureDetails.confirmedIntentCreated, false);
}

function clearCosmeticDraft(): IntentDraft {
  return {
    draftId: "draft_cosmetic_copy_update",
    title: "Polish settings copy",
    problem:
      "The settings page contains unclear operator-facing copy, and the bounded cosmetic update should leave the existing behavior unchanged while making the text easier to scan.",
    requester: "ouroboros-ac-10005",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    context: "The change is limited to the settings surface in the current Protostar repository checkout.",
    acceptanceCriteria: [
      {
        statement: "The settings page copy uses the approved operator-facing wording without changing behavior.",
        verification: "evidence"
      },
      {
        statement: "The focused intent admission tests pass with deterministic ordering and stable normalized AC ids.",
        verification: "test"
      }
    ],
    constraints: ["Do not touch execution, review repair, delivery, or Dogpile planning internals."],
    stopConditions: ["Stop after one bounded cosmetic admission repair loop is consumed."],
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
          reason: "Run the focused deterministic admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 120_000,
        maxRepairLoops: 1
      }
    }
  };
}

function clearFeatureAddDraft(): IntentDraft {
  return {
    draftId: "draft_feature_add_cli_flag",
    title: "Add draft import CLI flag",
    problem:
      "Operators need a new CLI flag that accepts draft intent input and routes it through admission control before confirmation.",
    requester: "ouroboros-ac-80202",
    mode: "brownfield",
    goalArchetype: "feature-add",
    context:
      "Protostar already has a factory CLI and intent admission packages; this draft exercises the v0.0.1 feature-add policy row.",
    acceptanceCriteria: [
      {
        statement: "The CLI accepts a draft input path and routes it through admission before creating a confirmed intent.",
        verification: "test"
      },
      {
        statement: "The admission result reports the selected feature-add policy row when the request is evaluated.",
        verification: "evidence"
      }
    ],
    constraints: ["Keep changes inside the intent front door and policy admission surface."],
    stopConditions: [
      "Stop if feature-add admission remains unsupported or if the stub cap cannot be reported deterministically."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/policy",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run focused policy admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 120_000,
        maxRepairLoops: 1
      }
    }
  };
}

function clearRefactorDraft(): IntentDraft {
  return {
    draftId: "draft_refactor_policy_helpers",
    title: "Refactor policy admission helpers",
    problem:
      "The policy admission helpers need internal extraction and cleanup so future policy rows can be wired without changing operator-visible behavior.",
    requester: "ouroboros-ac-80203",
    mode: "brownfield",
    goalArchetype: "refactor",
    context:
      "Protostar already has feature-add and cosmetic-tweak admission paths; this draft exercises the v0.0.1 refactor policy row.",
    acceptanceCriteria: [
      {
        statement: "The refactor admission response reports the selected refactor policy row and its stub capability cap.",
        verification: "evidence"
      },
      {
        statement: "Refactor drafts remain unconfirmed while the refactor policy row is unsupported.",
        verification: "test"
      }
    ],
    constraints: ["Keep the work inside the intent-facing policy admission surface."],
    stopConditions: [
      "Stop if refactor admission remains unsupported or if the stub cap cannot be reported deterministically."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/policy",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run focused policy admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 120_000,
        maxRepairLoops: 1
      }
    }
  };
}

function clearBugfixDraft(): IntentDraft {
  return {
    draftId: "draft_bugfix_policy_admission",
    title: "Fix bugfix policy admission path",
    problem:
      "The bugfix policy row exists in the policy table, but operators need deterministic admission to report that bugfix is still unsupported with a stub capability cap.",
    requester: "ouroboros-ac-80204",
    mode: "brownfield",
    goalArchetype: "bugfix",
    context:
      "Protostar already has unsupported feature-add and refactor admission paths; this draft exercises the v0.0.1 bugfix policy row.",
    acceptanceCriteria: [
      {
        statement: "The bugfix admission response reports the selected bugfix policy row and its stub capability cap.",
        verification: "evidence"
      },
      {
        statement: "Bugfix drafts remain unconfirmed while the bugfix policy row is unsupported.",
        verification: "test"
      }
    ],
    constraints: ["Keep the work inside the intent-facing policy admission surface."],
    stopConditions: [
      "Stop if bugfix admission remains unsupported or if the stub cap cannot be reported deterministically."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/policy",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run focused policy admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 120_000,
        maxRepairLoops: 1
      }
    }
  };
}

function malformedCosmeticDraft(): IntentDraft {
  const draft = clearCosmeticDraft();

  return {
    ...draft,
    title: 42 as never,
    stopConditions: ["Stop if node:test verification fails."],
    acceptanceCriteria: [
      {
        statement: "Every acceptance criterion chooses exactly one admission verification mode.",
        verification: "review" as never
      }
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "",
          access: "admin" as never
        }
      ],
      toolPermissions: [
        {
          tool: "",
          reason: "Exercise malformed field reporting.",
          risk: "critical" as never
        }
      ],
      budget: {
        timeoutMs: -1
      }
    }
  };
}
