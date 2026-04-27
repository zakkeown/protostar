import type { CapabilityEnvelope } from "@protostar/intent";

import { hasNetworkGrant } from "./grant-checks.js";

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
  let parsedUrl: URL | undefined;

  try {
    parsedUrl = new URL(input.url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      errors.push(`network url "${input.url}" must use http or https`);
    }
  } catch {
    errors.push(`network url "${input.url}" must be parseable`);
  }

  if (parsedUrl !== undefined) {
    const networkAllow = input.resolvedEnvelope.network?.allow;
    if (networkAllow === undefined) {
      errors.push("resolvedEnvelope.network.allow is required for network operations");
    } else if (networkAllow === "none") {
      errors.push("resolvedEnvelope.network.allow refuses all network operations");
    } else if (networkAllow === "loopback") {
      const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
      const hostname = parsedUrl.hostname.replace(/^\[(.*)\]$/, "$1");
      if (!loopbackHosts.has(hostname)) {
        errors.push(
          `resolvedEnvelope.network.allow loopback only permits localhost, 127.0.0.1, or ::1; got "${hostname}"`
        );
      }
    } else if (networkAllow === "allowlist") {
      const allowedHosts = input.resolvedEnvelope.network?.allowedHosts ?? [];
      if (!allowedHosts.includes(parsedUrl.hostname)) {
        errors.push(
          `resolvedEnvelope.network.allow allowlist does not include host "${parsedUrl.hostname}"`
        );
      }
    }
  }

  if (!hasNetworkGrant(input.resolvedEnvelope)) {
    errors.push(`toolPermissions network grant required; check toolPermissions network in resolvedEnvelope`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedNetworkOp(input), errors: [] };
}

export type AuthorizedNetworkOpBrandWitness = AuthorizedNetworkOp;
