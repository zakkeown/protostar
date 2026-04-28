export const ExitCode = {
  Success: 0,
  GenericError: 1,
  UsageOrArgError: 2,
  NotFound: 3,
  Conflict: 4,
  CancelledByOperator: 5,
  NotResumable: 6
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
