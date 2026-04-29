import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCEPTANCE_CRITERION_ID_HASH_ALGORITHM,
  ACCEPTANCE_CRITERION_ID_HASH_LENGTH,
  ACCEPTANCE_CRITERION_TEXT_NORMALIZATION_RULES,
  ACCEPTANCE_CRITERION_VERIFICATION_MODES,
  createAcceptanceCriterionId,
  createAcceptanceCriterionIdHashInput,
  normalizeAcceptanceCriterionText,
  normalizeAcceptanceCriteria,
  parseConfirmedIntent,
  validateManualAcceptanceCriterionJustification,
  type NormalizeAcceptanceCriteriaDiagnostic,
  type NormalizedAcceptanceCriterion,
  type NormalizedAcceptanceCriteriaResult,
  type NormalizeAcceptanceCriteriaOutput
} from "./index.js";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

describe("normalizeAcceptanceCriteria", () => {
  it("exports the closed verification-mode set used by normalization", () => {
    assert.deepEqual(ACCEPTANCE_CRITERION_VERIFICATION_MODES, ["test", "evidence", "manual"]);
  });

  it("exports deterministic acceptance-criterion text normalization rules", () => {
    assert.deepEqual(
      ACCEPTANCE_CRITERION_TEXT_NORMALIZATION_RULES.map((rule) => rule.id),
      [
        "unicode-compatibility",
        "whitespace-to-ascii-space",
        "collapse-whitespace",
        "trim-boundary-whitespace",
        "empty-to-missing"
      ]
    );

    const raw = "\u00a0\u212b proof\r\n\tmust   render\uff01 ";
    assert.equal(normalizeAcceptanceCriterionText(raw), "\u00c5 proof must render!");
    assert.equal(normalizeAcceptanceCriterionText(" \n\t "), undefined);
    assert.equal(ACCEPTANCE_CRITERION_ID_HASH_ALGORITHM, "sha256");
    assert.equal(ACCEPTANCE_CRITERION_ID_HASH_LENGTH, 16);
    assert.equal(
      createAcceptanceCriterionIdHashInput(raw, 0),
      "{\"normalizedText\":\"\u00c5 proof must render!\",\"ordinalIndex\":0}"
    );
    assert.equal(
      createAcceptanceCriterionIdHashInput("\u00c5 proof must render!", 1),
      "{\"normalizedText\":\"\u00c5 proof must render!\",\"ordinalIndex\":1}"
    );
    assert.equal(createAcceptanceCriterionId(raw, 0), "ac_c66ba905bfb60924");
    assert.equal(createAcceptanceCriterionId("\u00c5 proof must render!", 1), "ac_a3debfe45433bffd");
    assert.equal(
      createAcceptanceCriterionId(raw, 0),
      createAcceptanceCriterionId("\u00c5 proof must render!", 0)
    );
    assert.notEqual(
      createAcceptanceCriterionId("\u00c5 proof must render!", 0),
      createAcceptanceCriterionId("\u00c5 proof must render!", 1)
    );
  });

  it("exports deterministic normalization with stable ordinal-sensitive ids", () => {
    const criteria = [
      {
        text: "  The   UI copy\nis updated in the bounded settings view. ",
        verification: "evidence" as const
      },
      {
        statement: "The UI copy is updated in the bounded settings view.",
        verification: "test" as const
      },
      {
        statement: "Manual verification records the operator-visible before and after copy.",
        verification: "manual" as const,
        justification: "  The operator must compare the rendered production text. "
      }
    ];

    const first = normalizeAcceptanceCriteria(criteria);
    const second = normalizeAcceptanceCriteria(criteria);

    assertNormalizedContract(first);
    assert.equal(first.ok, true);
    assert.deepEqual(
      first.diagnostics.map(({ code, severity, fieldPath, index, criterionId, message }) => ({
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
          criterionId: createAcceptanceCriterionId("The UI copy is updated in the bounded settings view.", 1),
          message: "acceptanceCriteria.1.statement duplicates acceptanceCriteria.0.statement after normalization."
        }
      ]
    );
    assert.deepEqual(second, first);
    assert.deepEqual(first.errors, []);
    assert.deepEqual(
      first.acceptanceCriteria.map((criterion) => criterion.statement),
      [
        "The UI copy is updated in the bounded settings view.",
        "Manual verification records the operator-visible before and after copy."
      ]
    );
    assert.notEqual(first.acceptanceCriteria[0]?.id, first.acceptanceCriteria[1]?.id);
    assert.equal("justification" in first.acceptanceCriteria[0]!, false);
    assert.equal(first.acceptanceCriteria[1]?.justification, "The operator must compare the rendered production text.");
  });

  it("flags acceptance criteria that become empty after deterministic normalization", () => {
    const result = normalizeAcceptanceCriteria([
      {
        statement: " \n\t\u00a0 ",
        verification: "test"
      },
      {
        text: " \u2003 ",
        verification: "evidence"
      },
      {
        verification: "manual",
        justification: "Manual review is still explicit, but the statement is absent."
      }
    ]);

    assert.equal(result.ok, false);
    assert.deepEqual(result.acceptanceCriteria, []);
    assert.deepEqual(result.errors, [
      "acceptanceCriteria.0.statement is empty after normalization.",
      "acceptanceCriteria.1.statement is empty after normalization.",
      "acceptanceCriteria.2.statement must be provided."
    ]);
    assert.deepEqual(
      result.diagnostics.map(({ code, fieldPath, index, message, normalizationRuleId }) => ({
        code,
        fieldPath,
        index,
        message,
        normalizationRuleId
      })),
      [
        {
          code: "empty-after-normalization",
          fieldPath: "acceptanceCriteria.0.statement",
          index: 0,
          message: "acceptanceCriteria.0.statement is empty after normalization.",
          normalizationRuleId: "empty-to-missing"
        },
        {
          code: "empty-after-normalization",
          fieldPath: "acceptanceCriteria.1.statement",
          index: 1,
          message: "acceptanceCriteria.1.statement is empty after normalization.",
          normalizationRuleId: "empty-to-missing"
        },
        {
          code: "missing-statement",
          fieldPath: "acceptanceCriteria.2.statement",
          index: 2,
          message: "acceptanceCriteria.2.statement must be provided.",
          normalizationRuleId: undefined
        }
      ]
    );
  });

  it("dedupes duplicate AC text while flagging duplicate normalized values", () => {
    const result = normalizeAcceptanceCriteria([
      {
        statement: "  The same observable outcome is preserved for the first ordered criterion.\n",
        verification: "evidence"
      },
      {
        text: "The same observable   outcome is preserved for the first ordered criterion.",
        verification: "manual"
      }
    ]);

    assert.equal(result.acceptanceCriteria.length, 1);
    assert.equal(result.ok, true);
    assert.equal(result.acceptanceCriteria[0]?.weak, false);
    assert.equal(Object.hasOwn(result.acceptanceCriteria[0]!, "justification"), false);
    assert.deepEqual(result.weakAcceptanceCriteria, []);
    assert.deepEqual(
      result.diagnostics.map(({ code, severity, fieldPath, index, criterionId, message }) => ({
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
          criterionId: createAcceptanceCriterionId(
            "The same observable outcome is preserved for the first ordered criterion.",
            1
          ),
          message: "acceptanceCriteria.1.statement duplicates acceptanceCriteria.0.statement after normalization."
        }
      ]
    );
  });

  it("treats missing, blank, and invalid manual justifications as manual-unjustified", () => {
    assert.deepEqual(validateManualAcceptanceCriterionJustification(undefined), {
      justified: false,
      manualUnjustified: true,
      invalidReason: "missing"
    });
    assert.deepEqual(validateManualAcceptanceCriterionJustification(" \n\t "), {
      justified: false,
      manualUnjustified: true,
      invalidReason: "blank"
    });
    assert.deepEqual(validateManualAcceptanceCriterionJustification({ reason: "operator review" }), {
      justified: false,
      manualUnjustified: true,
      invalidReason: "invalid"
    });
    assert.deepEqual(validateManualAcceptanceCriterionJustification("  Inspect the rendered operator report. "), {
      justified: true,
      manualUnjustified: false,
      normalizedJustification: "Inspect the rendered operator report."
    });

    const result = normalizeAcceptanceCriteria([
      {
        statement: "The operator records the manually inspected admission report.",
        verification: "manual"
      },
      {
        statement: "The operator records the manually inspected release report.",
        verification: "manual",
        justification: " \n\t "
      },
      {
        statement: "The operator records the manually inspected policy report.",
        verification: "manual",
        justification: { reason: "operator review" } as never
      },
      {
        statement: "The operator records the manually inspected artifact report.",
        verification: "manual",
        justification: "  Inspect the rendered operator report. "
      }
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      result.acceptanceCriteria.map((criterion) => ({
        statement: criterion.statement,
        verification: criterion.verification,
        justification: criterion.justification,
        weak: criterion.weak
      })),
      [
        {
          statement: "The operator records the manually inspected admission report.",
          verification: "manual",
          justification: "",
          weak: true
        },
        {
          statement: "The operator records the manually inspected release report.",
          verification: "manual",
          justification: "",
          weak: true
        },
        {
          statement: "The operator records the manually inspected policy report.",
          verification: "manual",
          justification: "",
          weak: true
        },
        {
          statement: "The operator records the manually inspected artifact report.",
          verification: "manual",
          justification: "Inspect the rendered operator report.",
          weak: false
        }
      ]
    );
    assert.deepEqual(
      result.weakAcceptanceCriteria.map(({ index, fieldPath, reason }) => ({ index, fieldPath, reason })),
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
  });

  it("returns typed diagnostics for malformed AC entries without losing legacy error strings", () => {
    const result: NormalizedAcceptanceCriteriaResult = normalizeAcceptanceCriteria([
      {
        statement: "   ",
        verification: "test"
      },
      {
        statement: "Every acceptance criterion chooses one closed verification mode.",
        verification: "review" as never
      },
      {
        statement: "Manual verification records the observed release checklist.",
        verification: "manual"
      }
    ]);

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [
      "acceptanceCriteria.0.statement is empty after normalization.",
      "acceptanceCriteria.1.verification must be test, evidence, or manual."
    ]);

    const diagnostics: readonly NormalizeAcceptanceCriteriaDiagnostic[] = result.diagnostics;
    assert.deepEqual(
      diagnostics.map(({ code, severity, fieldPath, index, message }) => ({
        code,
        severity,
        fieldPath,
        index,
        message
      })),
      [
        {
          code: "empty-after-normalization",
          severity: "error",
          fieldPath: "acceptanceCriteria.0.statement",
          index: 0,
          message: "acceptanceCriteria.0.statement is empty after normalization."
        },
        {
          code: "invalid-verification-mode",
          severity: "error",
          fieldPath: "acceptanceCriteria.1.verification",
          index: 1,
          message: "acceptanceCriteria.1.verification must be test, evidence, or manual."
        },
        {
          code: "manual-without-justification",
          severity: "weak",
          fieldPath: "acceptanceCriteria.2.justification",
          index: 2,
          message: "acceptanceCriteria.2.justification is required when verification is manual."
        }
      ]
    );

    assert.equal(result.acceptanceCriteria.length, 1);
    assert.equal(result.acceptanceCriteria[0]?.weak, true);
    assert.equal(result.acceptanceCriteria[0]?.justification, "");
  });

  it("carries manual justification through confirmed-intent parsing without requiring it for non-manual ACs", () => {
    const confirmedIntent = buildConfirmedIntentForTest({
      // Phase 3 Plan 03 hard-bumped confirmed-intent artifacts; Phase 7 Plan 01 bumps to 1.5.0 (delivery.target + deliveryWallClockMs).
      schemaVersion: "1.6.0",
      signature: null,
      id: "intent_manual_ac_justification",
      sourceDraftId: "draft_manual_ac_justification",
      mode: "brownfield",
      goalArchetype: "cosmetic-tweak",
      title: "Carry manual AC justification",
      problem: "Manual acceptance criteria need explicit operator evidence without adding requirements to test and evidence modes.",
      requester: "ouroboros-ac-50301",
      confirmedAt: "2026-04-25T00:00:00.000Z",
      context: "The change is limited to confirmed-intent parsing of acceptance criterion justifications.",
      acceptanceCriteria: [
        {
          id: "ac_manual_observation",
          statement: "The operator records the visual comparison used for manual verification.",
          verification: "manual",
          justification: "  The outcome depends on inspecting rendered copy in the target UI. "
        },
        {
          id: "ac_test_still_no_justification",
          statement: "Automated tests pass without requiring a manual justification field.",
          verification: "test"
        }
      ],
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
            reason: "Verify the acceptance-criteria contract.",
            risk: "low"
          }
        ],
        workspace: {
          allowDirty: false
        },
        network: {
          allow: "loopback"
        },
        mechanical: { allowed: ["verify", "lint"] },
        budget: {
          adapterRetriesPerTask: 4,
          timeoutMs: 30_000,
          taskWallClockMs: 180_000,
          maxRepairLoops: 3
        }
      },
      constraints: ["Scope limited to acceptance-criteria normalization and confirmed-intent contracts."],
      stopConditions: ["Stop if confirmed-intent parsing drops admission metadata."]
    });

    assert.equal(
      confirmedIntent.acceptanceCriteria[0]?.justification,
      "The outcome depends on inspecting rendered copy in the target UI."
    );
    assert.equal("justification" in confirmedIntent.acceptanceCriteria[1]!, false);

    const parsed = parseConfirmedIntent({
      ...confirmedIntent,
      acceptanceCriteria: [
        {
          id: "ac_manual_observation",
          statement: "The operator records the visual comparison used for manual verification.",
          verification: "manual",
          justification: "  The outcome depends on inspecting rendered copy in the target UI. "
        },
        {
          id: "ac_evidence_still_no_justification",
          statement: "Evidence verification remains valid without manual justification.",
          verification: "evidence"
        }
      ]
    });

    assert.equal(parsed.ok, true);
    assert.equal(
      (parsed.ok ? parsed.data : undefined)?.acceptanceCriteria[0]?.justification,
      "The outcome depends on inspecting rendered copy in the target UI."
    );
    assert.equal(parsed.ok ? "justification" in parsed.data.acceptanceCriteria[1]! : false, false);
    assert.equal((parsed.ok ? parsed.data : undefined)?.sourceDraftId, "draft_manual_ac_justification");
    assert.equal((parsed.ok ? parsed.data : undefined)?.mode, "brownfield");
    assert.equal((parsed.ok ? parsed.data : undefined)?.goalArchetype, "cosmetic-tweak");
    assert.equal(
      (parsed.ok ? parsed.data : undefined)?.context,
      "The change is limited to confirmed-intent parsing of acceptance criterion justifications."
    );
    assert.deepEqual((parsed.ok ? parsed.data : undefined)?.stopConditions, [
      "Stop if confirmed-intent parsing drops admission metadata."
    ]);

    const rejected = parseConfirmedIntent({
      ...confirmedIntent,
      acceptanceCriteria: [
        {
          id: "ac_manual_missing_justification",
          statement: "Manual verification must name the operator evidence.",
          verification: "manual"
        }
      ]
    });

    assert.equal(rejected.ok, false);
    assert.ok(
      rejected.errors.includes("acceptanceCriteria[0].justification is required when verification is manual."),
      rejected.errors.join("; ")
    );
  });

  it("requires exactly one closed verification mode per acceptance criterion", () => {
    const result = normalizeAcceptanceCriteria([
      {
        statement: "Missing verification mode is rejected before admission."
      },
      {
        statement: "Invalid verification mode is rejected before admission.",
        verification: "review" as never
      },
      {
        statement: "Multiple verification modes are rejected before admission.",
        verification: ["test", "evidence"]
      },
      {
        statement: "Duplicate mode fields are rejected even when the values match.",
        verification: "test",
        mode: "test"
      }
    ]);

    assert.equal(result.ok, false);
    assert.deepEqual(result.acceptanceCriteria, []);
    assert.deepEqual(result.errors, [
      "acceptanceCriteria.0.verification must choose exactly one mode: test, evidence, or manual.",
      "acceptanceCriteria.1.verification must be test, evidence, or manual.",
      "acceptanceCriteria.2.verification must choose exactly one verification mode; received 2.",
      "acceptanceCriteria.3.verification must choose exactly one verification mode; received 2."
    ]);
    assert.deepEqual(
      result.diagnostics.map(({ code, severity, fieldPath, index, message }) => ({
        code,
        severity,
        fieldPath,
        index,
        message
      })),
      [
        {
          code: "missing-verification-mode",
          severity: "error",
          fieldPath: "acceptanceCriteria.0.verification",
          index: 0,
          message: "acceptanceCriteria.0.verification must choose exactly one mode: test, evidence, or manual."
        },
        {
          code: "invalid-verification-mode",
          severity: "error",
          fieldPath: "acceptanceCriteria.1.verification",
          index: 1,
          message: "acceptanceCriteria.1.verification must be test, evidence, or manual."
        },
        {
          code: "multiple-verification-modes",
          severity: "error",
          fieldPath: "acceptanceCriteria.2.verification",
          index: 2,
          message: "acceptanceCriteria.2.verification must choose exactly one verification mode; received 2."
        },
        {
          code: "multiple-verification-modes",
          severity: "error",
          fieldPath: "acceptanceCriteria.3.verification",
          index: 3,
          message: "acceptanceCriteria.3.verification must choose exactly one verification mode; received 2."
        }
      ]
    );
  });

  it("diagnoses a structurally missing AC list as a typed hard error", () => {
    const result = normalizeAcceptanceCriteria([]);

    assert.equal(result.ok, false);
    assert.deepEqual(result.acceptanceCriteria, []);
    assert.deepEqual(result.weakAcceptanceCriteria, []);
    assert.deepEqual(result.errors, ["acceptanceCriteria must contain at least one entry."]);
    assert.deepEqual(result.diagnostics, [
      {
        code: "missing-acceptance-criteria",
        severity: "error",
        fieldPath: "acceptanceCriteria",
        message: "acceptanceCriteria must contain at least one entry."
      }
    ]);
  });
});

function assertNormalizedContract(output: NormalizeAcceptanceCriteriaOutput): void {
  const firstCriterion: NormalizedAcceptanceCriterion | undefined = output.acceptanceCriteria[0];
  assert.ok(firstCriterion);
  assert.ok(firstCriterion.id.startsWith("ac_"));
  assert.equal(typeof firstCriterion.statement, "string");
}
