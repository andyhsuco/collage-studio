import { createHash, timingSafeEqual } from "node:crypto";
import { jsonError } from "./http.js";

const MAX_TOKEN_LENGTH = 512;

/**
 * Compares two strings without leaking the length or a matching prefix.
 * Both sides are hashed to a fixed digest first, so timingSafeEqual always
 * sees equal-length buffers.
 */
export function secretsMatch(expected: string, provided: string): boolean {
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

/**
 * Fail closed. A missing INGEST_SECRET is 503, not an open route.
 * A missing or wrong bearer token is 401.
 */
export function authorizeIngest(request: Request): Response | null {
  const secret = process.env.INGEST_SECRET?.trim() ?? "";
  if (!secret) {
    return jsonError("Ingest is not configured. Set INGEST_SECRET.", 503);
  }
  const token = bearerToken(request.headers.get("authorization"));
  if (!token || !secretsMatch(secret, token)) {
    return jsonError("Unauthorized.", 401);
  }
  return null;
}
