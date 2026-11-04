const MAX_BODY_BYTES = 4_000_000;

export function json(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }
  return Response.json(data, { status, headers });
}

export function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}

export async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError("Collage is too large to store.", 413) };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError("Could not read the request body.", 400) };
  }

  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError("Collage is too large to store.", 413) };
  }

  try {
    return { ok: true, value: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, response: jsonError("Request body must be JSON.", 400) };
  }
}
