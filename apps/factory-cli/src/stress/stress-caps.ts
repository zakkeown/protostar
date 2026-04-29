export type StressCapShape = "sustained-load" | "concurrency" | "fault-injection" | "ttt-delivery";
export type StressCapKind = "run-count" | "wall-clock";
export type StressCapSource = "cli" | "factory.stress.caps" | "q03-default";

export interface FactoryStressCapsConfig {
  readonly tttDelivery: {
    readonly maxAttempts: number;
    readonly maxWallClockDays: number;
  };
  readonly sustainedLoad: {
    readonly maxRuns: number;
    readonly maxWallClockDays: number;
  };
  readonly concurrency: {
    readonly maxSessions: number;
    readonly maxWallClockDays: number;
  };
  readonly faultInjection: {
    readonly maxFaults: number;
    readonly maxWallClockDays: number;
  };
}

export interface SustainedLoadResolvedCaps {
  readonly shape: "sustained-load";
  readonly maxRuns: number;
  readonly maxWallClockDays: number;
}

export interface ConcurrencyResolvedCaps {
  readonly shape: "concurrency";
  readonly maxSessions: number;
  readonly maxWallClockDays: number;
}

export interface FaultInjectionResolvedCaps {
  readonly shape: "fault-injection";
  readonly maxFaults: number;
  readonly maxWallClockDays: number;
}

export interface TttDeliveryResolvedCaps {
  readonly shape: "ttt-delivery";
  readonly maxAttempts: number;
  readonly maxWallClockDays: number;
}

export interface ResolvedStressCaps {
  readonly "sustained-load": SustainedLoadResolvedCaps;
  readonly concurrency: ConcurrencyResolvedCaps;
  readonly "fault-injection": FaultInjectionResolvedCaps;
  readonly "ttt-delivery": TttDeliveryResolvedCaps;
  readonly sources: {
    readonly "sustained-load": {
      readonly maxRuns: StressCapSource;
      readonly maxWallClockDays: StressCapSource;
    };
    readonly concurrency: {
      readonly maxSessions: StressCapSource;
      readonly maxWallClockDays: StressCapSource;
    };
    readonly "fault-injection": {
      readonly maxFaults: StressCapSource;
      readonly maxWallClockDays: StressCapSource;
    };
    readonly "ttt-delivery": {
      readonly maxAttempts: StressCapSource;
      readonly maxWallClockDays: StressCapSource;
    };
  };
}

export interface StressCapBreach {
  readonly kind: StressCapKind;
  readonly value: number;
  readonly limit: number;
  readonly shape: StressCapShape;
}

export interface ResolveStressCapsInput {
  readonly cli?: Partial<{
    readonly "sustained-load": Partial<Omit<SustainedLoadResolvedCaps, "shape">>;
    readonly concurrency: Partial<Omit<ConcurrencyResolvedCaps, "shape">>;
    readonly "fault-injection": Partial<Omit<FaultInjectionResolvedCaps, "shape">>;
    readonly "ttt-delivery": Partial<Omit<TttDeliveryResolvedCaps, "shape">>;
  }>;
  readonly config?: FactoryStressCapsConfig;
}

export const Q03_STRESS_CAP_DEFAULTS = Object.freeze({
  "sustained-load": Object.freeze({
    shape: "sustained-load",
    maxRuns: 500,
    maxWallClockDays: 7
  }),
  concurrency: Object.freeze({
    shape: "concurrency",
    maxSessions: 20,
    maxWallClockDays: 3
  }),
  "fault-injection": Object.freeze({
    shape: "fault-injection",
    maxFaults: 100,
    maxWallClockDays: 3
  }),
  "ttt-delivery": Object.freeze({
    shape: "ttt-delivery",
    maxAttempts: 50,
    maxWallClockDays: 14
  })
} satisfies Omit<ResolvedStressCaps, "sources">);

