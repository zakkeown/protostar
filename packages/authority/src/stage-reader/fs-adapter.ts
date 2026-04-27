export interface FsAdapter {
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

export class StageReaderError extends Error {
  constructor(
    public readonly artifact: string,
    public readonly reason: string,
    public readonly artifactPath: string
  ) {
    super(`stage reader: ${reason} (${artifact} at ${artifactPath})`);
  }
}
