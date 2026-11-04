import { handleCreate } from "../server/handleCollage.ts";
import { json } from "../server/http.ts";

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
