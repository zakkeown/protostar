export type AdapterRef = string;

export type AdapterRefAdmissionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly violation: {
        readonly kind: "adapter-ref-not-allowed";
        readonly taskId: string;
        readonly adapterRef: string;
        readonly allowedAdapters: readonly string[];
      };
    };

const ADAPTER_REF_PATTERN = /^[a-z][a-z0-9-]*$/;

export function assertAdapterRef(ref: unknown): asserts ref is AdapterRef {
  if (typeof ref !== "string" || !ADAPTER_REF_PATTERN.test(ref)) {
    throw new Error("adapterRef must match /^[a-z][a-z0-9-]*$/.");
  }
}

export function admitTaskAdapterRef(input: {
  readonly taskId: string;
  readonly adapterRef: string | undefined;
  readonly allowedAdapters: readonly string[];
}): AdapterRefAdmissionResult {
  if (input.adapterRef === undefined) {
    return { ok: true };
  }
  if (input.allowedAdapters.includes(input.adapterRef)) {
    return { ok: true };
  }
  return {
    ok: false,
    violation: {
      kind: "adapter-ref-not-allowed",
      taskId: input.taskId,
      adapterRef: input.adapterRef,
      allowedAdapters: input.allowedAdapters
    }
  };
}
