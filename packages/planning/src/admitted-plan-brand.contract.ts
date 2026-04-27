// Compile-time contract: AdmittedPlan carries a private brand that no foreign
// module can construct, AND a structural plain (non-branded) AdmittedPlanRecord
// exists for upstream callers (admitCandidatePlan result) so only
// assertAdmittedPlanHandoff produces the brand on the public surface.
//
// This file fails to typecheck until Task 1 (Plan 01-07) lands the brand.

import type { AdmittedPlan, AdmittedPlanRecord, CandidatePlan } from "./index.js";

type Assert<Condition extends true> = Condition;

// AdmittedPlan must NOT be assignable from its own structural shape
// (i.e. brand is load-bearing, not just a string discriminator).
type _AdmittedPlanRecordIsNotAdmittedPlan = Assert<
  AdmittedPlanRecord extends AdmittedPlan ? false : true
>;

// AdmittedPlanRecord remains assignable from CandidatePlan-like shapes? No —
// it still carries the admitted-plan state marker + capability envelope.
type _CandidatePlanIsNotAdmittedPlanRecord = Assert<
  CandidatePlan extends AdmittedPlanRecord ? false : true
>;

// AdmittedPlan extends AdmittedPlanRecord — branding is purely additive.
type _AdmittedPlanExtendsAdmittedPlanRecord = Assert<
  AdmittedPlan extends AdmittedPlanRecord ? true : false
>;
