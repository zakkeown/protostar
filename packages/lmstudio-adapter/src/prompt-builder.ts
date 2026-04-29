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
          "Only include files listed in scope. Preserve all unchanged content inside each replacement content string.",
          "The replacement must type-check: do not reference undeclared symbols, and update imports for every new symbol you use.",
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
          'Output ONLY a single fenced ```json block containing {"entries":[{"path":"...","content":"full replacement UTF-8 file content"}]}. No prose.'
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
