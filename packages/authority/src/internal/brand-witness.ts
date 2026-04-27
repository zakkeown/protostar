import type { AuthorizedBudgetOp } from "../authorized-ops/budget-op.js";
import type { AuthorizedNetworkOp } from "../authorized-ops/network-op.js";
import type { AuthorizedSubprocessOp } from "../authorized-ops/subprocess-op.js";
import type { AuthorizedWorkspaceOp } from "../authorized-ops/workspace-op.js";
import type { PrecedenceDecision } from "../precedence/precedence-decision.js";

export type AuthorizedWorkspaceOpBrandWitness = AuthorizedWorkspaceOp;
export type AuthorizedSubprocessOpBrandWitness = AuthorizedSubprocessOp;
export type AuthorizedNetworkOpBrandWitness = AuthorizedNetworkOp;
export type AuthorizedBudgetOpBrandWitness = AuthorizedBudgetOp;
export type PrecedenceDecisionBrandWitness = PrecedenceDecision;
