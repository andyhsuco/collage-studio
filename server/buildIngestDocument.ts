import { nanoid } from "nanoid";
import { getBestLayout } from "../src/lib/layout/autoLayout.js";
import { computeSmartOrganizePlan } from "../src/lib/layout/smartOrganize.js";
import {
  buildFilledGridTree,
  buildGridTreeFromRowGroups,
  columnEqual,
  rowEqual,
} from "../src/lib/layout/templates.js";
import {
  createDefaultDocument,
  getCanvasAspect,
  MAX_PHOTOS,
  type CanvasRatio,
  type CollageDocument,
  type SplitNode,
} from "../src/types/index.js";
import { normalizeTitle } from "./parse.js";
import type { ProbeResult } from "./probeImage.js";

export const LAYOUT_HINTS = ["auto", "best", "grid", "row", "column"] as const;
export type LayoutHint = (typeof LAYOUT_HINTS)[number];

const CANVAS_RATIOS: readonly CanvasRatio[] = ["1:1", "4:5", "16:9", "9:16", "custom"];

export interface IngestImageInput {
  url: string;
  name?: string;
  sourceUrl?: string;
}

export interface IngestRequest {
  images: IngestImageInput[];
  title: string | null;
  canvasRatio: CanvasRatio;
  customWidth: number;
  customHeight: number;
  layout: LayoutHint;
}

export interface LoadedImage {
  url: string;
  name: string;
  sourceUrl?: string;
  width: number;
  height: number;
}

export interface SkippedImage {
  url: string;
  reason: string;
}

export interface IdFactory {
  imageId: () => string;
  frameId: () => string;
}

const defaultIds: IdFactory = {
  imageId: () => nanoid(),
  frameId: () => nanoid(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanName(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127) continue;
    out += char;
  }
  return out.trim().slice(0, 300);
}

export function filenameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    return cleanName(last) || "photo";
  } catch {
    return "photo";
  }
}

function optionalHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isCanvasRatio(value: string): value is CanvasRatio {
  return (CANVAS_RATIOS as readonly string[]).includes(value);
}

function isLayoutHint(value: string): value is LayoutHint {
  return (LAYOUT_HINTS as readonly string[]).includes(value);
}

export function parseIngestBody(
  value: unknown,
): { ok: true; body: IngestRequest } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "Request body must be a JSON object." };
  if (!Array.isArray(value.images)) return { ok: false, error: "images must be an array." };
  if (value.images.length === 0) {
    return { ok: false, error: "images must include at least one image." };
  }
  if (value.images.length > MAX_PHOTOS) {
    return { ok: false, error: `A collage can include at most ${MAX_PHOTOS} photos.` };
  }

  const images: IngestImageInput[] = [];
  for (const item of value.images) {
    if (!isRecord(item)) return { ok: false, error: "Each image must be an object." };
    if (typeof item.url !== "string" || !item.url.trim()) {
      return { ok: false, error: "Each image needs a url." };
    }
    if (item.name != null && typeof item.name !== "string") {
      return { ok: false, error: "Image name must be a string." };
    }
    if (item.sourceUrl != null && typeof item.sourceUrl !== "string") {
      return { ok: false, error: "Image sourceUrl must be a string." };
    }

    const image: IngestImageInput = { url: item.url.trim() };
    if (typeof item.name === "string") {
      const name = cleanName(item.name);
      if (name) image.name = name;
    }
    if (typeof item.sourceUrl === "string" && item.sourceUrl.trim()) {
      const sourceUrl = optionalHttpUrl(item.sourceUrl);
      if (!sourceUrl) {
        return {
          ok: false,
          error: "Image sourceUrl must be an http(s) URL without credentials.",
        };
      }
      image.sourceUrl = sourceUrl;
    }
    images.push(image);
  }

  const title = normalizeTitle(value.title);
  if (!title.ok) return title;

  let canvasRatio: CanvasRatio = "1:1";
  if (value.canvasRatio != null) {
    if (typeof value.canvasRatio !== "string" || !isCanvasRatio(value.canvasRatio)) {
      return { ok: false, error: "canvasRatio must be 1:1, 4:5, 16:9, 9:16, or custom." };
    }
    canvasRatio = value.canvasRatio;
  }

  let customWidth = 1080;
  let customHeight = 1080;
  if (value.customWidth != null) {
    if (
      typeof value.customWidth !== "number" ||
      !Number.isFinite(value.customWidth) ||
      value.customWidth < 1 ||
      value.customWidth > 8192
    ) {
      return { ok: false, error: "customWidth must be a number from 1 to 8192." };
    }
    customWidth = Math.round(value.customWidth);
  }
  if (value.customHeight != null) {
    if (
      typeof value.customHeight !== "number" ||
      !Number.isFinite(value.customHeight) ||
      value.customHeight < 1 ||
      value.customHeight > 8192
    ) {
      return { ok: false, error: "customHeight must be a number from 1 to 8192." };
    }
    customHeight = Math.round(value.customHeight);
  }

  let layout: LayoutHint = "auto";
  if (value.layout != null) {
    if (typeof value.layout !== "string" || !isLayoutHint(value.layout)) {
      return { ok: false, error: "layout must be auto, best, grid, row, or column." };
    }
    layout = value.layout;
  }

  return {
    ok: true,
    body: { images, title: title.title, canvasRatio, customWidth, customHeight, layout },
  };
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function collectIngestImages(
  images: readonly IngestImageInput[],
  probe: (url: string) => Promise<ProbeResult>,
): Promise<{ loaded: LoadedImage[]; skipped: SkippedImage[] }> {
  const probed = await mapPool(images, 6, async (image) => {
    try {
      return { image, result: await probe(image.url) };
    } catch {
      return { image, result: { ok: false as const, reason: "Could not fetch the image." } };
    }
  });

  const loaded: LoadedImage[] = [];
  const skipped: SkippedImage[] = [];
  for (const entry of probed) {
    if (!entry.result.ok) {
      skipped.push({ url: entry.image.url, reason: entry.result.reason });
      continue;
    }
    const provided = entry.image.name?.trim();
    loaded.push({
      url: entry.image.url,
      name: provided || filenameFromUrl(entry.image.url),
      ...(entry.image.sourceUrl ? { sourceUrl: entry.image.sourceUrl } : {}),
      width: entry.result.width,
      height: entry.result.height,
    });
  }
  return { loaded, skipped };
}

