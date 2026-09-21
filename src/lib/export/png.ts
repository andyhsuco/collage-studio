import type { CollageDocument } from "../../types";
import { getCanvasAspect } from "../../types";
import { computeCoverDrawParams, roundRectPath } from "../geometry/crop";
import { resolveAllRects } from "../layout/splitTree";

const imageCache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export async function preloadImages(doc: CollageDocument): Promise<void> {
  await Promise.all(Object.values(doc.images).map((img) => loadImage(img.src)));
}

export async function renderCollageCanvas(
  doc: CollageDocument,
  longEdge = 2048,
): Promise<HTMLCanvasElement | null> {
  if (!doc.layoutTree) return null;

  await preloadImages(doc);

  const aspect = getCanvasAspect(doc);
  let width: number;
  let height: number;

  if (aspect >= 1) {
    width = longEdge;
    height = Math.round(longEdge / aspect);
  } else {
    height = longEdge;
    width = Math.round(longEdge * aspect);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = doc.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const rects = resolveAllRects(doc.layoutTree, doc.gutter, doc.canvasPadding);
  const radius = doc.borderRadius * (width / 800);

  for (const frameId of doc.frameOrder) {
    const frame = doc.frames[frameId];
    const image = doc.images[frame.imageId];
    const rect = rects.get(frameId);
    if (!frame || !image || !rect) continue;

    const img = await loadImage(image.src);
    const px = rect.x * width;
    const py = rect.y * height;
    const pw = rect.width * width;
    const ph = rect.height * height;

    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, radius);
    ctx.clip();

    const { drawX, drawY, drawW, drawH } = computeCoverDrawParams(
      image.naturalWidth,
      image.naturalHeight,
      pw,
      ph,
      frame.cropX,
      frame.cropY,
      frame.zoom,
    );

    ctx.drawImage(img, px + drawX, py + drawY, drawW, drawH);
    ctx.restore();
  }

  return canvas;
}

export async function renderCollageBlob(
  doc: CollageDocument,
  longEdge = 2048,
): Promise<Blob | null> {
  const canvas = await renderCollageCanvas(doc, longEdge);
  if (!canvas) return null;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export async function exportCollagePng(
  doc: CollageDocument,
  longEdge = 2048,
): Promise<void> {
  const blob = await renderCollageBlob(doc, longEdge);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `collage-studio-${Date.now()}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyCollagePngToClipboard(
  doc: CollageDocument,
  longEdge = 2048,
): Promise<boolean> {
  const blob = await renderCollageBlob(doc, longEdge);
  if (!blob || !navigator.clipboard?.write) return false;

  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
  return true;
}

export function clearImageCache() {
  imageCache.clear();
}
