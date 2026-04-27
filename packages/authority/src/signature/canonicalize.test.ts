import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { CanonicalizationError, canonicalizeJsonC14nV1 } from "./canonicalize.js";
import { resolveCanonicalizer } from "./canonical-form-registry.js";

describe("json-c14n@1.0 canonicalizer", () => {
  it("canonicalizes object keys independently of insertion order", () => {
    assert.equal(
      canonicalizeJsonC14nV1({ a: 1, b: 2 }),
      canonicalizeJsonC14nV1({ b: 2, a: 1 })
    );
  });

  it("emits a stable nested canonical string", () => {
    assert.equal(
      canonicalizeJsonC14nV1({ a: 1, b: [2, 3, { c: 4 }] }),
      "{\"a\":1,\"b\":[2,3,{\"c\":4}]}"
    );
  });

  it("rejects NaN", () => {
    assert.throws(() => canonicalizeJsonC14nV1(Number.NaN), CanonicalizationError);
  });

  it("rejects Infinity", () => {
    assert.throws(() => canonicalizeJsonC14nV1(Number.POSITIVE_INFINITY), CanonicalizationError);
  });

  it("rejects -Infinity", () => {
    assert.throws(() => canonicalizeJsonC14nV1(Number.NEGATIVE_INFINITY), CanonicalizationError);
  });

  it("rejects -0 before JSON serialization collapses it", () => {
    assert.throws(() => canonicalizeJsonC14nV1(-0), CanonicalizationError);
  });

  it("rejects undefined at the root", () => {
    assert.throws(() => canonicalizeJsonC14nV1(undefined), CanonicalizationError);
  });

  it("rejects undefined object properties", () => {
    assert.throws(() => canonicalizeJsonC14nV1({ a: undefined }), CanonicalizationError);
  });

  it("rejects BigInt values", () => {
    assert.throws(() => canonicalizeJsonC14nV1({ a: 1n }), CanonicalizationError);
  });

  it("rejects Date values", () => {
    assert.throws(() => canonicalizeJsonC14nV1(new Date()), CanonicalizationError);
  });

  it("rejects RegExp values", () => {
    assert.throws(() => canonicalizeJsonC14nV1(/foo/), CanonicalizationError);
  });

  it("rejects Map values", () => {
    assert.throws(() => canonicalizeJsonC14nV1(new Map([["a", 1]])), CanonicalizationError);
  });

  it("rejects Symbol keys", () => {
    assert.throws(() => canonicalizeJsonC14nV1({ [Symbol("k")]: 1 }), CanonicalizationError);
  });

  it("resolves json-c14n@1.0 through the canonical form registry", () => {
    assert.equal(resolveCanonicalizer("json-c14n@1.0"), canonicalizeJsonC14nV1);
  });

  it("rejects json-c14n@2.0 as an unknown canonical form", () => {
    assert.equal(resolveCanonicalizer("json-c14n@2.0"), null);
  });

  it("rejects rfc8785@1.0 as an unknown canonical form", () => {
    assert.equal(resolveCanonicalizer("rfc8785@1.0"), null);
  });
});
