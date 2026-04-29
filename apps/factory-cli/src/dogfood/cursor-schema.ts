import { sortJsonValue } from "@protostar/artifacts/canonical-json";
import { z } from "zod";

export const DogfoodOutcomeSchema = z.enum([
  "pr-ready",
  "no-pr",
  "ci-timeout",
  "ci-failed",
  "run-failed"
]);

export const CursorRunSchema = z.object({
  runId: z.string().min(1),
  seedId: z.string().min(1),
  outcome: DogfoodOutcomeSchema,
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true })
}).strict();

export const CursorSchema = z.object({
  sessionId: z.string().min(1),
  totalRuns: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  runs: z.array(CursorRunSchema)
}).strict().superRefine((cursor, ctx) => {
  if (cursor.completed > cursor.totalRuns) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completed"],
      message: "completed must be less than or equal to totalRuns"
    });
  }
  if (cursor.completed !== cursor.runs.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["runs"],
      message: "runs length must match completed"
    });
  }
});

export type DogfoodOutcome = z.infer<typeof DogfoodOutcomeSchema>;
export type CursorRun = z.infer<typeof CursorRunSchema>;
export type Cursor = z.infer<typeof CursorSchema>;

export function parseCursor(input: unknown): Cursor {
  return CursorSchema.parse(input);
}

export function formatCursor(cursor: Cursor): string {
  return `${JSON.stringify(sortJsonValue(CursorSchema.parse(cursor)))}\n`;
}
