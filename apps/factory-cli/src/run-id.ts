import path from "node:path";

export const RUN_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

declare const RunIdBrand: unique symbol;
export type RunId = string & { readonly [RunIdBrand]: true };

export function parseRunId(input: string):
  | { readonly ok: true; readonly value: RunId }
  | { readonly ok: false; readonly reason: string } {
  if (!RUN_ID_REGEX.test(input)) {
    return {
      ok: false,
      reason: `runId must match ${RUN_ID_REGEX.toString()}, got ${JSON.stringify(input)}`
    };
  }

  return { ok: true, value: input as RunId };
}

export function assertRunIdConfined(runsRoot: string, runId: RunId): void {
  const resolvedRoot = path.resolve(runsRoot);
  const resolvedRunDir = path.resolve(resolvedRoot, runId);
  if (!resolvedRunDir.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`runId ${runId} resolves outside runs root`);
  }
}
