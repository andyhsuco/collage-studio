export type AppRoute =
  | { kind: "home" }
  | { kind: "collage"; id: string; editToken: string | null };

const ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

/** Routes the SPA understands. `/` is the editor; `/c/:id` is a saved collage. */
export function parseRoute(href: string): AppRoute {
  const url = new URL(href, "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const match = path.match(/^\/c\/([^/]+)$/);
  if (!match?.[1]) return { kind: "home" };

  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return { kind: "home" };
  }
  if (!ID_PATTERN.test(id)) return { kind: "home" };

  const editToken = url.searchParams.get("edit");
  return {
    kind: "collage",
    id,
    editToken: editToken && editToken.length > 0 ? editToken : null,
  };
}

export function collageViewPath(id: string): string {
  return `/c/${id}`;
}

export function collageEditPath(id: string, editToken: string): string {
  return `/c/${id}?edit=${encodeURIComponent(editToken)}`;
}
