import {
  assertConfirmedIntent,
  assertIntentAmbiguityAccepted,
  assessConfirmedIntentAmbiguity,
  type ConfirmedIntent,
  type IntentAmbiguityAssessment,
  type IntentAmbiguityMode
} from "@protostar/intent";
import type { PromoteIntentDraftResult } from "@protostar/policy";

export type ConfirmedIntentHandoffSource = "confirmed-intent-input" | "draft-admission-gate";

export interface ConfirmedIntentHandoff {
  readonly source: ConfirmedIntentHandoffSource;
  readonly intent: ConfirmedIntent;
  readonly ambiguityAssessment: IntentAmbiguityAssessment;
}

export interface CreateConfirmedIntentHandoffInput {
  readonly parsedIntentInput: unknown;
  readonly intentMode: IntentAmbiguityMode;
  readonly promotedIntent?: PromoteIntentDraftResult;
}

export function createConfirmedIntentHandoff(
  input: CreateConfirmedIntentHandoffInput
): ConfirmedIntentHandoff {
  if (input.promotedIntent !== undefined) {
    if (!input.promotedIntent.ok) {
      throw new Error("Cannot hand a failed IntentDraft admission result to downstream factory stages.");
    }

    return {
      source: "draft-admission-gate",
      intent: input.promotedIntent.intent,
      ambiguityAssessment: input.promotedIntent.ambiguityAssessment
    };
  }

  const intent = assertConfirmedIntent(input.parsedIntentInput);
  return {
    source: "confirmed-intent-input",
    intent,
    ambiguityAssessment: assertIntentAmbiguityAccepted(
      assessConfirmedIntentAmbiguity(intent, {
        mode: input.intentMode
      })
    )
  };
}
