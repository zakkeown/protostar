import * as AuthorityPublicApi from "@protostar/authority";
import type { PrecedenceDecisionBrandWitness } from "@protostar/authority/internal/brand-witness";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readAll, walkBarrels } from "./_helpers/barrel-walker.js";

type AuthoritySurface = typeof AuthorityPublicApi;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type ReturnsBrand<K extends keyof AuthoritySurface> =
  AuthoritySurface[K] extends (...args: never[]) => infer R
    ? Extract<R, PrecedenceDecisionBrandWitness> extends never
      ? Extract<R, { readonly precedence: PrecedenceDecisionBrandWitness }> extends never
        ? false
        : true
      : true
    : false;

type MintingKeys = {
  [K in keyof AuthoritySurface]: ReturnsBrand<K> extends true ? K : never;
}[keyof AuthoritySurface];

type _SurfacePinned = Assert<Equal<MintingKeys, "intersectEnvelopes">>;

type AuthorityKeys = keyof typeof AuthorityPublicApi;
type _NoMintExported = Assert<"mintPrecedenceDecision" extends AuthorityKeys ? false : true>;
type _NoBuilderExported = Assert<"buildPrecedenceDecisionForTest" extends AuthorityKeys ? false : true>;

void (undefined as unknown as _SurfacePinned | _NoMintExported | _NoBuilderExported);

const __dirname = dirname(fileURLToPath(import.meta.url));
const authoritySrcRoot = resolve(__dirname, "../../authority/src");
const authorityDistRoot = resolve(__dirname, "../../authority/dist");

describe("@protostar/authority - PrecedenceDecision mint surface", () => {
  it("public producer is intersectEnvelopes at runtime", () => {
    assert.equal(typeof AuthorityPublicApi.intersectEnvelopes, "function");
  });

  it("mintPrecedenceDecision is not on public barrels", async () => {
    for await (const barrelPath of walkPublicBarrels()) {
      const contents = await readAll(barrelPath);
      assert.equal(contents.includes("mintPrecedenceDecision"), false, `mint leaked at ${barrelPath}`);
    }
  });

  it("buildPrecedenceDecisionForTest is not on public barrels", async () => {
    for await (const barrelPath of walkPublicBarrels()) {
      const contents = await readAll(barrelPath);
      assert.equal(contents.includes("buildPrecedenceDecisionForTest"), false, `test builder leaked at ${barrelPath}`);
    }
  });
});

async function* walkPublicBarrels(): AsyncGenerator<string> {
  yield* walkBarrels(authoritySrcRoot);
  yield* walkBarrels(authorityDistRoot);
}
