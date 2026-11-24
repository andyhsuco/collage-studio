// .js specifiers: Vercel emits this file as image-proxy.js and does not rewrite
// .ts imports, so Node would look for a .ts file that is not in the function bundle.
import { handleImageProxy } from "../server/handleImageProxy.js";
import { json } from "../server/http.js";

/**
 * GET /api/image-proxy?url= — same-origin image bytes for canvas reads.
 * Used when a remote photo sends no CORS headers.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    return await handleImageProxy(request);
  } catch (error) {
    console.error(
      "GET /api/image-proxy failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Could not fetch the image." }, 500);
  }
}
