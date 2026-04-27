import type { CapabilityEnvelope } from "@protostar/intent";

import type { BudgetUnit } from "../authorized-ops/budget-op.js";
import type { BoundaryBudgetTracker } from "./tracker.js";

export interface CentralBudgetAggregator {
  register(tracker: BoundaryBudgetTracker): void;
  total(): BudgetUnit;
  withinEnvelope(envelope: CapabilityEnvelope): boolean;
}
