import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";

export interface StubLmstudioOptions {
  readonly models?: readonly string[];
  readonly chunks?: readonly string[];
  readonly preflightStatus?: number;
  readonly chatStatus?: number;
  readonly delayMsBetweenChunks?: number;
  readonly closeAfterChunks?: number;
  readonly malformedSse?: boolean;
  readonly emptyStream?: boolean;
}

export interface StubLmstudioHandle {
  readonly baseUrl: string;
  readonly chatRequests: ReadonlyArray<{ method: string; body: unknown }>;
  close(): Promise<void>;
}

export async function startStubLmstudio(
  opts: StubLmstudioOptions = {}
): Promise<StubLmstudioHandle> {
  const requests: Array<{ method: string; body: unknown }> = [];
  const server: Server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/v1/models") {
        handleModels(res, opts);
        return;
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const body = await readJsonBody(req);
        requests.push({ method: req.method, body });
        await handleChat(res, opts);
        return;
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    } catch (error: unknown) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : "unknown stub error");
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    chatRequests: requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

function handleModels(res: ServerResponse, opts: StubLmstudioOptions): void {
  if (opts.preflightStatus !== undefined && opts.preflightStatus !== 200) {
    res.writeHead(opts.preflightStatus, { "content-type": "text/plain; charset=utf-8" });
    res.end(`stub lmstudio preflight failure: ${opts.preflightStatus}`);
    return;
  }

  const models = opts.models ?? ["qwen3-coder-next-mlx-4bit"];
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      object: "list",
      data: models.map((id) => ({
        id,
        object: "model",
        owned_by: "organization_owner"
      }))
    })
  );
}

async function handleChat(res: ServerResponse, opts: StubLmstudioOptions): Promise<void> {
  if (opts.chatStatus !== undefined && opts.chatStatus !== 200) {
    res.writeHead(opts.chatStatus, { "content-type": "text/plain; charset=utf-8" });
    res.end(`stub lmstudio chat failure: ${opts.chatStatus}`);
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  if (opts.malformedSse) {
    res.end("data: {not json\n\n");
    return;
  }

  if (opts.emptyStream) {
    res.end("data: [DONE]\n\n");
    return;
  }

  const chunks = opts.chunks ?? ["stub response"];
  for (const [index, chunk] of chunks.entries()) {
    res.write(sseDataFrame(chunk));
    if (opts.closeAfterChunks !== undefined && index + 1 >= opts.closeAfterChunks) {
      res.write("", () => {
        setTimeout(() => res.socket?.destroy(), 0);
      });
      return;
    }
    if (opts.delayMsBetweenChunks !== undefined && index < chunks.length - 1) {
      await delay(opts.delayMsBetweenChunks);
    }
  }

  res.write(
    `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
    })}\n\n`
  );
  res.end("data: [DONE]\n\n");
}

function sseDataFrame(content: string): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta: { content }, finish_reason: null }]
  })}\n\n`;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return null;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
