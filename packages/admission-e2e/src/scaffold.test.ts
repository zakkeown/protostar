import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMISSION_E2E_PACKAGE_NAME } from "./index.js";

describe("admission-e2e scaffold", () => {
  it("exports the canonical package-name constant", () => {
    assert.equal(ADMISSION_E2E_PACKAGE_NAME, "@protostar/admission-e2e");
  });
});
