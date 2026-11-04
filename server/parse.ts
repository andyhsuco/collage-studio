import type { CollageDocument } from "../src/types/index.ts";
import { validateCollageDocument } from "../src/lib/persist/validateDocument.ts";

const SOURCE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeTitle(
  value: unknown,
): { ok: true; title: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, title: null };
  if (typeof value !== "string") return { ok: false, error: "Title must be a string." };
  const title = value.trim();
  if (!title) return { ok: true, title: null };
  if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer." };
  return { ok: true, title };
}

export function normalizeSource(
  value: unknown,
): { ok: true; source: string } | { ok: false; error: string } {
  if (value == null) return { ok: true, source: "editor" };
  if (typeof value !== "string" || !SOURCE_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Source must be a short lowercase id such as editor or bot.",
    };
  }
  return { ok: true, source: value };
}

export type CreateBody = {
  doc: CollageDocument;
  title: string | null;
  source: string;
};

export function parseCreateBody(
  value: unknown,
): { ok: true; body: CreateBody } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "Request body must be a JSON object." };
  const doc = validateCollageDocument(value.doc);
  if (!doc.ok) return doc;
  const title = normalizeTitle(value.title);
  if (!title.ok) return title;
  const source = normalizeSource(value.source);
  if (!source.ok) return source;
  return {
    ok: true,
    body: { doc: doc.doc, title: title.title, source: source.source },
  };
}

export type UpdateBody = {
  doc: CollageDocument;
  title: string | null | undefined;
  editToken: string | null;
};

export function parseUpdateBody(
  value: unknown,
): { ok: true; body: UpdateBody } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "Request body must be a JSON object." };
  const doc = validateCollageDocument(value.doc);
  if (!doc.ok) return doc;

  let title: string | null | undefined;
  if ("title" in value) {
    const normalized = normalizeTitle(value.title);
    if (!normalized.ok) return normalized;
    title = normalized.title;
  }

  const editToken =
    typeof value.editToken === "string" && value.editToken.trim()
      ? value.editToken.trim()
      : null;

  return { ok: true, body: { doc: doc.doc, title, editToken } };
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

export function collageIdFromRequest(request: Request): string | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  const match = pathname.match(/^\/api\/collages\/([^/]+)$/);
  if (!match?.[1]) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}
