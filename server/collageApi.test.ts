import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDefaultDocument } from "../src/types/index.ts";
import { parseRoute } from "../src/lib/route.ts";
import { validateCollageDocument } from "../src/lib/persist/validateDocument.ts";
import { parseCreateBody, parseUpdateBody } from "./parse.ts";
import { toPublicCollage } from "./present.ts";
import { tokensMatch } from "./tokens.ts";

function validDoc() {
  const doc = createDefaultDocument();
  doc.images = {
    img1: {
      id: "img1",
      src: "https://example.com/a.jpg",
      name: "a.jpg",
      naturalWidth: 1000,
      naturalHeight: 800,
    },
  };
  doc.frames = {
    frame1: { id: "frame1", imageId: "img1", cropX: 0.5, cropY: 0.5, zoom: 1 },
  };
  doc.frameOrder = ["frame1"];
  return doc;
}

test("parseRoute reads view and edit links", () => {
  assert.deepEqual(parseRoute("https://collage.test/"), { kind: "home" });
  assert.deepEqual(parseRoute("https://collage.test/c/abcdefghijkl"), {
    kind: "collage",
    id: "abcdefghijkl",
    editToken: null,
  });
  assert.deepEqual(parseRoute("https://collage.test/c/abcdefghijkl?edit=token_123"), {
    kind: "collage",
    id: "abcdefghijkl",
    editToken: "token_123",
  });
  assert.deepEqual(parseRoute("https://collage.test/c/short"), { kind: "home" });
});

test("validateCollageDocument accepts https sources and rejects blob urls", () => {
  const ok = validateCollageDocument(validDoc());
  assert.equal(ok.ok, true);

  const blob = validDoc();
  blob.images.img1.src = "blob:http://localhost/11111111-1111-1111-1111-111111111111";
  const rejected = validateCollageDocument(blob);
  assert.equal(rejected.ok, false);

  const extra = validDoc() as unknown as Record<string, unknown>;
  extra.futureField = { ok: true };
  const kept = validateCollageDocument(extra);
  assert.equal(kept.ok, true);
  if (kept.ok) {
    assert.equal((kept.doc as unknown as { futureField: { ok: boolean } }).futureField.ok, true);
  }
});

test("create body defaults source and update can carry an edit token", () => {
  const created = parseCreateBody({ doc: validDoc() });
  assert.equal(created.ok, true);
  if (created.ok) assert.equal(created.body.source, "editor");

  const bot = parseCreateBody({ doc: validDoc(), source: "bot", title: " Night " });
  assert.equal(bot.ok, true);
  if (bot.ok) {
    assert.equal(bot.body.source, "bot");
    assert.equal(bot.body.title, "Night");
  }

  const updated = parseUpdateBody({ doc: validDoc(), editToken: "secret-token-value" });
  assert.equal(updated.ok, true);
  if (updated.ok) assert.equal(updated.body.editToken, "secret-token-value");
});

test("public collage payload never includes the edit token", () => {
  const payload = toPublicCollage(
    {
      id: "abcdefghijkl",
      doc: validDoc(),
      title: null,
      source: "editor",
      created_at: "2026-11-04T00:00:00.000Z",
      updated_at: "2026-11-04T00:00:00.000Z",
    },
    false,
  );
  assert.equal("edit_token" in payload, false);
  assert.equal("editToken" in payload, false);
  assert.equal(payload.canEdit, false);
});

test("token comparison rejects different lengths", () => {
  assert.equal(tokensMatch("abcdefghijklmnop", "abcdefghijklmnop"), true);
  assert.equal(tokensMatch("abcdefghijklmnop", "abcdefghijklmnoX"), false);
  assert.equal(tokensMatch("abcdefghijklmnop", "short"), false);
  assert.equal(tokensMatch("", ""), false);
});

test("migration locks the table to the service role", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261104120000_create_collages.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.collages from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.collages to service_role/i);
  assert.doesNotMatch(sql, /create policy/i);
});
