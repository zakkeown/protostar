import { mintConfirmedIntent, type ConfirmedIntent, type ConfirmedIntentMintInput, type SignatureEnvelope } from "./confirmed-intent.js";

export interface PromoteAndSignIntentInput extends ConfirmedIntentMintInput {
  readonly signature: SignatureEnvelope;
}

export type PromoteAndSignIntentResult =
  | { readonly ok: true; readonly intent: ConfirmedIntent; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function promoteAndSignIntent(input: PromoteAndSignIntentInput): PromoteAndSignIntentResult {
  try {
    return {
      ok: true,
      intent: mintConfirmedIntent({
        ...input,
        signature: input.signature
      }),
      errors: []
    };
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}
