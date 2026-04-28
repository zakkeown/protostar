import { sortJsonValue } from "@protostar/artifacts/canonical-json";

export function writeStdoutJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(sortJsonValue(value))}\n`);
}

export function writeStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}
