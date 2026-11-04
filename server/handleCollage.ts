import { nanoid } from "nanoid";
import { json, jsonError, readJson } from "./http.js";
import { collageIdFromRequest, parseCreateBody, parseUpdateBody } from "./parse.js";
import { toCreatedCollage, toPublicCollage } from "./present.js";
import { getServiceClient } from "./supabase.js";
import { tokensMatch } from "./tokens.js";

interface TokenRow {
  id: string;
  edit_token: string;
}

interface PublicRow {
  id: string;
  doc: unknown;
  title: string | null;
  source: string;
  edit_token: string;
  created_at: string;
  updated_at: string;
}

/**
 * POST /api/collages
 * Body: { doc, title?, source? }
 * `source` defaults to "editor". A later bot can send "bot" on the same route.
 * The edit token is returned only here.
 */
export async function handleCreate(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = parseCreateBody(body.value);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const supabase = getServiceClient();
  if (supabase instanceof Response) return supabase;

  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const id = nanoid(12);
    const editToken = nanoid(32);
    const { error } = await supabase.from("collages").insert({
      id,
      doc: parsed.body.doc,
      title: parsed.body.title,
      source: parsed.body.source,
      edit_token: editToken,
      created_at: now,
      updated_at: now,
    });

    if (!error) {
      return json(
        toCreatedCollage({
          id,
          editToken,
          title: parsed.body.title,
          source: parsed.body.source,
          createdAt: now,
          updatedAt: now,
        }),
        201,
      );
    }

    if (error.code !== "23505") {
      console.error("insert collage failed", error.code);
      return jsonError("Could not save the collage.", 500);
    }
  }

  console.error("insert collage failed", "23505");
  return jsonError("Could not save the collage.", 500);
}

/**
 * GET /api/collages/:id
 * Public. Never returns edit_token.
 * If `x-edit-token` is sent, a match sets canEdit; a mismatch is 403.
 */
export async function handleRead(request: Request): Promise<Response> {
  const id = collageIdFromRequest(request);
  if (!id) return jsonError("Invalid collage id.", 400);

  const supabase = getServiceClient();
  if (supabase instanceof Response) return supabase;

  const { data, error } = await supabase
    .from("collages")
    .select("id, doc, title, source, edit_token, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("read collage failed", error.code);
    return jsonError("Could not load the collage.", 500);
  }
  if (!data) return jsonError("No collage found for this link.", 404);

  const row = data as PublicRow;
  const header = request.headers.get("x-edit-token")?.trim() ?? "";
  if (header && !tokensMatch(row.edit_token, header)) {
    return jsonError("Edit token is invalid.", 403);
  }

  return json(toPublicCollage(row, header.length > 0));
}

/**
 * PUT /api/collages/:id
 * Requires the edit token in `x-edit-token` or JSON `editToken`.
 * Does not rotate the token or change `source`.
 */
export async function handleUpdate(request: Request): Promise<Response> {
  const id = collageIdFromRequest(request);
  if (!id) return jsonError("Invalid collage id.", 400);

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = parseUpdateBody(body.value);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const header = request.headers.get("x-edit-token")?.trim() ?? "";
  const bodyToken = parsed.body.editToken ?? "";
  if (header && bodyToken && header !== bodyToken) {
    return jsonError("Edit token mismatch.", 400);
  }
  const editToken = header || bodyToken;
  if (!editToken) return jsonError("Edit token is required.", 401);

  const supabase = getServiceClient();
  if (supabase instanceof Response) return supabase;

  const existing = await supabase
    .from("collages")
    .select("id, edit_token")
    .eq("id", id)
    .maybeSingle();

  if (existing.error) {
    console.error("read collage token failed", existing.error.code);
    return jsonError("Could not save the collage.", 500);
  }
  if (!existing.data) return jsonError("No collage found for this link.", 404);

  const tokenRow = existing.data as TokenRow;
  if (!tokensMatch(tokenRow.edit_token, editToken)) {
    return jsonError("Edit token is invalid.", 403);
  }

  const updatedAt = new Date().toISOString();
  const patch: { doc: unknown; updated_at: string; title?: string | null } = {
    doc: parsed.body.doc,
    updated_at: updatedAt,
  };
  if (parsed.body.title !== undefined) patch.title = parsed.body.title;

  const { data, error } = await supabase
    .from("collages")
    .update(patch)
    .eq("id", id)
    .select("id, updated_at")
    .maybeSingle();

  if (error || !data) {
    console.error("update collage failed", error?.code ?? "no-row");
    return jsonError("Could not save the collage.", 500);
  }

  return json({ id: data.id, updatedAt: data.updated_at });
}
