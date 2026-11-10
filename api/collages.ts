// .js specifiers: Vercel emits this file as collages.js and does not rewrite
// .ts imports, so Node would look for a .ts file that is not in the function bundle.
import { handleCreate } from "../server/handleCollage.js";
import { json } from "../server/http.js";

/**
 * POST /api/collages — create a collage.
 * Response: { id, editToken, title, source, createdAt, updatedAt }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    return await handleCreate(request);
  } catch (error) {
    console.error(
      "POST /api/collages failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Could not save the collage." }, 500);
  }
}