function frameIdsIn(node: SplitNode | null): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.frameId];
  return [...frameIdsIn(node.a), ...frameIdsIn(node.b)];
}

function covers(node: SplitNode | null, frameIds: readonly string[]): boolean {
  const leaves = frameIdsIn(node);
  if (leaves.length !== frameIds.length) return false;
  const found = new Set(leaves);
  return frameIds.every((id) => found.has(id));
}

function applyLayout(doc: CollageDocument, layout: LayoutHint): void {
  const count = doc.frameOrder.length;
  if (count === 0) {
    doc.layoutTree = null;
    return;
  }
  if (count === 1) {
    doc.layoutTree = { type: "leaf", frameId: doc.frameOrder[0] ?? "" };
    return;
  }

  const aspect = getCanvasAspect(doc);
  const useTree = (tree: SplitNode | null) => {
    doc.layoutTree = covers(tree, doc.frameOrder)
      ? tree
      : buildFilledGridTree(doc.frameOrder, aspect);
  };

  if (layout === "row") {
    useTree(rowEqual(doc.frameOrder));
    return;
  }
  if (layout === "column") {
    useTree(columnEqual(doc.frameOrder));
    return;
  }
  if (layout === "grid") {
    useTree(buildFilledGridTree(doc.frameOrder, aspect));
    return;
  }
  if (layout === "best") {
    const best = getBestLayout(
      doc.frameOrder,
      doc.canvasRatio,
      doc.customWidth,
      doc.customHeight,
    );
    useTree(best?.tree ?? buildFilledGridTree(doc.frameOrder, aspect));
    return;
  }

  const plan = computeSmartOrganizePlan(doc);
  if (!plan) {
    useTree(buildFilledGridTree(doc.frameOrder, aspect));
    return;
  }
  doc.gridRows = plan.rows;
  doc.gridRowGroups = plan.rowGroups.map((row) => [...row]);
  doc.frameOrder = doc.gridRowGroups.flat();
  const tree = buildGridTreeFromRowGroups(doc.gridRowGroups);
  doc.layoutTree = covers(tree, doc.frameOrder) ? tree : buildFilledGridTree(doc.frameOrder, aspect);
}

/**
 * Builds a CollageDocument the editor can open.
 * `layout: "auto"` uses the same Smart organize grid as the editor.
 * Defaults match createDefaultDocument, including canvas ratio 1:1,
 * empty slideEdits, and empty slideBackgrounds.
 */
export function buildIngestDocument(
  loaded: readonly LoadedImage[],
  options: Pick<IngestRequest, "canvasRatio" | "customWidth" | "customHeight" | "layout">,
  ids: IdFactory = defaultIds,
): CollageDocument {
  const doc = createDefaultDocument();
  doc.canvasRatio = options.canvasRatio;
  doc.customWidth = options.customWidth;
  doc.customHeight = options.customHeight;
  doc.slideEdits = {};
  doc.slideBackgrounds = {};

  for (const image of loaded) {
    const imageId = ids.imageId();
    const frameId = ids.frameId();
    doc.images[imageId] = {
      id: imageId,
      src: image.url,
      name: image.name,
      naturalWidth: image.width,
      naturalHeight: image.height,
    };
    if (image.sourceUrl) {
      Object.assign(doc.images[imageId], { sourceUrl: image.sourceUrl });
    }
    doc.frames[frameId] = {
      id: frameId,
      imageId,
      cropX: 0.5,
      cropY: 0.5,
      zoom: 1,
    };
    doc.frameOrder.push(frameId);
  }

  applyLayout(doc, options.layout);
  return doc;
}
