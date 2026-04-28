import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { executeDelivery } from "./execute-delivery.js";

describe("executeDelivery - brand-typed entry", () => {
  it("compile-time rejects raw strings for the delivery 5-brand stack", () => {
    const declaredFn = null as unknown as typeof executeDelivery;
    const stubAuth = null as unknown as Parameters<typeof executeDelivery>[0];
    const stubCtx = null as unknown as Parameters<typeof executeDelivery>[2];

    if (false) {
      // @ts-expect-error - raw string rejected for branch
      declaredFn(stubAuth, { branch: "foo", title: "t" as never, body: "b" as never, target: {} as never, artifacts: [], evidenceComments: [] }, stubCtx);
      // @ts-expect-error - raw string rejected for title
      declaredFn(stubAuth, { branch: "b" as never, title: "foo", body: "b" as never, target: {} as never, artifacts: [], evidenceComments: [] }, stubCtx);
      // @ts-expect-error - raw string rejected for body
      declaredFn(stubAuth, { branch: "b" as never, title: "t" as never, body: "foo", target: {} as never, artifacts: [], evidenceComments: [] }, stubCtx);
    }

    assert.ok(true);
  });
});
