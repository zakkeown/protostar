import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { GateName } from "@protostar/authority";

export interface EscalationMarker {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly gate: GateName;
  readonly reason: string;
  readonly createdAt: string;
  readonly awaiting?: "operator-confirm" | "operator-resume";
}

export async function writeEscalationMarker(input: {
  readonly runDir: string;
  readonly marker: EscalationMarker;
}): Promise<{ artifactPath: string }> {
  const artifactPath = join(input.runDir, "escalation-marker.json");
  await mkdir(input.runDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(input.marker, null, 2)}\n`, "utf8");
  return { artifactPath };
}
