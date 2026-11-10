import { handleIngest } from "./handleIngest.js";
import { json } from "./http.js";
import { handleCreate, handleRead, handleUpdate } from "./handleCollage.js";

/** Used by the Vite dev server so `/api/collages` and `/api/ingest` hit the same handlers as Vercel. */
export async function routeCollageApi(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/ingest") {
    if (request.method === "POST") return handleIngest(request);
    return json({ error: "Method not allowed." }, 405, { allow: "POST" });
  }

  if (path === "/api/collages") {
    if (request.method === "POST") return handleCreate(request);
    return json({ error: "Method not allowed." }, 405, { allow: "POST" });
  }

  if (/^\/api\/collages\/[^/]+$/.test(path)) {
    if (request.method === "GET") return handleRead(request);
    if (request.method === "PUT" || request.method === "PATCH") return handleUpdate(request);
    return json({ error: "Method not allowed." }, 405, { allow: "GET, PUT, PATCH" });
  }

  return json({ error: "Not found." }, 404);
}
