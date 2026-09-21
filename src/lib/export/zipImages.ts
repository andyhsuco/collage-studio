import JSZip from "jszip";
import type { CollageDocument, ImageAsset } from "../../types";

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "png";
  }
}

function fileNameForImage(image: ImageAsset, index: number, mime: string): string {
  const base = image.name.trim();
  if (base && /\.[a-z0-9]+$/i.test(base)) {
    return base;
  }
  const ext = extensionFromMime(mime);
  if (base) return `${base}.${ext}`;
  return `photo-${String(index + 1).padStart(2, "0")}.${ext}`;
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const match = name.match(/^(.*?)(\.[^.]+)?$/);
  const stem = match?.[1] ?? name;
  const ext = match?.[2] ?? "";
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n += 1;
  const next = `${stem}-${n}${ext}`;
  used.add(next);
  return next;
}

function orderedImages(doc: CollageDocument): ImageAsset[] {
  const seen = new Set<string>();
  const ordered: ImageAsset[] = [];

  for (const frameId of doc.frameOrder) {
    const imageId = doc.frames[frameId]?.imageId;
    const image = imageId ? doc.images[imageId] : undefined;
    if (!image || seen.has(image.id)) continue;
    seen.add(image.id);
    ordered.push(image);
  }

  for (const image of Object.values(doc.images)) {
    if (seen.has(image.id)) continue;
    ordered.push(image);
  }

  return ordered;
}

export async function downloadImagesZip(doc: CollageDocument): Promise<void> {
  const images = orderedImages(doc);
  if (images.length === 0) return;

  const zip = new JSZip();
  const usedNames = new Set<string>();

  await Promise.all(
    images.map(async (image, index) => {
      const response = await fetch(image.src);
      const blob = await response.blob();
      const name = uniqueName(
        fileNameForImage(image, index, blob.type),
        usedNames,
      );
      zip.file(name, blob);
    }),
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `collage-studio-photos-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
