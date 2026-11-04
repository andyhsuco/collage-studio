import { MAX_PHOTOS } from "../../types/index.ts";
import type { CollageDocument } from "../../types/index.ts";

const CANVAS_RATIOS = new Set(["1:1", "4:5", "16:9", "9:16", "custom"]);
const DATA_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
  "data:image/gif;base64,",
];

const MAX_SRC_LENGTH = 1_500_000;
const MAX_DOC_BYTES = 4_000_000;
const MAX_ID_LENGTH = 64;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export type ValidationResult =
  | { ok: true; doc: CollageDocument }
  | { ok: false; error: string };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function isAllowedSrc(src: string, name: string): string | null {
  if (src.startsWith("blob:")) {
    return `"${name}" is still a local blob URL. Save from the editor so the photo is embedded, or use an https link.`;
  }
  if (src.length > MAX_SRC_LENGTH) {
    return `"${name}" is too large to store.`;
  }
  if (src.startsWith("https://") || src.startsWith("http://")) {
    try {
      const url = new URL(src);
      if (url.username || url.password) return `"${name}" has a URL with credentials.`;
      if (src.length > 2000) return `"${name}" has a URL that is too long.`;
      return null;
    } catch {
      return `"${name}" has an invalid image URL.`;
    }
  }
  if (DATA_PREFIXES.some((prefix) => src.startsWith(prefix))) return null;
  return `"${name}" must be an https URL or an embedded image.`;
}

function isRect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["x", "y", "width", "height"].every((key) => isFiniteNumber(value[key]));
}

function isSplitNode(value: unknown, depth: number): boolean {
  if (depth > 64 || !isRecord(value)) return false;
  if (value.type === "leaf") return isShortString(value.frameId, MAX_ID_LENGTH);
  if (value.type !== "split") return false;
  if (value.axis !== "h" && value.axis !== "v") return false;
  if (!isFiniteNumber(value.ratio)) return false;
  return isSplitNode(value.a, depth + 1) && isSplitNode(value.b, depth + 1);
}

/**
 * Checks a CollageDocument before it is stored.
 * Extra fields are kept so a later bot can add document data without a migration.
 * Blob URLs are rejected — they only resolve in the browser that created them.
 */
export function validateCollageDocument(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail("Collage document must be an object.");

  const docBytes = utf8Bytes(JSON.stringify(input));
  if (docBytes > MAX_DOC_BYTES) {
    return fail("Collage is too large to store.");
  }

  if (!isRecord(input.images)) return fail("Collage images are missing.");
  const imageIds = Object.keys(input.images);
  if (imageIds.length > MAX_PHOTOS) {
    return fail(`A collage can include at most ${MAX_PHOTOS} photos.`);
  }

  for (const id of imageIds) {
    if (!isShortString(id, MAX_ID_LENGTH)) return fail("An image id is invalid.");
    const image = input.images[id];
    if (!isRecord(image)) return fail("An image is invalid.");
    if (image.id !== id) return fail("An image id does not match its key.");
    if (typeof image.name !== "string" || image.name.length > 300) {
      return fail("An image name is invalid.");
    }
    if (typeof image.src !== "string") return fail(`"${image.name}" is missing an image source.`);
    const srcError = isAllowedSrc(image.src, image.name || id);
    if (srcError) return fail(srcError);
    if (!isFiniteNumber(image.naturalWidth) || image.naturalWidth < 0) {
      return fail(`"${image.name}" has an invalid width.`);
    }
    if (!isFiniteNumber(image.naturalHeight) || image.naturalHeight < 0) {
      return fail(`"${image.name}" has an invalid height.`);
    }
  }

  if (!isRecord(input.frames)) return fail("Collage frames are missing.");
  const frameIds = Object.keys(input.frames);
  if (frameIds.length > MAX_PHOTOS) return fail("Collage has too many frames.");

  for (const id of frameIds) {
    if (!isShortString(id, MAX_ID_LENGTH)) return fail("A frame id is invalid.");
    const frame = input.frames[id];
    if (!isRecord(frame)) return fail("A frame is invalid.");
    if (frame.id !== id) return fail("A frame id does not match its key.");
    if (typeof frame.imageId !== "string" || !(frame.imageId in input.images)) {
      return fail("A frame points at a missing photo.");
    }
    if (!isFiniteNumber(frame.cropX) || !isFiniteNumber(frame.cropY) || !isFiniteNumber(frame.zoom)) {
      return fail("A frame crop is invalid.");
    }
  }

  if (!Array.isArray(input.frameOrder) || input.frameOrder.length > MAX_PHOTOS) {
    return fail("Frame order is invalid.");
  }
  for (const frameId of input.frameOrder) {
    if (typeof frameId !== "string" || !(frameId in input.frames)) {
      return fail("Frame order points at a missing frame.");
    }
  }

  if (input.layoutTree !== null && !isSplitNode(input.layoutTree, 0)) {
    return fail("Layout tree is invalid.");
  }

  if (!isFiniteNumber(input.gutter) || input.gutter < 0 || input.gutter > 0.5) {
    return fail("Gutter is invalid.");
  }
  if (!isFiniteNumber(input.canvasPadding) || input.canvasPadding < 0 || input.canvasPadding > 0.5) {
    return fail("Canvas padding is invalid.");
  }
  if (!isFiniteNumber(input.borderRadius) || input.borderRadius < 0 || input.borderRadius > 200) {
    return fail("Border radius is invalid.");
  }
  if (typeof input.backgroundColor !== "string" || input.backgroundColor.length > 64) {
    return fail("Background color is invalid.");
  }
  if (typeof input.canvasRatio !== "string" || !CANVAS_RATIOS.has(input.canvasRatio)) {
    return fail("Canvas ratio is invalid.");
  }
  if (!isFiniteNumber(input.customWidth) || input.customWidth < 1 || input.customWidth > 8192) {
    return fail("Custom width is invalid.");
  }
  if (!isFiniteNumber(input.customHeight) || input.customHeight < 1 || input.customHeight > 8192) {
    return fail("Custom height is invalid.");
  }
  if (input.gridRows !== null && (!isFiniteNumber(input.gridRows) || input.gridRows < 1)) {
    return fail("Grid rows are invalid.");
  }
  if (input.gridRowGroups !== null) {
    if (!Array.isArray(input.gridRowGroups)) return fail("Grid row groups are invalid.");
    for (const row of input.gridRowGroups) {
      if (!Array.isArray(row) || row.some((id) => typeof id !== "string")) {
        return fail("Grid row groups are invalid.");
      }
    }
  }
  if (!isRecord(input.slideEdits)) return fail("Slide edits are invalid.");
  for (const edit of Object.values(input.slideEdits)) {
    if (!isRecord(edit)) return fail("A slide edit is invalid.");
    if (edit.rotation !== 0 && edit.rotation !== 90 && edit.rotation !== 180 && edit.rotation !== 270) {
      return fail("A slide rotation is invalid.");
    }
    if (!isRect(edit.crop)) return fail("A slide crop is invalid.");
  }

  return { ok: true, doc: input as unknown as CollageDocument };
}
