import type { StageArtifactRef } from "@protostar/artifacts";

export function composeArtifactList(artifacts: readonly StageArtifactRef[]): string {
  if (artifacts.length === 0) {
    return "## Artifacts\n\n_No artifacts._\n";
  }

  const lines = artifacts.map((artifact) => `- \`${artifact.uri}\``).join("\n");
  return `## Artifacts

${lines}
`;
}
