import type { CollageDocument } from "../../types/index.ts";
import { normalizeCollageDocument } from "../slides/background.ts";
import { utf8Bytes } from "./validateDocument.ts";

/** Stay under Vercel's 4.5 MB request limit after JSON wrapping. */
const MAX_DOC_BYTES = 3_500_000;

const PASSES = [
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1280, quality: 0.7 },
  { maxEdge: 960, quality: 0.6 },
] as const;

export class PersistSizeError extends Error {
  readonly bytes: number;

  constructor(bytes: number) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    super(
      `This collage is ${mb} MB after compressing photos, which is over the 3.5 MB save limit. Remove a few photos. Uploaded images are stored inside the collage; https links are stored as links.`,
    );
    this.name = "PersistSizeError";
    this.bytes = bytes;
  }
}

function isRemoteSrc(src: string): boolean {
  return src.startsWith("https://") || src.startsWith("http://");
}

function byteSize(doc: CollageDocument): number {
  return utf8Bytes(JSON.stringify(doc));
}

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): string {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function rasterize(
  src: string,
  maxEdge: number,
  quality: number,
): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = longest > 0 ? Math.min(1, maxEdge / longest) : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not read a photo for saving."));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve({
        src: canvasToDataUrl(canvas, ctx, image, width, height, quality),
        width,
        height,
      });
    };
    image.onerror = () => {
      reject(
        new Error(
          "Could not read a photo for saving. If it was pasted or uploaded in this tab, try adding it again.",
        ),
      );
    };
    image.src = src;
  });
}

async function embedLocalImages(
  doc: CollageDocument,
  pass: (typeof PASSES)[number],
  mode: "missing" | "all-local",
): Promise<CollageDocument> {
  const next = structuredClone(doc);
  await Promise.all(
    Object.values(next.images).map(async (image) => {
      if (isRemoteSrc(image.src)) return;
      const isBlob = image.src.startsWith("blob:");
      const isData = image.src.startsWith("data:");
      if (!isBlob && !isData) {
        throw new Error(
          `"${image.name}" can't be saved. Use an uploaded photo or an https image link.`,
        );
      }
      if (mode === "missing" && isData && image.src.length < 400_000) return;

      const encoded = await rasterize(image.src, pass.maxEdge, pass.quality);
      image.src = encoded.src;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        image.naturalWidth = encoded.width;
        image.naturalHeight = encoded.height;
      }
    }),
  );
  return next;
}

/**
 * Local uploads are blob URLs, which die with the tab. Embed them as data URLs
 * so the saved document is enough to reopen the collage. Remote http(s) URLs
 * are kept as links. No object storage.
 */
export async function prepareDocumentForPersistence(
  doc: CollageDocument,
): Promise<CollageDocument> {
  const source = normalizeCollageDocument(doc);
  let next = await embedLocalImages(source, PASSES[0], "missing");
  if (byteSize(next) <= MAX_DOC_BYTES) return next;

  for (const pass of PASSES) {
    next = await embedLocalImages(source, pass, "all-local");
    if (byteSize(next) <= MAX_DOC_BYTES) return next;
  }

  throw new PersistSizeError(byteSize(next));
}
