import type { CollageDocument, ImageAsset, ImageEdit } from "../../types";
import { getCanvasAspect } from "../../types";
import { dominantColor } from "../color/dominant";
import { computeCoverDrawParams, roundRectPath } from "../geometry/crop";
import {
  editedSize,
  fitSize,
  IDENTITY_EDIT,
  rotatedSize,
} from "../geometry/imageEdit";
import { resolveAllRects } from "../layout/splitTree";
import {
  clampSlideIndex,
  orderedSlideImages,
  slideBackgroundFor,
} from "../slides/background";

const imageCache = new Map<string, HTMLImageElement>();
const readableLoads = new Map<string, Promise<HTMLImageElement>>();

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

function loadElement(src: string, anonymous: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image."));
    img.src = src;
  });
}

/** True when getImageData can read this bitmap. A tainted canvas returns false. */
function bitmapIsReadable(img: HTMLImageElement): boolean {
  if (!img.naturalWidth || !img.naturalHeight) return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(img, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function remoteUrl(src: string): boolean {
  return src.startsWith("https://") || src.startsWith("http://");
}

async function loadViaProxy(src: string): Promise<HTMLImageElement> {
  const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(src)}`);
  if (!response.ok) throw new Error("Image proxy failed.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("Image proxy was empty.");
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadElement(objectUrl, false);
    if (!bitmapIsReadable(img)) throw new Error("Image proxy was unreadable.");
    return img;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function loadReadableUncached(src: string): Promise<HTMLImageElement> {
  if (!remoteUrl(src)) {
    const img = await loadElement(src, false);
    if (!bitmapIsReadable(img)) throw new Error("Image was unreadable.");
    return img;
  }

  try {
    const img = await loadElement(src, true);
    if (bitmapIsReadable(img)) return img;
  } catch {
    // The host sent no CORS headers, or the browser cached an opaque response.
  }

  if (!src.startsWith("https://")) throw new Error("Could not read the image.");
  return loadViaProxy(src);
}

/**
 * Image whose pixels can be read. Remote urls load with `crossOrigin="anonymous"`
 * and, if that taints the canvas, through the same-origin image proxy.
 * Failures are not cached.
 */
export function loadReadableImage(src: string): Promise<HTMLImageElement> {
  const existing = readableLoads.get(src);
  if (existing) return existing;

  const pending = loadReadableUncached(src).catch((error: unknown) => {
    readableLoads.delete(src);
    throw error;
  });
  readableLoads.set(src, pending);
  return pending;
}

export async function preloadImages(doc: CollageDocument): Promise<void> {
  await Promise.all(
    Object.values(doc.images).map((img) => loadReadableImage(img.src).catch(() => undefined)),
  );
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
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

    const px = rect.x * width;
    const py = rect.y * height;
    const pw = rect.width * width;
    const ph = rect.height * height;

    let img: HTMLImageElement;
    try {
      img = await loadReadableImage(image.src);
    } catch {
      ctx.fillStyle = "#27272a";
      ctx.fillRect(px, py, pw, ph);
      continue;
    }

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
  return canvasToPngBlob(canvas);
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

async function slideFill(
  doc: CollageDocument,
  image: ImageAsset,
): Promise<string> {
  const background = slideBackgroundFor(doc.slideBackgrounds, image.id);
  if (background.mode === "custom") return background.color;
  try {
    const img = await loadReadableImage(image.src);
    return dominantColor(img, image.src);
  } catch {
    return "#18181b";
  }
}

function drawEditedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  image: ImageAsset,
  edit: ImageEdit,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  radius: number,
) {
  ctx.save();
  roundRectPath(ctx, dx, dy, dw, dh, radius);
  ctx.clip();

  const rotated = rotatedSize(image, edit.rotation);
  const scale = rotated.width * edit.crop.width > 0
    ? dw / (rotated.width * edit.crop.width)
    : 1;
  const rotatedW = rotated.width * scale;
  const rotatedH = rotated.height * scale;
  const imageW = image.naturalWidth * scale;
  const imageH = image.naturalHeight * scale;
  const left = dx - edit.crop.x * rotatedW + (rotatedW - imageW) / 2;
  const top = dy - edit.crop.y * rotatedH + (rotatedH - imageH) / 2;

  ctx.translate(left + imageW / 2, top + imageH / 2);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.drawImage(img, -imageW / 2, -imageH / 2, imageW, imageH);
  ctx.restore();
}

/** One 16:9 slide, using that slide's own background. */
export async function renderSlideCanvas(
  doc: CollageDocument,
  index: number,
  appearance: { imageScale: number; cornerRadius: number },
  longEdge = 2048,
): Promise<HTMLCanvasElement | null> {
  const slides = orderedSlideImages(doc);
  const image = slides[clampSlideIndex(doc, index)];
  if (!image) return null;

  const width = longEdge;
  const height = Math.round((longEdge * 9) / 16);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = await slideFill(doc, image);
  ctx.fillRect(0, 0, width, height);

  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    const edit = doc.slideEdits[image.id] ?? IDENTITY_EDIT;
    const natural = editedSize(image, edit);
    const boxW = width * appearance.imageScale;
    const boxH = height * appearance.imageScale;
    const size = fitSize(natural.width, natural.height, boxW, boxH);
    try {
      const img = await loadReadableImage(image.src);
      drawEditedImage(
        ctx,
        img,
        image,
        edit,
        (width - size.width) / 2,
        (height - size.height) / 2,
        size.width,
        size.height,
        appearance.cornerRadius * (width / 800),
      );
    } catch {
      // Leave the background fill. Drawing an unreadable image would taint the export.
    }
  }

  return canvas;
}

async function slideBlob(
  doc: CollageDocument,
  index: number,
  appearance: { imageScale: number; cornerRadius: number },
): Promise<Blob | null> {
  const canvas = await renderSlideCanvas(doc, index, appearance);
  if (!canvas) return null;
  return canvasToPngBlob(canvas);
}

export async function exportSlidePng(
  doc: CollageDocument,
  index: number,
  appearance: { imageScale: number; cornerRadius: number },
): Promise<void> {
  const blob = await slideBlob(doc, index, appearance);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `collage-studio-slide-${clampSlideIndex(doc, index) + 1}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copySlidePngToClipboard(
  doc: CollageDocument,
  index: number,
  appearance: { imageScale: number; cornerRadius: number },
): Promise<boolean> {
  const blob = await slideBlob(doc, index, appearance);
  if (!blob || !navigator.clipboard?.write) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return true;
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
  readableLoads.clear();
}
