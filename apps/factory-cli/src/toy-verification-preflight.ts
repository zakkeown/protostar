export const DEFAULT_TOY_REPO_ROOT = "../protostar-toy-ttt";

export const REQUIRED_TOY_VERIFICATION_FILES = [
  "e2e/ttt.spec.ts",
  "tests/ttt-state.property.test.ts"
] as const;

export interface ToyVerificationPreflightInput {
  readonly toyRepoRoot?: string;
  readonly exists: (path: string) => Promise<boolean>;
}

export type ToyVerificationPreflightResult =
  | {
      readonly ok: true;
      readonly files: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: "toy-verification-missing";
      readonly missingFiles: readonly string[];
    };

export async function assertToyVerificationPreflight(
  input: ToyVerificationPreflightInput
): Promise<ToyVerificationPreflightResult> {
  const toyRepoRoot = normalizeToyRepoRoot(input.toyRepoRoot ?? DEFAULT_TOY_REPO_ROOT);
  const files = REQUIRED_TOY_VERIFICATION_FILES.map((file) => joinNormalized(toyRepoRoot, file));
  const missingFiles: string[] = [];

  for (const file of files) {
    if (!(await input.exists(file))) {
      missingFiles.push(file);
    }
  }

  return missingFiles.length === 0
    ? { ok: true, files }
    : {
        ok: false,
        code: "toy-verification-missing",
        missingFiles
      };
}

function normalizeToyRepoRoot(root: string): string {
  const normalized = root
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
  return normalized.length === 0 ? "." : normalized;
}

function joinNormalized(root: string, relativePath: string): string {
  const normalizedFile = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return root === "." ? normalizedFile : `${root}/${normalizedFile}`;
}
