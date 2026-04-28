import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BranchName, PrBody, PrTitle } from "./brands.js";

/**
 * Type-level contract: raw strings cannot satisfy the brand types.
 * Compilation success of `@ts-expect-error` lines is the test. If any line
 * compiles cleanly, TypeScript fails because the expected error was unused.
 */
declare function takesBranchName(branch: BranchName): void;
declare function takesPrTitle(title: PrTitle): void;
declare function takesPrBody(body: PrBody): void;

if (false) {
  // @ts-expect-error raw string cannot satisfy BranchName brand.
  takesBranchName("feature/foo");
  // @ts-expect-error raw string cannot satisfy PrTitle brand.
  takesPrTitle("My PR");
  // @ts-expect-error raw string cannot satisfy PrBody brand.
  takesPrBody("Body text");
}

describe("brand contract", () => {
  it("type-level errors above prove brands reject raw strings", () => {
    assert.ok(true);
  });
});
