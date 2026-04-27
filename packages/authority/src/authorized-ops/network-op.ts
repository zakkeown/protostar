import type { CapabilityEnvelope } from "@protostar/intent";

declare const AuthorizedNetworkOpBrand: unique symbol;

export type NetworkMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface AuthorizedNetworkOpData {
  readonly method: NetworkMethod;
  readonly url: string;
  readonly resolvedEnvelope: CapabilityEnvelope;
}

export type AuthorizedNetworkOp = AuthorizedNetworkOpData & {
  readonly [AuthorizedNetworkOpBrand]: true;
};

function mintAuthorizedNetworkOp(data: AuthorizedNetworkOpData): AuthorizedNetworkOp {
  return Object.freeze({ ...data }) as AuthorizedNetworkOp;
}

export type AuthorizeNetworkOpResult =
  | { readonly ok: true; readonly authorized: AuthorizedNetworkOp; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function authorizeNetworkOp(input: AuthorizedNetworkOpData): AuthorizeNetworkOpResult {
  const errors: string[] = [];

  try {
    const url = new URL(input.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push(`network url "${input.url}" must use http or https`);
    }
  } catch {
    errors.push(`network url "${input.url}" must be parseable`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedNetworkOp(input), errors: [] };
}

export type AuthorizedNetworkOpBrandWitness = AuthorizedNetworkOp;

export { mintAuthorizedNetworkOp };
