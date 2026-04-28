export type ReviewLifecycleEvent =
  | {
      readonly kind: "review-iteration-started";
      readonly runId: string;
      readonly attempt: number;
      readonly at: string;
    }
  | {
      readonly kind: "mechanical-verdict";
      readonly runId: string;
      readonly attempt: number;
      readonly verdict: "pass" | "repair" | "block";
      readonly findingsCount: number;
      readonly at: string;
    }
  | {
      readonly kind: "model-verdict";
      readonly runId: string;
      readonly attempt: number;
      readonly verdict: "pass" | "repair" | "block";
      readonly judgeIds: readonly string[];
      readonly at: string;
    }
  | {
      readonly kind: "repair-plan-emitted";
      readonly runId: string;
      readonly attempt: number;
      readonly repairTaskIds: readonly string[];
      readonly at: string;
    }
  | {
      readonly kind: "loop-approved";
      readonly runId: string;
      readonly finalAttempt: number;
      readonly decisionUri: string;
      readonly at: string;
    }
  | {
      readonly kind: "loop-blocked";
      readonly runId: string;
      readonly reason: "budget-exhausted" | "critical-finding" | "mechanical-block" | "model-block";
      readonly finalAttempt: number;
      readonly blockUri: string;
      readonly at: string;
    }
  | {
      readonly kind: "loop-budget-exhausted";
      readonly runId: string;
      readonly attempted: number;
      readonly blockUri: string;
      readonly at: string;
    };
