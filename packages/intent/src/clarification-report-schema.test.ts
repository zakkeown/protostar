import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLARIFICATION_REPORT_ARTIFACT_NAME,
  CLARIFICATION_REPORT_JSON_SCHEMA,
  CLARIFICATION_REPORT_SCHEMA,
  CLARIFICATION_REPORT_SCHEMA_VERSION,
  createClarificationQuestionKey,
  createClarificationReport,
  type IntentDraft
} from "./index.js";

describe("clarification-report.json schema", () => {
  it("defines the deterministic clarification report artifact contract", () => {
    assert.equal(CLARIFICATION_REPORT_SCHEMA, CLARIFICATION_REPORT_JSON_SCHEMA);
    assert.equal(CLARIFICATION_REPORT_JSON_SCHEMA.$id, "https://protostar.dev/schemas/clarification-report.json");
    assert.equal(CLARIFICATION_REPORT_JSON_SCHEMA.properties.schemaVersion.const, CLARIFICATION_REPORT_SCHEMA_VERSION);
    assert.equal(CLARIFICATION_REPORT_JSON_SCHEMA.properties.artifact.const, CLARIFICATION_REPORT_ARTIFACT_NAME);
    assert.deepEqual(CLARIFICATION_REPORT_JSON_SCHEMA.properties.mode.enum, ["greenfield", "brownfield"]);
    assert.deepEqual(CLARIFICATION_REPORT_JSON_SCHEMA.properties.status.enum, ["clear", "needs-clarification"]);
    assert.deepEqual(CLARIFICATION_REPORT_JSON_SCHEMA.required, [
      "schemaVersion",
      "artifact",
      "mode",
      "status",
      "summary",
      "missingFields",
      "questions",
      "requiredClarifications",
      "unresolvedQuestions"
    ]);
    assert.deepEqual(CLARIFICATION_REPORT_JSON_SCHEMA.$defs.unresolvedQuestion.required, [
      "questionId",
      "questionKey",
      "fieldPath",
      "category",
      "prompt",
      "rationale",
      "required",
      "source"
    ]);
    assert.deepEqual(CLARIFICATION_REPORT_JSON_SCHEMA.$defs.unresolvedQuestion.properties.source.enum, [
      "required-field-detection",
      "ambiguity-signal"
    ]);
  });

  it("builds deterministic unresolved-question reports from clarification output", () => {
    const draft = {
      draftId: "draft_clarification_report_schema"
    } satisfies IntentDraft;

    const first = createClarificationReport({
      draft,
      mode: "brownfield"
    });
    const second = createClarificationReport({
      draft,
      mode: "brownfield"
    });

    assert.deepEqual(second, first);
    assert.equal(first.schemaVersion, CLARIFICATION_REPORT_SCHEMA_VERSION);
    assert.equal(first.artifact, CLARIFICATION_REPORT_ARTIFACT_NAME);
    assert.equal(first.draftId, draft.draftId);
    assert.equal(first.mode, "brownfield");
    assert.equal(first.status, "needs-clarification");
    assert.equal(Object.hasOwn(first, "generatedAt"), false);
    assert.equal(first.summary.questionCount, first.questions.length);
    assert.equal(first.summary.requiredClarificationCount, first.requiredClarifications.length);
    assert.equal(first.summary.unresolvedQuestionCount, first.unresolvedQuestions.length);
    assert.equal(first.summary.missingFieldCount, first.missingFields.length);
    assert.equal(first.unresolvedQuestions.length, first.questions.length);
    assert.ok(
      first.unresolvedQuestions.some(
        (question) =>
          question.questionKey === createClarificationQuestionKey("title") &&
          question.required &&
          question.source === "required-field-detection"
      )
    );
    assert.ok(
      first.unresolvedQuestions.every((question) =>
        first.questions.some((sourceQuestion) => sourceQuestion.id === question.questionId)
      )
    );
  });
});
