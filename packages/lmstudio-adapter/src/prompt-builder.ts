export interface PromptBuilderInput {
  readonly task: {
    readonly title: string;
    readonly targetFiles: readonly string[];
  };
  readonly intentTitle?: string;
  readonly problem?: string;
  readonly context?: string;
  readonly constraints?: readonly string[];
  readonly fileContents: ReadonlyMap<string, string>;
  readonly acceptanceCriteria: readonly string[];
  readonly archetype: string;
  readonly repairContext?: unknown;
}

export interface CoderMessages {
  readonly messages: readonly CoderMessage[];
}

export type CoderMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: string };

const JSON_ONLY_NUDGE = "Output ONLY a single fenced ```json block. No prose.";

export function buildCoderMessages(input: PromptBuilderInput): CoderMessages {
  return {
    messages: [
      {
        role: "system",
        content: [
          "You are a coder agent producing full-file replacements against the workspace.",
          JSON_ONLY_NUDGE,
          "The JSON object must match this schema exactly:",
          '{ "entries": [{ "path": "relative/path.ext", "content": "full replacement UTF-8 file content" }] }',
          input.repairContext === undefined
            ? "If the task is already satisfied by the files in scope, return { \"entries\": [] }."
            : "This is a repair attempt. Return { \"entries\": [] } only if the scoped files already resolve every listed repair critique.",
          "Only include files listed in scope. Preserve all unchanged content inside each replacement content string.",
          "The replacement must type-check: do not reference undeclared symbols, and update imports for every new symbol you use.",
          "Do not add exported helper functions or broad abstractions unless the task or acceptance criteria explicitly require them.",
          "When repair context includes command stdout/stderr tails, treat them as concrete build or test errors to fix.",
          "Prefer the smallest valid edit that satisfies the acceptance criteria.",
          "Example:",
          "```json",
          JSON.stringify({
            entries: [
              {
                path: "src/example.ts",
                content: "export const value = 2;\n"
              }
            ]
          }),
          "```",
          `Archetype: ${input.archetype}`
        ].join("\n")
      },
      {
        role: "user",
        content: buildUserPrompt(input)
      }
    ]
  };
}

export function buildReformatNudgeMessages(
  prior: CoderMessages,
  priorAssistantContent: string
): CoderMessages {
  return {
    messages: [
      ...prior.messages,
      { role: "assistant", content: priorAssistantContent },
      {
        role: "user",
        content:
          'Output ONLY a single fenced ```json block containing {"entries":[{"path":"...","content":"full replacement UTF-8 file content"}]} or {"entries":[]}. No prose.'
      }
    ]
  };
}

export function buildRepairNoopNudgeMessages(
  prior: CoderMessages,
  priorAssistantContent: string
): CoderMessages {
  return {
    messages: [
      ...prior.messages,
      { role: "assistant", content: priorAssistantContent },
      {
        role: "user",
        content: [
          "Your previous replacement produced no actual diff against the current scoped files.",
          "You must change one of the scoped files to address the listed diagnostics.",
          "For Playwright getByTestId locator failures, ensure the data-testid is present on a rendered DOM element, not only on a custom React component unless its source is in scope and forwards props.",
          "For TypeScript TS6133 or \"declared but never read\" diagnostics, remove the unused import, local binding, or function parameter from a scoped file and update call sites if a parameter is removed.",
          "For src/ttt/state.ts TS6133 on a nextPlayer parameter in updateStatus, change updateStatus(board, nextPlayer) to updateStatus(board) and update callers to pass only the board.",
          "For TS2693 diagnostics where TttMark only refers to a type but is used as a value, compare marks to string literals \"X\" and \"O\" or export TttMark as a runtime enum/value.",
          "For Playwright failures where data-testid=\"ttt-reset\" is disabled, remove the disabled attribute/prop from the reset button so the spec can click it at any time.",
          "Return {\"entries\":[]} only when the diagnostics are already impossible in the current scoped files.",
          'Output ONLY a single fenced ```json block containing {"entries":[{"path":"...","content":"full replacement UTF-8 file content"}]} or {"entries":[]}. No prose.'
        ].join("\n")
      }
    ]
  };
}

