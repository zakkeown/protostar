export type ScreenshotFooterInput =
  | { readonly screenshotStatus: "deferred-v01" }
  | { readonly screenshotStatus: "captured"; readonly traces: readonly string[] };

export function composeFooter(input: ScreenshotFooterInput): string {
  if (input.screenshotStatus === "deferred-v01") {
    return "_Screenshots: deferred until Phase 10 dogfood (toy repo not yet scaffolded)._";
  }

  const lines = input.traces.map((trace) => `- \`${trace}\``).join("\n");
  return `## Screenshots

${lines}
`;
}
