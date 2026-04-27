export async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncIterable<{ readonly data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        yield* drainCompleteEvents(buffer);
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const event = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const data = parseEventData(event);
        if (data !== undefined) {
          yield { data };
          if (data === "[DONE]") return;
        }
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function* drainCompleteEvents(buffer: string): Iterable<{ readonly data: string }> {
  let remaining = buffer;
  let separatorIndex = remaining.indexOf("\n\n");
  while (separatorIndex !== -1) {
    const event = remaining.slice(0, separatorIndex);
    remaining = remaining.slice(separatorIndex + 2);
    const data = parseEventData(event);
    if (data !== undefined) {
      yield { data };
      if (data === "[DONE]") return;
    }
    separatorIndex = remaining.indexOf("\n\n");
  }
}

function parseEventData(event: string): string | undefined {
  const dataLines = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => {
      const payload = line.slice("data:".length);
      return payload.startsWith(" ") ? payload.slice(1) : payload;
    });

  if (dataLines.length === 0) {
    return undefined;
  }

  const data = dataLines.join("\n");
  return data.length === 0 ? undefined : data;
}
