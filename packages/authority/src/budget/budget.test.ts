import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildAuthorizedBudgetOpForTest } from "../internal/test-builders.js";

import type { CapabilityEnvelope } from "@protostar/intent";
import type { AuthorizedBudgetOp } from "../authorized-ops/budget-op.js";
import type { CentralBudgetAggregator } from "./aggregator.js";
import type { BoundaryBudgetTracker } from "./tracker.js";

class InMemoryTracker implements BoundaryBudgetTracker {
  readonly boundary = "subprocess" as const;
  #total = 0;

  record(op: AuthorizedBudgetOp): void {
    this.#total += op.amount;
  }

  total(): number {
    return this.#total;
  }
}

class InMemoryAggregator implements CentralBudgetAggregator {
  readonly #trackers: BoundaryBudgetTracker[] = [];

  register(tracker: BoundaryBudgetTracker): void {
    this.#trackers.push(tracker);
  }

  total(): number {
    return this.#trackers.reduce((sum, tracker) => sum + tracker.total(), 0);
  }

  withinEnvelope(envelope: CapabilityEnvelope): boolean {
    const maxTokens = envelope.budget.maxTokens;
    return maxTokens === undefined || this.total() <= maxTokens;
  }
}

describe("budget tracker contract", () => {
  it("records authorized ops and returns running totals through an aggregator", () => {
    const tracker = new InMemoryTracker();
    tracker.record(buildAuthorizedBudgetOpForTest({ amount: 5 }));
    tracker.record(buildAuthorizedBudgetOpForTest({ amount: 3 }));

    const aggregator = new InMemoryAggregator();
    aggregator.register(tracker);

    assert.equal(tracker.total(), 8);
    assert.equal(aggregator.total(), 8);
    assert.equal(aggregator.withinEnvelope({ repoScopes: [], toolPermissions: [], budget: { maxTokens: 8 } }), true);
    assert.equal(aggregator.withinEnvelope({ repoScopes: [], toolPermissions: [], budget: { maxTokens: 7 } }), false);
  });
});
