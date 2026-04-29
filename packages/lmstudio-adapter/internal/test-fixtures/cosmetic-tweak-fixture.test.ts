import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cosmeticTweakFixture } from "./cosmetic-tweak-fixture.js";

const strictFence = /^```(?:diff|patch)?\s*\n([\s\S]*?)\n```\s*$/;
const strictJsonFence = /^```json\s*\n([\s\S]*?)\n```\s*$/;

describe("cosmetic tweak fixture", () => {
  it("targets the button file", () => {
    assert.ok(cosmeticTweakFixture.task.targetFiles.length >= 1);
    assert.ok(cosmeticTweakFixture.task.targetFiles.includes("src/Button.tsx"));
  });

  it("contains a pre-image for the current blue button", () => {
    const bytes = cosmeticTweakFixture.preImageBytes["src/Button.tsx"];
    assert.ok(bytes);
    assert.match(new TextDecoder().decode(bytes), /bg-blue-500/);
  });

  it("provides a strict fenced unified diff sample", () => {
    assert.match(cosmeticTweakFixture.expectedDiffSample, strictFence);
    assert.match(cosmeticTweakFixture.expectedDiffSample, /--- a\/src\/Button\.tsx/);
    assert.match(cosmeticTweakFixture.expectedDiffSample, /\+\+\+ b\/src\/Button\.tsx/);
  });

  it("provides a strict fenced JSON replacement sample", () => {
    assert.match(cosmeticTweakFixture.expectedJsonChangeSetSample, strictJsonFence);
    const [, jsonContent] = cosmeticTweakFixture.expectedJsonChangeSetSample.match(strictJsonFence) ?? [];
    assert.ok(jsonContent);
    const parsed = JSON.parse(jsonContent) as {
      readonly entries: readonly { readonly path: string; readonly content: string }[];
    };
    assert.equal(parsed.entries[0]?.path, "src/Button.tsx");
    assert.match(parsed.entries[0]?.content ?? "", /bg-red-500/);
  });

  it("provides a prose-drift sample with the same diff content", () => {
    assert.doesNotMatch(cosmeticTweakFixture.proseDriftDiffSample, strictFence);
    const [, expectedDiffContent] = cosmeticTweakFixture.expectedDiffSample.match(strictFence) ?? [];
    assert.ok(expectedDiffContent);
    assert.match(cosmeticTweakFixture.proseDriftDiffSample, /Sure, here's the patch:/);
    assert.ok(cosmeticTweakFixture.proseDriftDiffSample.includes(expectedDiffContent));
  });

  it("provides a prose-drift sample with the same JSON content", () => {
    assert.doesNotMatch(cosmeticTweakFixture.proseDriftJsonSample, strictJsonFence);
    const [, expectedJsonContent] =
      cosmeticTweakFixture.expectedJsonChangeSetSample.match(strictJsonFence) ?? [];
    assert.ok(expectedJsonContent);
    assert.match(cosmeticTweakFixture.proseDriftJsonSample, /Sure, here's the change set:/);
    assert.ok(cosmeticTweakFixture.proseDriftJsonSample.includes(expectedJsonContent));
  });

  it("pins the typed 1.3.0 execution envelope fields", () => {
    assert.equal(cosmeticTweakFixture.intent.capabilityEnvelope.network.allow, "loopback");
    assert.equal(cosmeticTweakFixture.intent.capabilityEnvelope.budget.taskWallClockMs, 180_000);
  });
});
