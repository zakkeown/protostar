import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeFooter } from "./compose-footer.js";

describe("composeFooter", () => {
  it("renders screenshots-deferred footer with verbatim Q-11 rationale", () => {
    const out = composeFooter({ screenshotStatus: "deferred-v01" });

    assert.equal(out, "_Screenshots: deferred until Phase 10 dogfood (toy repo not yet scaffolded)._");
  });

  it("renders captured traces for the forward-compatible path", () => {
    const out = composeFooter({
      screenshotStatus: "captured",
      traces: ["runs/r1/screenshots/home.png", "runs/r1/screenshots/result.png"]
    });

    assert.equal(
      out,
      "## Screenshots\n\n- `runs/r1/screenshots/home.png`\n- `runs/r1/screenshots/result.png`\n"
    );
  });
});
