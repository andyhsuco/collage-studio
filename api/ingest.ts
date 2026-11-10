// .js specifiers: Vercel emits this file as ingest.js and does not rewrite
// .ts imports, so Node would look for a .ts file that is not in the function bundle.
import { handleIngest } from "../server/handleIngest.js";
import { json } from "../server/http.js";

/**
 * POST /api/ingest — build a collage from image URLs.
 * Authorization: Bearer <INGEST_SECRET>
 * Response 201: { id, viewUrl, editUrl, title, skipped }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    return await handleIngest(request);
  } catch (error) {
    console.error(
      "POST /api/ingest failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Could not ingest the collage." }, 500);
  }
}
