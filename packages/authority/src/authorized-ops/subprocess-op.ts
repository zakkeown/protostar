import type { CapabilityEnvelope } from "@protostar/intent";

declare const AuthorizedSubprocessOpBrand: unique symbol;

export interface AuthorizedSubprocessOpData {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly resolvedEnvelope: CapabilityEnvelope;
}

export type AuthorizedSubprocessOp = AuthorizedSubprocessOpData & {
  readonly [AuthorizedSubprocessOpBrand]: true;
};

function mintAuthorizedSubprocessOp(data: AuthorizedSubprocessOpData): AuthorizedSubprocessOp {
  return Object.freeze({
    ...data,
    args: Object.freeze([...data.args])
  }) as AuthorizedSubprocessOp;
}

export type AuthorizeSubprocessOpResult =
  | { readonly ok: true; readonly authorized: AuthorizedSubprocessOp; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function authorizeSubprocessOp(input: AuthorizedSubprocessOpData): AuthorizeSubprocessOpResult {
  const errors: string[] = [];

  if (input.command.includes(" ") || /[;&|`$<>]/.test(input.command)) {
    errors.push(`subprocess command "${input.command}" must not contain shell metacharacters`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedSubprocessOp(input), errors: [] };
}

export type AuthorizedSubprocessOpBrandWitness = AuthorizedSubprocessOp;

export { mintAuthorizedSubprocessOp };
