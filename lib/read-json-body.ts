export class RequestBodyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Bound streamed bytes as well as Content-Length (which clients may omit).
export async function readJsonBody(request: Request, maximumBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maximumBytes) {
    throw new RequestBodyError("Request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("Invalid request.", 400);
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new RequestBodyError("Request is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); }
    catch { throw new RequestBodyError("Invalid JSON request.", 400); }
  } finally { reader.releaseLock(); }
}
