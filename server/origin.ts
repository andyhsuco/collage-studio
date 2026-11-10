const HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*(?::\d{1,5})?$/i;

function firstHeader(request: Request, name: string): string {
  return request.headers.get(name)?.split(",")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Origin of the deployment that received the request.
 * View and edit links are absolute so a caller on another host can open them.
 */
export function deploymentOrigin(request: Request): string {
  const forwardedHost = firstHeader(request, "x-forwarded-host");
  if (HOST.test(forwardedHost)) {
    const proto = firstHeader(request, "x-forwarded-proto") === "http" ? "http" : "https";
    return `${proto}://${forwardedHost}`;
  }

  const vercel = process.env.VERCEL_URL?.trim().toLowerCase() ?? "";
  if (HOST.test(vercel)) return `https://${vercel}`;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().toLowerCase() ?? "";
  if (HOST.test(production)) return `https://${production}`;

  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost";
  }
}
