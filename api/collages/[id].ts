// .js specifiers match the files Vercel compiles into the Node function.
import { handleRead, handleUpdate } from "../../server/handleCollage.js";
import { json } from "../../server/http.js";

/**
 * GET  /api/collages/:id — public read, never includes edit_token.
 * PUT  /api/collages/:id — update, requires the edit token.
 * PATCH is accepted as an alias of PUT for a later ingest client.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    return await handleRead(request);
  } catch (error) {
    console.error(
      "GET /api/collages/:id failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Could not load the collage." }, 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  return update(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return update(request);
}

async function update(request: Request): Promise<Response> {
  try {
    return await handleUpdate(request);
  } catch (error) {
    console.error(
      "PUT /api/collages/:id failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Could not save the collage." }, 500);
  }
}
