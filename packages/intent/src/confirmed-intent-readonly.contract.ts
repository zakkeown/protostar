import type { ConfirmedIntent } from "./index.js";

type Assert<T extends true> = T;

type IfEquals<X, Y, Then = true, Else = false> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2
  ? Then
  : Else;

type IsReadonlyField<T, Key extends keyof T> = IfEquals<
  { [Property in Key]: T[Property] },
  { -readonly [Property in Key]: T[Property] },
  false,
  true
>;

type IsMutableArray<T> = T extends unknown[] ? true : false;

export type ConfirmedIntentReadonlyContract = Assert<
  IsReadonlyField<ConfirmedIntent, "id"> extends true
    ? IsReadonlyField<ConfirmedIntent, "sourceDraftId"> extends true
      ? IsReadonlyField<ConfirmedIntent, "mode"> extends true
        ? IsReadonlyField<ConfirmedIntent, "goalArchetype"> extends true
          ? IsReadonlyField<ConfirmedIntent, "title"> extends true
            ? IsReadonlyField<ConfirmedIntent, "problem"> extends true
              ? IsReadonlyField<ConfirmedIntent, "requester"> extends true
                ? IsReadonlyField<ConfirmedIntent, "confirmedAt"> extends true
                  ? IsReadonlyField<ConfirmedIntent, "context"> extends true
                    ? IsReadonlyField<ConfirmedIntent, "acceptanceCriteria"> extends true
                      ? IsReadonlyField<ConfirmedIntent, "capabilityEnvelope"> extends true
                        ? IsReadonlyField<ConfirmedIntent, "constraints"> extends true
                          ? IsReadonlyField<ConfirmedIntent, "stopConditions"> extends true
                            ? true
                            : false
                          : false
                        : false
                      : false
                    : false
                  : false
                : false
              : false
            : false
          : false
        : false
      : false
    : false
>;

export type ConfirmedIntentArrayContract = Assert<
  IsMutableArray<ConfirmedIntent["acceptanceCriteria"]> extends false
    ? IsMutableArray<ConfirmedIntent["constraints"]> extends false
      ? IsMutableArray<ConfirmedIntent["stopConditions"]> extends false
        ? IsMutableArray<ConfirmedIntent["capabilityEnvelope"]["repoScopes"]> extends false
          ? IsMutableArray<ConfirmedIntent["capabilityEnvelope"]["toolPermissions"]> extends false
            ? true
            : false
          : false
        : false
      : false
    : false
>;

export type ConfirmedIntentNestedReadonlyContract = Assert<
  IsReadonlyField<ConfirmedIntent["acceptanceCriteria"][number], "statement"> extends true
    ? IsReadonlyField<ConfirmedIntent["capabilityEnvelope"]["repoScopes"][number], "path"> extends true
      ? IsReadonlyField<ConfirmedIntent["capabilityEnvelope"]["toolPermissions"][number], "risk"> extends true
        ? IsReadonlyField<ConfirmedIntent["capabilityEnvelope"]["budget"], "maxRepairLoops"> extends true
          ? true
          : false
        : false
      : false
    : false
>;
