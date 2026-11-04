import type { CollageDocument } from "../../types/index.ts";
import { normalizeCollageDocument } from "../slides/background.ts";
import { validateCollageDocument } from "./validateDocument.ts";

export class PersistRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PersistRequestError";
    this.status = status;
  }
}

export interface SavedCollage {
  id: string;
  title: string | null;
  source: string;
  doc: CollageDocument;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedCollage {
  id: string;
  editToken: string;
  title: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new PersistRequestError("Could not reach the server.", 0);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : response.status === 404
          ? "No collage found for this link."
          : "Collage API is unavailable.";
    throw new PersistRequestError(message, response.status);
  }

  if (!isRecord(payload)) {
    throw new PersistRequestError(
      "Collage API is unavailable. Run npm run dev, or deploy the /api routes on Vercel.",
      response.status,
    );
  }
  return payload;
}

export async function createCollage(doc: CollageDocument): Promise<CreatedCollage> {
  const payload = await request("/api/collages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ doc, source: "editor" }),
  });
  if (typeof payload.id !== "string" || typeof payload.editToken !== "string") {
    throw new PersistRequestError("Collage API returned an unexpected response.", 500);
  }
  return {
    id: payload.id,
    editToken: payload.editToken,
    title: typeof payload.title === "string" ? payload.title : null,
    source: typeof payload.source === "string" ? payload.source : "editor",
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : "",
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
  };
}

export async function updateCollage(
  id: string,
  editToken: string,
  doc: CollageDocument,
): Promise<void> {
  await request(`/api/collages/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-edit-token": editToken,
    },
    body: JSON.stringify({ doc }),
  });
}

export async function fetchCollage(
  id: string,
  editToken?: string | null,
): Promise<SavedCollage> {
  const headers: Record<string, string> = {};
  if (editToken) headers["x-edit-token"] = editToken;
  const payload = await request(`/api/collages/${encodeURIComponent(id)}`, { headers });
  const validated = validateCollageDocument(payload.doc);
  if (!validated.ok || typeof payload.id !== "string") {
    throw new PersistRequestError("This collage could not be read.", 500);
  }
  return {
    id: payload.id,
    title: typeof payload.title === "string" ? payload.title : null,
    source: typeof payload.source === "string" ? payload.source : "editor",
    doc: normalizeCollageDocument(validated.doc),
    canEdit: payload.canEdit === true,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : "",
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
  };
}