export function resolveStressCaps(input: ResolveStressCapsInput): ResolvedStressCaps {
  const sustainedLoad = {
    shape: "sustained-load" as const,
    maxRuns: resolveNumber({
      cli: input.cli?.["sustained-load"]?.maxRuns,
      config: input.config?.sustainedLoad.maxRuns,
      fallback: Q03_STRESS_CAP_DEFAULTS["sustained-load"].maxRuns
    }).value,
    maxWallClockDays: resolveNumber({
      cli: input.cli?.["sustained-load"]?.maxWallClockDays,
      config: input.config?.sustainedLoad.maxWallClockDays,
      fallback: Q03_STRESS_CAP_DEFAULTS["sustained-load"].maxWallClockDays
    }).value
  };
  const concurrency = {
    shape: "concurrency" as const,
    maxSessions: resolveNumber({
      cli: input.cli?.concurrency?.maxSessions,
      config: input.config?.concurrency.maxSessions,
      fallback: Q03_STRESS_CAP_DEFAULTS.concurrency.maxSessions
    }).value,
    maxWallClockDays: resolveNumber({
      cli: input.cli?.concurrency?.maxWallClockDays,
      config: input.config?.concurrency.maxWallClockDays,
      fallback: Q03_STRESS_CAP_DEFAULTS.concurrency.maxWallClockDays
    }).value
  };
  const faultInjection = {
    shape: "fault-injection" as const,
    maxFaults: resolveNumber({
      cli: input.cli?.["fault-injection"]?.maxFaults,
      config: input.config?.faultInjection.maxFaults,
      fallback: Q03_STRESS_CAP_DEFAULTS["fault-injection"].maxFaults
    }).value,
    maxWallClockDays: resolveNumber({
      cli: input.cli?.["fault-injection"]?.maxWallClockDays,
      config: input.config?.faultInjection.maxWallClockDays,
      fallback: Q03_STRESS_CAP_DEFAULTS["fault-injection"].maxWallClockDays
    }).value
  };
  const tttDelivery = {
    shape: "ttt-delivery" as const,
    maxAttempts: resolveNumber({
      cli: input.cli?.["ttt-delivery"]?.maxAttempts,
      config: input.config?.tttDelivery.maxAttempts,
      fallback: Q03_STRESS_CAP_DEFAULTS["ttt-delivery"].maxAttempts
    }).value,
    maxWallClockDays: resolveNumber({
      cli: input.cli?.["ttt-delivery"]?.maxWallClockDays,
      config: input.config?.tttDelivery.maxWallClockDays,
      fallback: Q03_STRESS_CAP_DEFAULTS["ttt-delivery"].maxWallClockDays
    }).value
  };

  return {
    "sustained-load": sustainedLoad,
    concurrency,
    "fault-injection": faultInjection,
    "ttt-delivery": tttDelivery,
    sources: {
      "sustained-load": {
        maxRuns: resolveNumber({
          cli: input.cli?.["sustained-load"]?.maxRuns,
          config: input.config?.sustainedLoad.maxRuns,
          fallback: Q03_STRESS_CAP_DEFAULTS["sustained-load"].maxRuns
        }).source,
        maxWallClockDays: resolveNumber({
          cli: input.cli?.["sustained-load"]?.maxWallClockDays,
          config: input.config?.sustainedLoad.maxWallClockDays,
          fallback: Q03_STRESS_CAP_DEFAULTS["sustained-load"].maxWallClockDays
        }).source
      },
      concurrency: {
        maxSessions: resolveNumber({
          cli: input.cli?.concurrency?.maxSessions,
          config: input.config?.concurrency.maxSessions,
          fallback: Q03_STRESS_CAP_DEFAULTS.concurrency.maxSessions
        }).source,
        maxWallClockDays: resolveNumber({
          cli: input.cli?.concurrency?.maxWallClockDays,
          config: input.config?.concurrency.maxWallClockDays,
          fallback: Q03_STRESS_CAP_DEFAULTS.concurrency.maxWallClockDays
        }).source
      },
      "fault-injection": {
        maxFaults: resolveNumber({
          cli: input.cli?.["fault-injection"]?.maxFaults,
          config: input.config?.faultInjection.maxFaults,
          fallback: Q03_STRESS_CAP_DEFAULTS["fault-injection"].maxFaults
        }).source,
        maxWallClockDays: resolveNumber({
          cli: input.cli?.["fault-injection"]?.maxWallClockDays,
          config: input.config?.faultInjection.maxWallClockDays,
          fallback: Q03_STRESS_CAP_DEFAULTS["fault-injection"].maxWallClockDays
        }).source
      },
      "ttt-delivery": {
        maxAttempts: resolveNumber({
          cli: input.cli?.["ttt-delivery"]?.maxAttempts,
          config: input.config?.tttDelivery.maxAttempts,
          fallback: Q03_STRESS_CAP_DEFAULTS["ttt-delivery"].maxAttempts
        }).source,
        maxWallClockDays: resolveNumber({
          cli: input.cli?.["ttt-delivery"]?.maxWallClockDays,
          config: input.config?.tttDelivery.maxWallClockDays,
          fallback: Q03_STRESS_CAP_DEFAULTS["ttt-delivery"].maxWallClockDays
        }).source
      }
    }
  };
}

export function detectStressCapBreach(input: {
  readonly shape: StressCapShape;
  readonly count: number;
  readonly startedAt: string;
  readonly now?: string;
  readonly caps: ResolvedStressCaps;
}): StressCapBreach | null {
  const countLimit = runCountLimit(input.caps, input.shape);
  if (input.count > countLimit) {
    return {
      kind: "run-count",
      value: input.count,
      limit: countLimit,
      shape: input.shape
    };
  }

  const wallClockDays = Math.ceil((Date.parse(input.now ?? new Date().toISOString()) - Date.parse(input.startedAt)) / 86_400_000);
  const wallClockLimit = wallClockLimitDays(input.caps, input.shape);
  if (Number.isFinite(wallClockDays) && wallClockDays > wallClockLimit) {
    return {
      kind: "wall-clock",
      value: wallClockDays,
      limit: wallClockLimit,
      shape: input.shape
    };
  }

  return null;
}

function resolveNumber(input: {
  readonly cli: number | undefined;
  readonly config: number | undefined;
  readonly fallback: number;
}): { readonly value: number; readonly source: StressCapSource } {
  if (input.cli !== undefined) {
    return { value: input.cli, source: "cli" };
  }
  if (input.config !== undefined) {
    return { value: input.config, source: "factory.stress.caps" };
  }
  return { value: input.fallback, source: "q03-default" };
}

function runCountLimit(caps: ResolvedStressCaps, shape: StressCapShape): number {
  switch (shape) {
    case "sustained-load":
      return caps["sustained-load"].maxRuns;
    case "concurrency":
      return caps.concurrency.maxSessions;
    case "fault-injection":
      return caps["fault-injection"].maxFaults;
    case "ttt-delivery":
      return caps["ttt-delivery"].maxAttempts;
  }
}

function wallClockLimitDays(caps: ResolvedStressCaps, shape: StressCapShape): number {
  switch (shape) {
    case "sustained-load":
      return caps["sustained-load"].maxWallClockDays;
    case "concurrency":
      return caps.concurrency.maxWallClockDays;
    case "fault-injection":
      return caps["fault-injection"].maxWallClockDays;
    case "ttt-delivery":
      return caps["ttt-delivery"].maxWallClockDays;
  }
}
