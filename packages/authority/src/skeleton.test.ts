import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { __authorityPackageReady } from "./index.js";

describe("@protostar/authority skeleton", () => {
  it("package builds and tests run", () => assert.equal(__authorityPackageReady, true));
});
