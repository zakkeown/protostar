import { createHash } from "node:crypto";

import type { ConfirmedIntent } from "@protostar/intent";

export function computeLineageId(intent: ConfirmedIntent): string {
  const subject = {
    problem: intent.problem,
    acceptanceCriteria: intent.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      statement: criterion.statement,
      verification: criterion.verification
    }))
  };
  const canonical = canonicalize(subject);
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 12);
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}
