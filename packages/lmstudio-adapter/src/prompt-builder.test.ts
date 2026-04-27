import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCoderMessages, buildReformatNudgeMessages } from "./prompt-builder.js";

const input = {
  task: {
    title: "Recolor primary button",
    targetFiles: ["src/Button.tsx", "src/styles.css", "README.md"]
  },
  fileContents: new Map([
    ["src/Button.tsx", "export const Button = () => <button />;"],
    ["src/styles.css", ".button { color: blue; }"],
    ["README.md", "# Fixture"]
  ]),
  acceptanceCriteria: [
    "The primary button uses red background",
    "The patch is a unified diff"
  ],
  archetype: "cosmetic-tweak"
} as const;

describe("buildCoderMessages", () => {
  it("returns a system and user message pair", () => {
    const result = buildCoderMessages(input);

    assert.equal(result.messages.length >= 2, true);
    assert.equal(result.messages[0]?.role, "system");
    assert.equal(result.messages[1]?.role, "user");
  });

  it("includes the strict diff-only nudge in the system prompt", () => {
    const result = buildCoderMessages(input);

    assert.match(
      result.messages[0]?.content ?? "",
      /Output ONLY a single fenced ```diff block\. No prose\./
    );
  });

  it("includes every target file path and fenced file contents in the user prompt", () => {
    const result = buildCoderMessages(input);
    const user = result.messages[1]?.content ?? "";

    assert.match(user, /### src\/Button\.tsx\n```tsx\nexport const Button/);
    assert.match(user, /### src\/styles\.css\n```css\n\.button/);
    assert.match(user, /### README\.md\n```text\n# Fixture/);
  });

  it("includes every acceptance criterion verbatim", () => {
    const result = buildCoderMessages(input);
    const user = result.messages[1]?.content ?? "";

    for (const criterion of input.acceptanceCriteria) {
      assert.match(user, new RegExp(escapeRegExp(criterion)));
    }
  });

  it("appends the prior assistant output and a reformat nudge", () => {
    const prior = buildCoderMessages(input);
    const result = buildReformatNudgeMessages(prior, "Sure here it is...");

    assert.equal(result.messages.length, prior.messages.length + 2);
    assert.deepEqual(result.messages.slice(0, prior.messages.length), prior.messages);
    assert.equal(result.messages.at(-2)?.role, "assistant");
    assert.equal(result.messages.at(-2)?.content, "Sure here it is...");
    assert.equal(result.messages.at(-1)?.role, "user");
    assert.match(result.messages.at(-1)?.content ?? "", /Output ONLY a single fenced/);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
