import { z } from "zod";

import { sortJsonValue } from "./canonical-json.js";

export const StressShapeSchema = z.enum(["sustained-load", "concurrency", "fault-injection"]);
export const StressOutcomeSchema = z.enum(["pass", "failed", "blocked", "cancelled", "orphaned", "wedge"]);

const CiVerdictSchema = z.enum(["success", "failure", "timeout", "skipped"]);
const IsoDateTimeSchema = z.string().datetime({ offset: true });

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema)
  ])
);

const StressArchetypeRollupSchema = z.object({
  archetype: z.string().min(1),
  runs: z.number().int().nonnegative(),
  passes: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  met: z.boolean()
}).strict().superRefine((rollup, ctx) => {
  if (rollup.passes > rollup.runs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["passes"],
      message: "passes must be less than or equal to runs"
    });
  }
});

const StressRunSchema = z.object({
  runId: z.string().min(1),
  seedId: z.string().min(1),
  archetype: z.string().min(1),
  outcome: StressOutcomeSchema,
  prUrl: z.string().url().optional(),
  ciVerdict: CiVerdictSchema.optional(),
  durationMs: z.number().int().nonnegative(),
  faultInjected: z.string().min(1).optional()
}).strict();

const WedgeEventSchema = z.object({
  runId: z.string().min(1),
  detectedAt: IsoDateTimeSchema,
  reason: z.string().min(1)
}).strict();

const CapBreachedSchema = z.object({
  kind: z.enum(["run-count", "wall-clock"]),
  value: z.number().finite().nonnegative(),
  limit: z.number().finite().nonnegative()
}).strict();

export const StressReportSchema = z.object({
  sessionId: z.string().min(1),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema,
  totalRuns: z.number().int().nonnegative(),
  headlessMode: z.string().min(1),
  llmBackend: z.string().min(1),
  shape: StressShapeSchema,
  perArchetype: z.array(StressArchetypeRollupSchema),
  perRun: z.array(StressRunSchema),
  wedgeEvent: WedgeEventSchema.optional(),
  capBreached: CapBreachedSchema.optional()
}).strict().superRefine((report, ctx) => {
  if (report.totalRuns !== report.perRun.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalRuns"],
      message: "totalRuns must match perRun length"
    });
  }
});

export const StressEventSchema = z.object({
  sessionId: z.string().min(1),
  sequence: z.number().int().positive(),
  at: IsoDateTimeSchema,
  type: z.string().min(1),
  payload: z.record(JsonValueSchema)
}).strict();

export type StressShape = z.infer<typeof StressShapeSchema>;
export type StressOutcome = z.infer<typeof StressOutcomeSchema>;
export type StressReport = z.infer<typeof StressReportSchema>;
export type StressEvent = z.infer<typeof StressEventSchema>;

export function parseStressReport(input: unknown): StressReport {
  return StressReportSchema.parse(input);
}

export function formatStressReport(report: StressReport): string {
  return `${JSON.stringify(sortJsonValue(StressReportSchema.parse(report)))}\n`;
}

export function parseStressEvent(input: unknown): StressEvent {
  return StressEventSchema.parse(input);
}

export function formatStressEventLine(event: StressEvent): string {
  return `${JSON.stringify(sortJsonValue(StressEventSchema.parse(event)))}\n`;
}
