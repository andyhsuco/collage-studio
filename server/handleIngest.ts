import { collageEditPath, collageViewPath } from "../src/lib/route.js";
import type { CollageDocument } from "../src/types/index.js";
import { validateCollageDocument } from "../src/lib/persist/validateDocument.js";
import {
  buildIngestDocument,
  collectIngestImages,
  parseIngestBody,
  type SkippedImage,
} from "./buildIngestDocument.js";
import { createCollageRecord } from "./handleCollage.js";
import { json, jsonError, readJson } from "./http.js";
import { authorizeIngest } from "./ingestAuth.js";
import { deploymentOrigin } from "./origin.js";
import { probeImageUrl, type ProbeResult } from "./probeImage.js";

export interface SavedIngest {
  id: string;
  editToken: string;
  title: string | null;
}

export interface IngestDeps {
  authorize: (request: Request) => Response | null;
  probe: (url: string) => Promise<ProbeResult>;
  save: (input: {
    doc: CollageDocument;
    title: string | null;
    source: string;
  }) => Promise<{ ok: true; collage: SavedIngest } | { ok: false; response: Response }>;
  origin: (request: Request) => string;
}

const defaultDeps: IngestDeps = {
  authorize: authorizeIngest,
  probe: (url) => probeImageUrl(url),
  save: async (input) => {
    const saved = await createCollageRecord(input);
    if (!saved.ok) return saved;
    return {
      ok: true,
      collage: {
        id: saved.collage.id,
        editToken: saved.collage.editToken,
        title: saved.collage.title,
      },
    };
  },
  origin: deploymentOrigin,
};

function noneLoaded(skipped: SkippedImage[]): Response {
  return json({ error: "None of the images could be loaded.", skipped }, 400);
}

/**
 * POST /api/ingest
 * Body: { images: [{ url, name?, sourceUrl? }], title?, canvasRatio?, layout? }
 * Requires Authorization: Bearer <INGEST_SECRET>.
 */
export async function handleIngest(
  request: Request,
  deps: IngestDeps = defaultDeps,
): Promise<Response> {
  const denied = deps.authorize(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = parseIngestBody(body.value);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const { loaded, skipped } = await collectIngestImages(parsed.body.images, deps.probe);
  if (loaded.length === 0) return noneLoaded(skipped);

  const doc = buildIngestDocument(loaded, parsed.body);
  const validated = validateCollageDocument(doc);
  if (!validated.ok) {
    console.error("ingest document failed validation", validated.error);
    return jsonError("Could not build a collage from these images.", 500);
  }

  const saved = await deps.save({
    doc: validated.doc,
    title: parsed.body.title,
    source: "ingest",
  });
  if (!saved.ok) return saved.response;

  const origin = deps.origin(request).replace(/\/+$/, "");
  return json(
    {
      id: saved.collage.id,
      viewUrl: `${origin}${collageViewPath(saved.collage.id)}`,
      editUrl: `${origin}${collageEditPath(saved.collage.id, saved.collage.editToken)}`,
      title: saved.collage.title,
      skipped,
    },
    201,
  );
}
