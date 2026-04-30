import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCoderMessages,
  buildReformatNudgeMessages,
  buildRepairNoopNudgeMessages
} from "./prompt-builder.js";

const input = {
  task: {
    title: "Recolor primary button",
    targetFiles: ["src/Button.tsx", "src/styles.css", "README.md"]
  },
  intentTitle: "Make the button red",
  problem: "The primary button is visually too quiet.",
  context: "Existing components use simple React exports.",
  constraints: ["Do not edit generated files."],
  fileContents: new Map([
    ["src/Button.tsx", "export const Button = () => <button />;"],
    ["src/styles.css", ".button { color: blue; }"],
    ["README.md", "# Fixture"]
  ]),
  acceptanceCriteria: [
    "The primary button uses red background",
    "The patch is a JSON full-file replacement"
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

  it("includes the strict JSON-only nudge in the system prompt", () => {
    const result = buildCoderMessages(input);

    assert.match(
      result.messages[0]?.content ?? "",
      /Output ONLY a single fenced ```json block\. No prose\./
    );
    assert.match(result.messages[0]?.content ?? "", /full replacement UTF-8 file content/);
    assert.match(result.messages[0]?.content ?? "", /"entries": \[\]/);
    assert.match(result.messages[0]?.content ?? "", /Do not add exported helper functions/);
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

  it("includes intent problem, context, and constraints in the user prompt", () => {
    const result = buildCoderMessages(input);
    const user = result.messages[1]?.content ?? "";

    assert.match(user, /Intent: Make the button red/);
    assert.match(user, /Problem:\nThe primary button is visually too quiet/);
    assert.match(user, /Context:\nExisting components use simple React exports/);
    assert.match(user, /Constraints:\n- Do not edit generated files/);
  });

  it("includes repair context when a previous attempt failed", () => {
    const result = buildCoderMessages({
      ...input,
      repairContext: {
        previousAttempt: { planTaskId: "task-board", attempt: 1 },
        mechanicalCritiques: [
          {
            ruleId: "build-failure",
            severity: "critical",
            message: "mechanical command build exited with code 2",
            evidence: {
              artifacts: {
                stderrTail:
                  "Type '{ children: string; onClick: () => void; }' is not assignable\nProperty 'onClick' does not exist on type 'IntrinsicAttributes & { children: ReactNode; }'.",
                stdoutTail:
                  "src/components/TicTacToeBoard.tsx(2,10): error TS6133: 'TttMark' is declared but its value is never read.\nLocator: getByTestId('ttt-board')\nExpected: visible\nError: element(s) not found\n+ undefined\n- 'playing'\nLocator: getByTestId('ttt-status')\nExpected pattern: /x/i\nReceived string: \"playing\"\n- locator resolved to <button disabled class=\"ttt-cell\" data-testid=\"ttt-cell-0\">X</button>\n- element is not enabled\nError: Timed out waiting 120000ms from config.webServer."
              }
            }
          }
        ]
      }
    });
    const user = result.messages[1]?.content ?? "";

    assert.match(user, /Repair context from previous failed attempt:/);
    assert.match(user, /Do not return an empty change-set/);
    assert.match(user, /Actionable failure summary:/);
    assert.match(user, /mechanical command build exited with code 2/);
    assert.match(user, /Type '\{ children: string; onClick: \(\) => void; \}' is not assignable/);
    assert.match(user, /custom React component that does not accept it/);
    assert.match(user, /native DOM element/);
    assert.match(user, /Playwright could not find data-testid "ttt-board"/);
    assert.match(user, /actual rendered DOM element/);
    assert.match(user, /do not disable occupied cells/);
    assert.match(user, /ignore occupied or terminal moves/);
    assert.match(user, /state\.status to be "playing" but received undefined/);
    assert.match(user, /status: "playing"/);
    assert.match(user, /ttt-status" but it only rendered "playing"/);
    assert.match(user, /Next player: X/);
    assert.match(user, /TypeScript TS6133 reports an unused symbol/);
    assert.match(user, /remove the unused import specifier or local binding/);
    assert.match(user, /Playwright timed out waiting for config\.webServer/);
    assert.match(user, /pnpm run dev --host 127\.0\.0\.1 --port 1420/);
    assert.match(result.messages[0]?.content ?? "", /This is a repair attempt/);
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
    assert.match(result.messages.at(-1)?.content ?? "", /"entries":\[\]/);
  });

  it("appends the prior assistant output and a repair no-op nudge", () => {
    const prior = buildCoderMessages({ ...input, repairContext: { mechanicalCritiques: [] } });
    const result = buildRepairNoopNudgeMessages(prior, "```json\n{\"entries\":[]}\n```");

    assert.equal(result.messages.length, prior.messages.length + 2);
    assert.deepEqual(result.messages.slice(0, prior.messages.length), prior.messages);
    assert.equal(result.messages.at(-2)?.role, "assistant");
    assert.equal(result.messages.at(-1)?.role, "user");
    assert.match(result.messages.at(-1)?.content ?? "", /produced no actual diff/);
    assert.match(result.messages.at(-1)?.content ?? "", /change one of the scoped files/);
    assert.match(result.messages.at(-1)?.content ?? "", /getByTestId locator failures/);
    assert.match(result.messages.at(-1)?.content ?? "", /TS6133/);
    assert.match(result.messages.at(-1)?.content ?? "", /remove the unused import/);
    assert.match(result.messages.at(-1)?.content ?? "", /Output ONLY a single fenced/);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
