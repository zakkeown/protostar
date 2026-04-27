import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import type { RepoChangeSet } from "@protostar/repo";

export interface ExecutionAdapter {
  readonly id: string;
  execute(task: ExecutionAdapterTaskInput, ctx: AdapterContext): AsyncIterable<AdapterEvent>;
}

export interface ExecutionAdapterTaskInput {
  readonly planTaskId: string;
  readonly title: string;
  readonly targetFiles: readonly string[];
  readonly adapterRef?: string;
}

export interface AdapterContext {
  readonly signal: AbortSignal;
  readonly confirmedIntent: ConfirmedIntent;
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly repoReader: RepoReader;
  readonly journal: AdapterJournalWriter;
  readonly budget: {
    readonly taskWallClockMs: number;
    readonly adapterRetriesPerTask: number;
  };
  readonly network: {
    readonly allow: "none" | "loopback" | "allowlist";
    readonly allowedHosts?: readonly string[];
  };
}

export interface RepoReader {
  readFile(path: string): Promise<{ readonly bytes: Uint8Array; readonly sha256: string }>;
  glob(pattern: string): Promise<readonly string[]>;
}

export interface AdapterJournalWriter {
  appendToken(taskId: string, attempt: number, text: string): Promise<void>;
}

export type AdapterEvent =
  | { readonly kind: "token"; readonly text: string }
  | { readonly kind: "tool-call"; readonly name: string; readonly args: unknown }
  | { readonly kind: "progress"; readonly message: string }
  | { readonly kind: "final"; readonly result: AdapterResult };

export type AdapterResult =
  | {
      readonly outcome: "change-set";
      readonly changeSet: RepoChangeSet;
      readonly evidence: AdapterEvidence;
    }
  | {
      readonly outcome: "adapter-failed";
      readonly reason: AdapterFailureReason;
      readonly evidence: AdapterEvidence;
    };

export type AdapterFailureReason =
  | "parse-no-block"
  | "parse-multiple-blocks"
  | "parse-reformat-failed"
  | "lmstudio-unreachable"
  | "lmstudio-http-error"
  | "lmstudio-model-not-loaded"
  | "retries-exhausted"
  | "aborted"
  | "timeout"
  | "aux-read-budget-exceeded";

export interface AdapterEvidence {
  readonly model: string;
  readonly attempts: number;
  readonly durationMs: number;
  readonly auxReads: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly retries: readonly {
    readonly attempt: number;
    readonly retryReason: "transient" | "parse-reformat";
    readonly errorClass?: string;
    readonly durationMs: number;
  }[];
}
