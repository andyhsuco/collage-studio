const cache = new Map<string, string>();

function toHex(channel: number): string {
  return Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0");
}

/** Most frequent color after coarse quantization, averaged within that bucket. */
export function dominantColor(img: HTMLImageElement, cacheKey = img.src): string {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const fallback = "#18181b";
  if (!img.naturalWidth || !img.naturalHeight) {
    return fallback;
  }

  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;

  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const buckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key =
      ((data[i] >> 5) << 10) | ((data[i + 1] >> 5) << 5) | (data[i + 2] >> 5);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
    } else {
      buckets.set(key, {
        count: 1,
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
      });
    }
  }

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }

  if (!best || best.count === 0) return fallback;

  const color = `#${toHex(Math.round(best.r / best.count))}${toHex(Math.round(best.g / best.count))}${toHex(Math.round(best.b / best.count))}`;
  cache.set(cacheKey, color);
  return color;
}
