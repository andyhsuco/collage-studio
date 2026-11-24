import { json } from "./http.js";
import { deploymentOrigin } from "./origin.js";
import { defaultProxyDeps, fetchPublicImage, type ProbeDeps } from "./probeImage.js";

/**
 * Browsers send `Sec-Fetch-Site` on fetch. A cross-site page must not use this
 * route as an open image proxy. Headerless callers (tests, the dev server) pass.
 */
function allowedCaller(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site")?.trim().toLowerCase() ?? "";
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === deploymentOrigin(request);
  } catch {
    return false;
  }
}

/**
 * GET /api/image-proxy?url=
 * Same-origin image bytes so canvas sampling and PNG export can read pixels
 * when the image host sends no CORS headers.
 */
export async function handleImageProxy(
  request: Request,
  deps: ProbeDeps = defaultProxyDeps(),
): Promise<Response> {
  if (!allowedCaller(request)) {
    return json({ error: "Image proxy is only available to this app." }, 403);
  }

  const target = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  if (!target) return json({ error: "Image URL is required." }, 400);

  const fetched = await fetchPublicImage(target, deps);
  if (!fetched.ok) return json({ error: fetched.reason }, fetched.status);

  return new Response(fetched.bytes, {
    status: 200,
    headers: {
      "content-type": fetched.contentType,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
