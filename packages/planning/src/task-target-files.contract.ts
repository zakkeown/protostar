export type TargetFiles = readonly string[];

export function assertTargetFiles(files: readonly string[]): asserts files is TargetFiles {
  if (files.length === 0) {
    throw new Error("targetFiles must contain at least one file.");
  }
  const blankIndex = files.findIndex((file) => file.trim().length === 0);
  if (blankIndex >= 0) {
    throw new Error(`targetFiles[${blankIndex}] must be a non-empty path.`);
  }
}
