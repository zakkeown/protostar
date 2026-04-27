import type {
  IntentAmbiguityAssessment,
  IntentAmbiguityMode
} from "@protostar/intent/ambiguity";
import type { ConfirmedIntent } from "@protostar/intent/confirmed-intent";
import type { PromoteIntentDraftResult } from "@protostar/intent/admission";

// Plan 06b Q-13c locks single-source handoff: the only way a ConfirmedIntent
// reaches the factory pipeline is via the IntentDraft admission gate.
export type ConfirmedIntentHandoffSource = "draft-admission-gate";

export interface ConfirmedIntentHandoff {
  readonly source: ConfirmedIntentHandoffSource;
  readonly intent: ConfirmedIntent;
  readonly ambiguityAssessment: IntentAmbiguityAssessment;
}

export interface CreateConfirmedIntentHandoffInput {
  readonly intentMode: IntentAmbiguityMode;
  readonly promotedIntent: PromoteIntentDraftResult;
}

export function createConfirmedIntentHandoff(
  input: CreateConfirmedIntentHandoffInput
): ConfirmedIntentHandoff {
  if (!input.promotedIntent.ok) {
    throw new Error("Cannot hand a failed IntentDraft admission result to downstream factory stages.");
  }

  // intentMode is preserved on the input for forward compat (Phase 2 will
  // re-attach mode to the assessment); today we forward the assessment
  // produced by promoteIntentDraft directly.
  void input.intentMode;

  return {
    source: "draft-admission-gate",
    intent: input.promotedIntent.intent,
    ambiguityAssessment: input.promotedIntent.ambiguityAssessment
  };
}