function buildUserPrompt(input: PromptBuilderInput): string {
  return [
    ...(input.intentTitle === undefined ? [] : [`Intent: ${input.intentTitle}`]),
    ...(input.problem === undefined ? [] : ["Problem:", input.problem]),
    ...(input.context === undefined ? [] : ["Context:", input.context]),
    ...(input.constraints === undefined || input.constraints.length === 0
      ? []
      : ["Constraints:", ...input.constraints.map((constraint) => `- ${constraint}`)]),
    ...(input.intentTitle === undefined &&
    input.problem === undefined &&
    input.context === undefined &&
    (input.constraints === undefined || input.constraints.length === 0)
      ? []
      : [""]),
    ...(input.repairContext === undefined
      ? []
      : repairContextSection(input.repairContext)),
    `Task: ${input.task.title}`,
    "Acceptance Criteria:",
    ...input.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
    "Files in scope:",
    "",
    ...input.task.targetFiles.flatMap((path) => [
      `### ${path}`,
      `\`\`\`${langForExt(path)}`,
      input.fileContents.get(path) ?? "",
      "```",
      ""
    ])
  ].join("\n");
}

function repairContextSection(repairContext: unknown): readonly string[] {
  const summary = summarizeRepairContext(repairContext);
  return [
    "Repair context from previous failed attempt:",
    "Address every critique below. Do not return an empty change-set while any listed build, typecheck, lint, test, or review failure is still present in the scoped files.",
    ...(summary.length === 0 ? [] : ["Actionable failure summary:", ...summary.map((line) => `- ${line}`)]),
    "Raw repair context:",
    JSON.stringify(repairContext, null, 2),
    ""
  ];
}

function summarizeRepairContext(repairContext: unknown): readonly string[] {
  if (!isRecord(repairContext) || !Array.isArray(repairContext["mechanicalCritiques"])) {
    return [];
  }
  return repairContext["mechanicalCritiques"].flatMap((critique) => {
    if (!isRecord(critique)) return [];
    const lines: string[] = [];
    const message = critique["message"];
    if (typeof message === "string" && message.length > 0) {
      lines.push(message);
    }
    const evidence = critique["evidence"];
    const artifacts = isRecord(evidence) ? evidence["artifacts"] : undefined;
    if (isRecord(artifacts)) {
      const stdoutTail = artifacts["stdoutTail"];
      const stderrTail = artifacts["stderrTail"];
      if (typeof stdoutTail === "string" && stdoutTail.trim().length > 0) {
        lines.push(`stdoutTail: ${stdoutTail.trim()}`);
        lines.push(...diagnosticHints(stdoutTail));
      }
      if (typeof stderrTail === "string" && stderrTail.trim().length > 0) {
        lines.push(`stderrTail: ${stderrTail.trim()}`);
        lines.push(...diagnosticHints(stderrTail));
      }
    }
    return lines;
  });
}

