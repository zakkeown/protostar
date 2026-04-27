import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

describe("clarification-report.schema.json file validates emitted reports", () => {
  it("loads the shipped schema file and accepts a freshly emitted report", async () => {
    const schemaPath = fileURLToPath(new URL("../schema/clarification-report.schema.json", import.meta.url));
    const schemaText = await readFile(schemaPath, "utf8");
    const schema = JSON.parse(schemaText) as Record<string, unknown>;

    assert.equal(schema["$schema"], "https://json-schema.org/draft/2020-12/schema");
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;
    assert.equal(properties["schemaVersion"]?.["const"], CLARIFICATION_REPORT_SCHEMA_VERSION);
    assert.equal(properties["schemaVersion"]?.["const"], "1.0.0");

    const draft = { draftId: "draft_clarification_report_schema_file" } satisfies IntentDraft;
    const report = createClarificationReport({ draft, mode: "brownfield" });
    assert.equal(report.schemaVersion, "1.0.0");

    validateAgainstSchema(report as unknown as Record<string, unknown>, schema, schema, "report");
  });
});

function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  pathLabel: string
): void {
  const ref = schema["$ref"];
  if (typeof ref === "string" && ref.startsWith("#/")) {
    const segments = ref.slice(2).split("/");
    let resolved: unknown = rootSchema;
    for (const seg of segments) {
      if (resolved && typeof resolved === "object") {
        resolved = (resolved as Record<string, unknown>)[seg];
      }
    }
    if (resolved && typeof resolved === "object") {
      validateAgainstSchema(value, resolved as Record<string, unknown>, rootSchema, pathLabel);
      return;
    }
  }
  const expectedType = schema["type"];
  if (typeof expectedType === "string") {
    assertJsonType(value, expectedType, pathLabel);
  }

  if ("const" in schema) {
    assert.deepEqual(value, schema["const"], `${pathLabel} const mismatch`);
  }

  if (Array.isArray(schema["enum"])) {
    assert.ok(
      (schema["enum"] as readonly unknown[]).some((candidate) => candidate === value),
      `${pathLabel} not in enum`
    );
  }

  if (expectedType === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const required = Array.isArray(schema["required"]) ? (schema["required"] as readonly string[]) : [];
    for (const key of required) {
      assert.ok(Object.hasOwn(record, key), `${pathLabel}.${key} required but missing`);
    }
    const properties = (schema["properties"] as Record<string, Record<string, unknown>> | undefined) ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (Object.hasOwn(record, key)) {
        validateAgainstSchema(record[key], propSchema, rootSchema, `${pathLabel}.${key}`);
      }
    }
  }

  if (expectedType === "array" && Array.isArray(value)) {
    const itemSchema = schema["items"] as Record<string, unknown> | undefined;
    if (itemSchema !== undefined) {
      value.forEach((item, index) => {
        validateAgainstSchema(item, itemSchema, rootSchema, `${pathLabel}[${index}]`);
      });
    }
  }
}

function assertJsonType(value: unknown, expectedType: string, pathLabel: string): void {
  switch (expectedType) {
    case "string":
      assert.equal(typeof value, "string", `${pathLabel} expected string`);
      return;
    case "integer":
      assert.equal(Number.isInteger(value), true, `${pathLabel} expected integer`);
      return;
    case "number":
      assert.equal(typeof value, "number", `${pathLabel} expected number`);
      return;
    case "boolean":
      assert.equal(typeof value, "boolean", `${pathLabel} expected boolean`);
      return;
    case "object":
      assert.equal(typeof value === "object" && value !== null && !Array.isArray(value), true, `${pathLabel} expected object`);
      return;
    case "array":
      assert.equal(Array.isArray(value), true, `${pathLabel} expected array`);
      return;
    case "null":
      assert.equal(value, null, `${pathLabel} expected null`);
      return;
  }
}
