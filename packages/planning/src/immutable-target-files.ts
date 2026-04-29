export const IMMUTABLE_TOY_VERIFICATION_PATTERNS = [
  "e2e/**",
  "tests/ttt-state.property.test.ts"
] as const;

export type ImmutableTargetFileViolationCode = "immutable-target-file";

export interface ImmutableTargetFileViolation {
  readonly code: ImmutableTargetFileViolationCode;
  readonly path: string;
  readonly message: string;
}

export interface ValidateImmutableTargetFilesInput {
  readonly targetFiles: readonly string[];
  readonly immutableGlobs: readonly string[];
}

export type ValidateImmutableTargetFilesResult =
  | {
      readonly ok: true;
      readonly violations: readonly [];
    }
  | {
      readonly ok: false;
      readonly violations: readonly ImmutableTargetFileViolation[];
    };

export function validateImmutableTargetFiles(
  input: ValidateImmutableTargetFilesInput
): ValidateImmutableTargetFilesResult {
  const immutablePatterns = input.immutableGlobs.map(normalizeTargetPath);
  const violations = input.targetFiles.flatMap((path): ImmutableTargetFileViolation[] => {
    const normalizedPath = normalizeTargetPath(path);
    const matchedPattern = immutablePatterns.find((pattern) =>
      matchesImmutablePattern(normalizedPath, pattern)
    );
    if (matchedPattern === undefined) {
      return [];
    }

    return [
      {
        code: "immutable-target-file",
        path: normalizedPath,
        message:
          `Target file ${normalizedPath} matches immutable pattern ${matchedPattern}; ` +
          "operator-authored toy verification file paths must not be edited by factory-generated plans."
      }
    ];
  });

  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations };
}

function normalizeTargetPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
}

function matchesImmutablePattern(path: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -"**".length);
    return path.startsWith(prefix) && path.length > prefix.length;
  }
  return path === pattern;
}
