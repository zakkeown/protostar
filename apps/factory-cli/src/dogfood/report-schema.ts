import { sortJsonValue } from "@protostar/artifacts/canonical-json";
import { z } from "zod";

import { DogfoodOutcomeSchema } from "./cursor-schema.js";

export const CiVerdictSchema = z.enum(["success", "failure", "timeout", "skipped"]);

export const ReportRowSchema = z.object({
  runId: z.string().min(1),
  seedId: z.string().min(1),
  outcome: DogfoodOutcomeSchema,
  prUrl: z.string().regex(/^https:\/\/github\.com\/zakkeown\/protostar-toy-ttt\/pull\/[0-9]+$/).optional(),
  ciVerdict: CiVerdictSchema.optional(),
  durationMs: z.number().int().nonnegative()
}).strict();

export const ReportSchema = z.object({
  sessionId: z.string().min(1),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  totalRuns: z.number().int().nonnegative(),
  passCount: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  rows: z.array(ReportRowSchema)
}).strict().superRefine((report, ctx) => {
  if (report.passCount > report.totalRuns) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["passCount"],
      message: "passCount must be less than or equal to totalRuns"
    });
  }
  if (report.rows.length !== report.totalRuns) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: "rows length must match totalRuns"
    });
  }
  const computedPassCount = report.rows.filter((row) => row.outcome === "pr-ready").length;
  if (computedPassCount !== report.passCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["passCount"],
      message: "passCount must match pr-ready row count"
    });
  }
  for (const [index, row] of report.rows.entries()) {
    if (row.outcome === "pr-ready" && (row.prUrl === undefined || row.ciVerdict !== "success")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows", index],
        message: "pr-ready rows require prUrl and ciVerdict success"
      });
    }
  }
});

export type CiVerdict = z.infer<typeof CiVerdictSchema>;
export type ReportRow = z.infer<typeof ReportRowSchema>;
export type Report = z.infer<typeof ReportSchema>;

export function parseReport(input: unknown): Report {
  return ReportSchema.parse(input);
}

export function formatReport(report: Report): string {
  return `${JSON.stringify(sortJsonValue(ReportSchema.parse(report)))}\n`;
}
