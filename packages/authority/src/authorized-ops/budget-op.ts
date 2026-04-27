import type { CapabilityEnvelope } from "@protostar/intent";

declare const AuthorizedBudgetOpBrand: unique symbol;

export type BudgetUnit = number;

export type BudgetBoundaryName = "subprocess" | "network" | "judge-panel";

export interface AuthorizedBudgetOpData {
  readonly boundary: BudgetBoundaryName;
  readonly amount: BudgetUnit;
  readonly resolvedEnvelope: CapabilityEnvelope;
}

export type AuthorizedBudgetOp = AuthorizedBudgetOpData & {
  readonly [AuthorizedBudgetOpBrand]: true;
};

function mintAuthorizedBudgetOp(data: AuthorizedBudgetOpData): AuthorizedBudgetOp {
  return Object.freeze({ ...data }) as AuthorizedBudgetOp;
}

export type AuthorizeBudgetOpResult =
  | { readonly ok: true; readonly authorized: AuthorizedBudgetOp; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function authorizeBudgetOp(input: AuthorizedBudgetOpData): AuthorizeBudgetOpResult {
  const errors: string[] = [];

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    errors.push(`budget amount ${input.amount} must be finite and non-negative`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedBudgetOp(input), errors: [] };
}

export type AuthorizedBudgetOpBrandWitness = AuthorizedBudgetOp;

export { mintAuthorizedBudgetOp };
