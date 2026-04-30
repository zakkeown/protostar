import type {
  AdapterContext,
  AdapterEvent,
  AdapterEvidence,
  AdapterFailureReason,
  ExecutionAdapter,
  ExecutionAdapterTaskInput
} from "@protostar/execution";

export type MockCoderMode = "empty-diff" | "ttt-success" | "transient-failure" | "network-drop" | "llm-timeout";

export interface MockCoderAdapterConfig {
  readonly mode?: MockCoderMode;
}

interface PreImage {
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

interface PlanChangeSet {
  readonly entries: readonly PlanChangeSetEntry[];
}

interface PlanChangeSetEntry {
  readonly path: string;
  readonly op: "modify";
  readonly diff: string;
  readonly preImageSha256: string;
}

const textDecoder = new TextDecoder();

const TTT_MOCK_FILES = new Map<string, string>([
  [
    "src/App.tsx",
    `import "./App.css";
import { Card } from "./components/Card";
import { NavBar } from "./components/NavBar";
import { TicTacToeBoard } from "./components/TicTacToeBoard";

function App() {
  return (
    <main className="container">
      <NavBar />
      <Card>
        <TicTacToeBoard />
      </Card>
    </main>
  );
}

export default App;
`
  ],
  [
    "src/components/TicTacToeBoard.tsx",
    `import { useState } from "react";

import { applyTttMove, createInitialTttState } from "../ttt/state";

function statusText(status: ReturnType<typeof createInitialTttState>): string {
  if (status.status === "x-won") return "X wins";
  if (status.status === "o-won") return "O wins";
  if (status.status === "draw") return "Draw";
  return \`Next player: \${status.nextPlayer}\`;
}

export function TicTacToeBoard() {
  const [state, setState] = useState(createInitialTttState);

  return (
    <section data-testid="ttt-board" aria-label="Tic Tac Toe board">
      <p data-testid="ttt-status">{statusText(state)}</p>
      <div role="grid" aria-label="Tic Tac Toe cells">
        {state.board.map((mark, index) => (
          <button
            aria-label={\`Cell \${index + 1}\${mark === null ? "" : \` marked \${mark}\`}\`}
            data-testid={\`ttt-cell-\${index}\`}
            key={index}
            onClick={() => setState((current) => applyTttMove(current, index))}
            type="button"
          >
            {mark ?? ""}
          </button>
        ))}
      </div>
      <button data-testid="ttt-reset" onClick={() => setState(createInitialTttState())} type="button">
        Reset
      </button>
    </section>
  );
}
`
  ],
  [
    "src/ttt/state.ts",
    `export type TttMark = "X" | "O";
export type TttStatus = "playing" | "x-won" | "o-won" | "draw";

export interface TttState {
  readonly board: readonly (TttMark | null)[];
  readonly nextPlayer: TttMark;
  readonly status: TttStatus;
  readonly winningLine: readonly number[] | null;
}

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function createInitialTttState(): TttState {
  return {
    board: Array.from<TttMark | null>({ length: 9 }).fill(null),
    nextPlayer: "X",
    status: "playing",
    winningLine: null,
  };
}

export function applyTttMove(state: TttState, index: number): TttState {
  if (state.status !== "playing" || index < 0 || index >= state.board.length || state.board[index] !== null) {
    return state;
  }

  const board = [...state.board];
  board[index] = state.nextPlayer;
  const winningLine = findWinningLine(board);
  const status = statusAfterMove(board, state.nextPlayer, winningLine);

  return {
    board,
    nextPlayer: status === "playing" ? otherMark(state.nextPlayer) : state.nextPlayer,
    status,
    winningLine,
  };
}

function statusAfterMove(
  board: readonly (TttMark | null)[],
  mark: TttMark,
  winningLine: readonly number[] | null,
): TttStatus {
  if (winningLine !== null) return mark === "X" ? "x-won" : "o-won";
  if (board.every((cell) => cell !== null)) return "draw";
  return "playing";
}

function findWinningLine(board: readonly (TttMark | null)[]): readonly number[] | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    const mark = board[a];
    if (mark !== null && mark === board[b] && mark === board[c]) {
      return line;
    }
  }
  return null;
}

function otherMark(mark: TttMark): TttMark {
  return mark === "X" ? "O" : "X";
}
`
  ],
  [
    "playwright.config.ts",
    `import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm run dev --host 127.0.0.1 --port 1420",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
`
  ]
]);

const MODE_VALUES = new Set<MockCoderMode>([
  "empty-diff",
  "ttt-success",
  "transient-failure",
  "network-drop",
  "llm-timeout"
]);

export function createMockCoderAdapter(config: MockCoderAdapterConfig = {}): ExecutionAdapter {
  const mode = config.mode ?? "ttt-success";
  return {
    id: `mock-coder:${mode}`,
    async *execute(task, ctx) {
      yield* executeMockTask(task, ctx, mode);
    }
  };
}

export function parseMockCoderMode(value: string | undefined): MockCoderMode {
  if (value === undefined || value.length === 0) return "ttt-success";
  if (MODE_VALUES.has(value as MockCoderMode)) return value as MockCoderMode;
  throw new Error(`Unsupported PROTOSTAR_MOCK_LLM_MODE "${value}".`);
}

async function* executeMockTask(
  task: ExecutionAdapterTaskInput,
  ctx: AdapterContext,
  mode: MockCoderMode
): AsyncIterable<AdapterEvent> {
  const startedAt = Date.now();
  switch (mode) {
    case "empty-diff":
      yield { kind: "progress", message: "mock deterministic empty-diff" };
      yield finalChangeSet({ entries: [] }, mode, startedAt);
      return;
    case "ttt-success":
      yield { kind: "progress", message: "mock deterministic ttt-success" };
      yield finalChangeSet(await deterministicChangeSet(task, ctx), mode, startedAt);
      return;
    case "transient-failure":
      yield { kind: "progress", message: "mock transient-failure" };
      yield finalFailure("retries-exhausted", mode, startedAt, "mock-transient-failure");
      return;
    case "network-drop":
      yield { kind: "progress", message: "adapter-network-refusal: mock network-drop" };
      yield finalFailure("lmstudio-unreachable", mode, startedAt, "adapter-network-refusal");
      return;
    case "llm-timeout":
      yield { kind: "progress", message: "llm-abort-timeout: waiting for adapter AbortSignal" };
      await waitForAbort(ctx.signal);
      yield finalFailure(ctx.signal.reason === "timeout" ? "timeout" : "aborted", mode, startedAt, "llm-abort-timeout");
      return;
  }
}

async function deterministicChangeSet(task: ExecutionAdapterTaskInput, ctx: AdapterContext): Promise<PlanChangeSet> {
  const targets = isTttTask(task) ? task.targetFiles : task.targetFiles.slice(0, 1);
  if (targets.length === 0) {
    return { entries: [] };
  }

  const entries: PlanChangeSetEntry[] = [];
  for (const target of targets) {
    const preImage = await readPreImage(target, ctx);
    const originalText = textDecoder.decode(preImage.bytes);
    const modifiedText = desiredTextFor(target, originalText, task);
    if (modifiedText === originalText) continue;
    entries.push({
      path: target,
      op: "modify",
      diff: fullReplacementPatch(target, originalText, modifiedText),
      preImageSha256: preImage.sha256
    });
  }

  return {
    entries
  };
}

async function readPreImage(path: string, ctx: AdapterContext): Promise<PreImage> {
  return ctx.repoReader.readFile(path);
}

function desiredTextFor(path: string, originalText: string, task: ExecutionAdapterTaskInput): string {
  const tttText = isTttTask(task) ? TTT_MOCK_FILES.get(path) : undefined;
  if (tttText !== undefined) return tttText;

  const marker = "Protostar mock deterministic change";
  if (originalText.includes(marker)) return originalText;
  if (path.endsWith(".css")) return appendLine(originalText, `/* ${marker} */`);
  return appendLine(originalText, `// ${marker}`);
}

function appendLine(text: string, line: string): string {
  if (text.length === 0) return `${line}\n`;
  return `${text}${text.endsWith("\n") ? "" : "\n"}${line}\n`;
}

function fullReplacementPatch(path: string, originalText: string, modifiedText: string): string {
  const originalLines = patchLines(originalText);
  const modifiedLines = patchLines(modifiedText);
  const originalStart = originalLines.length === 0 ? 0 : 1;
  const modifiedStart = modifiedLines.length === 0 ? 0 : 1;
  return [
    `--- ${path}`,
    `+++ ${path}`,
    `@@ -${originalStart},${originalLines.length} +${modifiedStart},${modifiedLines.length} @@`,
    ...originalLines.map((line) => `-${line}`),
    ...modifiedLines.map((line) => `+${line}`),
    ""
  ].join("\n");
}

function patchLines(text: string): readonly string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

function isTttTask(task: ExecutionAdapterTaskInput): boolean {
  const targets = new Set(task.targetFiles);
  return targets.has("src/ttt/state.ts") && targets.has("src/components/TicTacToeBoard.tsx");
}

function finalChangeSet(changeSet: PlanChangeSet, mode: MockCoderMode, startedAt: number): AdapterEvent {
  return {
    kind: "final",
    result: {
      outcome: "change-set",
      changeSet: changeSet as never,
      evidence: evidence(mode, startedAt, 1, [])
    }
  };
}

function finalFailure(
  reason: AdapterFailureReason,
  mode: MockCoderMode,
  startedAt: number,
  mechanism: string
): AdapterEvent {
  return {
    kind: "final",
    result: {
      outcome: "adapter-failed",
      reason,
      evidence: evidence(mode, startedAt, 1, [
        {
          attempt: 1,
          retryReason: "transient",
          errorClass: mechanism,
          durationMs: 0
        }
      ])
    }
  };
}

function evidence(
  mode: MockCoderMode,
  startedAt: number,
  attempts: number,
  retries: AdapterEvidence["retries"]
): AdapterEvidence {
  return {
    model: `mock-llm-adapter/${mode}`,
    attempts,
    durationMs: Math.max(0, Date.now() - startedAt),
    auxReads: [],
    retries
  };
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