function diagnosticHints(output: string): readonly string[] {
  const hints: string[] = [];
  const testIdMatch = output.match(/getByTestId\(['"]([^'"]+)['"]\)/u);
  if (testIdMatch !== null && /element\(s\) not found|toBeVisible|waiting for getByTestId/u.test(output)) {
    const testId = testIdMatch[1] ?? "the expected test id";
    hints.push(
      `Playwright could not find data-testid "${testId}"; put that attribute on an actual rendered DOM element in scoped source, not only on a custom React component unless props are forwarded.`
    );
  }
  if (
    /data-testid=["']ttt-cell-\d+["']/u.test(output) &&
    /element is not enabled|waiting for element to be visible, enabled and stable/u.test(output)
  ) {
    hints.push(
      "Playwright clicks occupied tic-tac-toe cells to verify they cannot be overwritten; do not disable occupied cells. Keep cell buttons enabled and ignore occupied or terminal moves in the click handler/state transition."
    );
  }
  if (
    /getByTestId\(['"]ttt-reset['"]\)|data-testid=["']ttt-reset["']/u.test(output) &&
    /element is not enabled|waiting for element to be visible, enabled and stable/u.test(output)
  ) {
    hints.push(
      "Playwright clicks data-testid \"ttt-reset\" even after normal moves; keep the reset button enabled at all times. Remove any disabled attribute/prop from the ttt-reset button and let the click reset the board."
    );
  }
  const hasUndefinedVsPlayingDiff =
    /^\s*\+\s*undefined\s*$/mu.test(output) && /^\s*-\s*['"]playing['"]\s*$/mu.test(output);
  if (hasUndefinedVsPlayingDiff || /expected:\s*['"]playing['"]/u.test(output)) {
    hints.push(
      "The property test expected state.status to be \"playing\" but received undefined; TttState must carry a status field, createInitialTttState must set status: \"playing\", and applyTttMove must update status to \"playing\", \"x-won\", \"o-won\", or \"draw\"."
    );
  }
  if (/does not provide an export named ['"]applyTttMove['"]/u.test(output)) {
    hints.push(
      "The immutable property test imports applyTttMove from src/ttt/state.ts. Implement and export the full tic-tac-toe state API there: TttMark, TttState, createInitialTttState, and applyTttMove with occupied/terminal moves ignored and status updated to playing, x-won, o-won, or draw."
    );
  }
  if (
    /getByTestId\(['"]ttt-status['"]\)/u.test(output) &&
    /Expected pattern:\s*(?:\u001b\[[\d;]*m)*\/[xo]\/i/u.test(output) &&
    /Received string:\s*(?:\u001b\[[\d;]*m)*"?playing"?/u.test(output)
  ) {
    hints.push(
      "Playwright found data-testid \"ttt-status\" but it only rendered \"playing\"; while status is playing, render the current next player too, for example \"Next player: X\" initially and \"Next player: O\" after X moves. Continue rendering the winning player for x-won/o-won and draw text for draw."
    );
  }
  if (/Property ['"][^'"]+['"] does not exist on type ['"]IntrinsicAttributes/u.test(output)) {
    hints.push(
      "TypeScript reports a prop was passed to a custom React component that does not accept it. If the component source is not in scope, replace that custom component with the equivalent native DOM element in a scoped file, or otherwise update the scoped component props so every passed prop is declared."
    );
  }
  if (/TS6133|declared but (?:its value is )?never read/u.test(output)) {
    hints.push(
      "TypeScript TS6133 reports an unused symbol; remove the unused import specifier, local binding, or function parameter from the scoped file instead of returning the file unchanged. If you remove a parameter, update every scoped call site for that function."
    );
  }
  if (/TS2693: 'TttMark' only refers to a type, but is being used as a value here/u.test(output)) {
    hints.push(
      "TttMark is a type-only mark union in this workspace. Do not write TttMark.X or TttMark.O unless state.ts exports a runtime enum; compare mark values to the string literals \"X\" and \"O\", and remove unused TttMark imports if they are no longer needed."
    );
  }
  if (/src\/ttt\/state\.ts\(\d+,\d+\): error TS6133: 'nextPlayer' is declared but its value is never read/u.test(output)) {
    hints.push(
      "The tic-tac-toe state helper has an unused nextPlayer parameter. If updateStatus is declared as updateStatus(board, nextPlayer) but never reads nextPlayer, remove that parameter and call it as updateStatus(newBoard)."
    );
  }
  if (
    /getByTestId\(['"]ttt-status['"]\)/u.test(output) &&
    /Expected pattern:\s*(?:\u001b\[[\d;]*m)*\/x wins\/i/u.test(output) &&
    /Received string:\s*(?:\u001b\[[\d;]*m)*"?X won!?/iu.test(output)
  ) {
    hints.push(
      "Playwright expects the terminal tic-tac-toe status to contain \"X wins\". Render exactly \"X wins\" for an X victory, not \"X won\" or \"X won!\"."
    );
  }
  if (/Timed out waiting \d+ms from config\.webServer/u.test(output)) {
    hints.push(
      "Playwright timed out waiting for config.webServer; ensure the webServer command actually binds to the configured URL. With pnpm scripts, use `pnpm run dev --host 127.0.0.1 --port 1420` rather than `pnpm run dev -- --host 127.0.0.1 --port 1420`, because the extra literal -- can prevent Vite from applying the host flag."
    );
  }
  return hints;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function langForExt(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  return "text";
}
