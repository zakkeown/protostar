export interface PromptBuilderInput {
  readonly task: {
    readonly title: string;
    readonly targetFiles: readonly string[];
  };
  readonly fileContents: ReadonlyMap<string, string>;
  readonly acceptanceCriteria: readonly string[];
  readonly archetype: string;
}

export interface CoderMessages {
  readonly messages: readonly CoderMessage[];
}

export type CoderMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: string };

const DIFF_ONLY_NUDGE = "Output ONLY a single fenced ```diff block. No prose.";

export function buildCoderMessages(input: PromptBuilderInput): CoderMessages {
  return {
    messages: [
      {
        role: "system",
        content: [
          "You are a coder agent producing a unified diff against the workspace.",
          DIFF_ONLY_NUDGE,
          "All file changes go in ONE fence. Use standard unified-diff multi-file headers (--- a/path / +++ b/path).",
          "Example:",
          "```diff",
          "--- a/src/example.ts",
          "+++ b/src/example.ts",
          "@@ -1 +1 @@",
          "-old",
          "+new",
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
        content: "Output ONLY a single fenced ```diff block containing your patch. No prose."
      }
    ]
  };
}

function buildUserPrompt(input: PromptBuilderInput): string {
  return [
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

function langForExt(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  return "text";
}
