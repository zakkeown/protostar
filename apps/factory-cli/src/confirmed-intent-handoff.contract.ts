import type { ConfirmedIntent, IntentDraft } from "@protostar/intent";

import type { ConfirmedIntentHandoff } from "./confirmed-intent-handoff.js";

type Assert<Condition extends true> = Condition;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

export type SampleCompositionHandoffCarriesConfirmedIntent = Assert<
  IsAssignable<ConfirmedIntent, ConfirmedIntentHandoff["intent"]>
>;

export type SampleCompositionHandoffRejectsIntentDraft = Assert<
  IsAssignable<IntentDraft, ConfirmedIntentHandoff["intent"]> extends false ? true : false
>;
