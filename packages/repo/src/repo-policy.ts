import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface RepoPolicy {
  readonly schemaVersion: "1.0.0";
  readonly workspaceRoot?: string;
  readonly subprocessTailBytes: {
    readonly stdout: number;
    readonly stderr: number;
  };
  readonly commandAllowlist?: readonly string[];
  readonly tombstoneRetentionHours: number;
}

export type ParseRepoPolicyResult =
  | { readonly ok: true; readonly policy: RepoPolicy }
  | { readonly ok: false; readonly errors: readonly string[] };

export const DEFAULT_REPO_POLICY: RepoPolicy = deepFreeze({
  schemaVersion: "1.0.0",
  subprocessTailBytes: { stdout: 8192, stderr: 4096 },
  tombstoneRetentionHours: 24
});

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "workspaceRoot",
  "subprocessTailBytes",
  "commandAllowlist",
  "tombstoneRetentionHours"
]);
const SUBPROCESS_TAIL_BYTES_KEYS = new Set(["stdout", "stderr"]);

/** Parse from JSON text or object; reject unknown keys; default-fill missing fields. */
export function parseRepoPolicy(input: unknown): ParseRepoPolicyResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["Repo policy must be an object."] };
  }

  rejectUnknownKeys(input, TOP_LEVEL_KEYS, "", errors);

  if (input["schemaVersion"] !== "1.0.0") {
    errors.push("schemaVersion must be 1.0.0.");
  }

  const workspaceRoot = readOptionalString(input, "workspaceRoot", errors);
  const subprocessTailBytes = readOptionalSubprocessTailBytes(input["subprocessTailBytes"], errors);
  const commandAllowlist = readOptionalStringArray(input, "commandAllowlist", errors);
  const tombstoneRetentionHours = readOptionalNumber(input, "tombstoneRetentionHours", errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    policy: deepFreeze({
      schemaVersion: "1.0.0",
      ...(workspaceRoot !== undefined ? { workspaceRoot } : {}),
      subprocessTailBytes: subprocessTailBytes ?? DEFAULT_REPO_POLICY.subprocessTailBytes,
      ...(commandAllowlist !== undefined ? { commandAllowlist } : {}),
      tombstoneRetentionHours: tombstoneRetentionHours ?? DEFAULT_REPO_POLICY.tombstoneRetentionHours
    })
  };
}

/**
 * IO + parse + default-fill + Q-02 recursive-clone safety check.
 */
export async function loadRepoPolicy(projectRoot: string): Promise<ParseRepoPolicyResult> {
  const policyPath = join(projectRoot, ".protostar", "repo-policy.json");
  let raw: string;
  try {
    raw = await readFile(policyPath, "utf8");
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ok: true, policy: DEFAULT_REPO_POLICY };
    }
    return { ok: false, errors: [`repo-policy unreadable: ${errorMessage(error)}`] };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error: unknown) {
    return { ok: false, errors: [`repo-policy invalid JSON: ${errorMessage(error)}`] };
  }

  const result = parseRepoPolicy(parsedJson);
  if (!result.ok) {
    return result;
  }

  const { workspaceRoot } = result.policy;
  if (workspaceRoot === undefined) {
    return result;
  }

  const absProjectRoot = resolve(projectRoot);
  const absWorkspaceRoot = resolve(projectRoot, workspaceRoot);
  if (absWorkspaceRoot === absProjectRoot || absWorkspaceRoot.startsWith(absProjectRoot + sep)) {
    return {
      ok: false,
      errors: [
        `workspaceRoot must be outside the source repo (recursive-clone risk): ${absWorkspaceRoot} is inside ${absProjectRoot}`
      ]
    };
  }

  return {
    ok: true,
    policy: deepFreeze({
      ...result.policy,
      workspaceRoot: absWorkspaceRoot
    })
  };
}

function readOptionalString(
  record: Record<string, unknown>,
  key: "workspaceRoot",
  errors: string[]
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string.`);
    return undefined;
  }
  return value;
}

function readOptionalNumber(
  record: Record<string, unknown>,
  key: "tombstoneRetentionHours",
  errors: string[]
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${key} must be a non-negative finite number.`);
    return undefined;
  }
  return value;
}

function readOptionalSubprocessTailBytes(
  value: unknown,
  errors: string[]
): RepoPolicy["subprocessTailBytes"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push("subprocessTailBytes must be an object.");
    return undefined;
  }

  rejectUnknownKeys(value, SUBPROCESS_TAIL_BYTES_KEYS, "subprocessTailBytes.", errors);
  const stdout = readRequiredNonNegativeInteger(value, "stdout", "subprocessTailBytes.stdout", errors);
  const stderr = readRequiredNonNegativeInteger(value, "stderr", "subprocessTailBytes.stderr", errors);

  if (stdout === undefined || stderr === undefined) {
    return undefined;
  }
  return { stdout, stderr };
}

function readRequiredNonNegativeInteger(
  record: Record<string, unknown>,
  key: "stdout" | "stderr",
  label: string,
  errors: string[]
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push(`${label} must be a non-negative integer.`);
    return undefined;
  }
  return value;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: "commandAllowlist",
  errors: string[]
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array of strings.`);
    return undefined;
  }

  const strings: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      errors.push(`${key}[${index}] must be a non-empty string.`);
      return;
    }
    strings.push(entry);
  });

  return Object.freeze(strings);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  prefix: string,
  errors: string[]
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${prefix}${key} is not allowed.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const propertyValue of Object.values(value)) {
    deepFreeze(propertyValue);
  }

  return Object.freeze(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
