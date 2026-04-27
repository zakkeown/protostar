import type { AuthorizedBudgetOp, BudgetBoundaryName, BudgetUnit } from "../authorized-ops/budget-op.js";

export type BoundaryName = BudgetBoundaryName;

export interface BoundaryBudgetTracker {
  readonly boundary: BoundaryName;
  record(op: AuthorizedBudgetOp): void;
  total(): BudgetUnit;
}
