import type { ParsedCliArgs } from "./cli-args.js";

export interface TwoKeyLaunchRefusal {
  readonly reason: string;
  readonly missingFlag: "--confirmed-intent";
  readonly provided: {
    readonly trust: "trusted";
    readonly confirmedIntent: undefined;
  };
}

export type TwoKeyLaunchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: TwoKeyLaunchRefusal };

export function validateTwoKeyLaunch(args: ParsedCliArgs): TwoKeyLaunchResult {
  if (args.trust === "untrusted") {
    return { ok: true };
  }
  if (args.confirmedIntent !== undefined) {
    return { ok: true };
  }

  return {
    ok: false,
    refusal: {
      reason: "--trust trusted requires --confirmed-intent <path> (two-key launch)",
      missingFlag: "--confirmed-intent",
      provided: {
        trust: "trusted",
        confirmedIntent: undefined
      }
    }
  };
}
