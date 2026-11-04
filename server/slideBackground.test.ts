import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultDocument } from "../src/types/index.ts";
import { validateCollageDocument } from "../src/lib/persist/validateDocument.ts";
import {
  normalizeCollageDocument,
  slideBackgroundFor,
} from "../src/lib/slides/background.ts";

function withPhotos() {
  const doc = createDefaultDocument();
  doc.images = {
    a: { id: "a", src: "https://example.com/a.jpg", name: "a.jpg", naturalWidth: 10, naturalHeight: 10 },
    b: { id: "b", src: "https://example.com/b.jpg", name: "b.jpg", naturalWidth: 10, naturalHeight: 10 },
  };
  doc.frames = {
    fa: { id: "fa", imageId: "a", cropX: 0.5, cropY: 0.5, zoom: 1 },
    fb: { id: "fb", imageId: "b", cropX: 0.5, cropY: 0.5, zoom: 1 },
  };
  doc.frameOrder = ["fa", "fb"];
  return doc;
}

test("missing slide backgrounds stay Auto and still validate", () => {
  const doc = withPhotos();
  delete (doc as { slideBackgrounds?: unknown }).slideBackgrounds;
  const validated = validateCollageDocument(doc);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const normalized = normalizeCollageDocument(validated.doc);
  assert.equal(slideBackgroundFor(normalized.slideBackgrounds, "a").mode, "auto");
  assert.equal(slideBackgroundFor(normalized.slideBackgrounds, "b").mode, "auto");
});

test("a legacy global background is copied onto every slide", () => {
  const doc = withPhotos() as ReturnType<typeof withPhotos> & {
    slideSettings: { backgroundMode: "custom"; backgroundColor: "#112233"; imageScale: 0.9 };
  };
  delete (doc as { slideBackgrounds?: unknown }).slideBackgrounds;
  doc.slideSettings = {
    backgroundMode: "custom",
    backgroundColor: "#112233",
    imageScale: 0.9,
  };

  const normalized = normalizeCollageDocument(doc);
  assert.deepEqual(normalized.slideBackgrounds.a, { mode: "custom", color: "#112233" });
  assert.deepEqual(normalized.slideBackgrounds.b, { mode: "custom", color: "#112233" });
  assert.equal("slideSettings" in normalized, false);
});

test("existing per-slide backgrounds are kept", () => {
  const doc = withPhotos() as ReturnType<typeof withPhotos> & {
    slideBackground: { mode: "custom"; color: "#ffffff" };
  };
  doc.slideBackgrounds = {
    a: { mode: "custom", color: "#abcdef" },
  };
  doc.slideBackground = { mode: "custom", color: "#ffffff" };

  const normalized = normalizeCollageDocument(doc);
  assert.deepEqual(normalized.slideBackgrounds.a, { mode: "custom", color: "#abcdef" });
  assert.equal(normalized.slideBackgrounds.b, undefined);
  assert.equal(slideBackgroundFor(normalized.slideBackgrounds, "b").mode, "auto");
  assert.equal("slideBackground" in normalized, false);
});

test("an invalid slide background mode is rejected", () => {
  const doc = withPhotos();
  doc.slideBackgrounds = { a: { mode: "rainbow" as "auto", color: "#fff" } };
  const validated = validateCollageDocument(doc);
  assert.equal(validated.ok, false);
});
