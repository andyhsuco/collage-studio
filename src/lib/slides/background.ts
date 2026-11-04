import type { CollageDocument, ImageAsset, SlideBackground } from "../../types/index.ts";

export const DEFAULT_SLIDE_BACKGROUND: SlideBackground = {
  mode: "auto",
  color: "#18181b",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function slideBackgroundFor(
  backgrounds: CollageDocument["slideBackgrounds"] | undefined,
  imageId: string,
): SlideBackground {
  return backgrounds?.[imageId] ?? DEFAULT_SLIDE_BACKGROUND;
}

/** Photos in slide-strip order. */
export function orderedSlideImages(doc: CollageDocument): ImageAsset[] {
  const seen = new Set<string>();
  const images: ImageAsset[] = [];
  for (const frameId of doc.frameOrder) {
    const frame = doc.frames[frameId];
    const image = frame ? doc.images[frame.imageId] : undefined;
    if (!image || seen.has(image.id)) continue;
    seen.add(image.id);
    images.push(image);
  }
  return images;
}

export function clampSlideIndex(doc: CollageDocument, index: number): number {
  const count = orderedSlideImages(doc).length;
  if (count === 0) return 0;
  return Math.min(Math.max(0, index), count - 1);
}

function readBackground(value: unknown): SlideBackground | null {
  if (!isRecord(value)) return null;
  const mode = value.mode ?? value.backgroundMode;
  if (mode !== "auto" && mode !== "custom") return null;
  const colorValue = value.color ?? value.backgroundColor;
  const color =
    typeof colorValue === "string" && colorValue.trim()
      ? colorValue.trim().slice(0, 64)
      : DEFAULT_SLIDE_BACKGROUND.color;
  return { mode, color };
}

/**
 * Global slide background from documents saved before per-slide backgrounds.
 * Accepts `slideBackground` or the background fields on `slideSettings`.
 */
function readLegacySlideBackground(raw: Record<string, unknown>): SlideBackground | null {
  return readBackground(raw.slideBackground) ?? readBackground(raw.slideSettings);
}

/**
 * Fills `slideBackgrounds` and drops a legacy global background.
 * Per-slide entries win. When only a global setting exists, every slide inherits it.
 * With neither, slides stay Auto via {@link slideBackgroundFor}.
 */
export function normalizeCollageDocument(input: CollageDocument): CollageDocument {
  const raw = input as CollageDocument & Record<string, unknown>;
  const doc = structuredClone(input);
  if (!doc.slideBackgrounds || typeof doc.slideBackgrounds !== "object") {
    doc.slideBackgrounds = {};
  }

  const legacy = readLegacySlideBackground(raw);
  if (Object.keys(doc.slideBackgrounds).length === 0 && legacy) {
    for (const imageId of Object.keys(doc.images)) {
      doc.slideBackgrounds[imageId] = { ...legacy };
    }
  }

  const record = doc as CollageDocument & Record<string, unknown>;
  delete record.slideBackground;
  delete record.slideSettings;
  return doc;
}
