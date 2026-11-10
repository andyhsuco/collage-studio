import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { imageSize } from "image-size";

export const IMAGE_FETCH_TIMEOUT_MS = 5_000;
export const IMAGE_FETCH_MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;
const ALLOWED_TYPES = new Set(["jpg", "png", "webp", "gif"]);

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.0.0.0", 24, "ipv4");
blocked.addSubnet("192.0.2.0", 24, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4");
blocked.addSubnet("198.51.100.0", 24, "ipv4");
blocked.addSubnet("203.0.113.0", 24, "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addAddress("255.255.255.255", "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

export type ProbeSuccess = { ok: true; width: number; height: number; type: string };
export type ProbeResult = ProbeSuccess | { ok: false; reason: string };

export interface DnsAnswer {
  address: string;
  family: number;
}

export interface ProbeDeps {
  fetch: typeof fetch;
  lookup: (hostname: string) => Promise<DnsAnswer[]>;
  timeoutMs: number;
  maxBytes: number;
}

type ByteRead = ProbeSuccess | "need-more" | "unsupported";

export function defaultProbeDeps(): ProbeDeps {
  return {
    fetch: globalThis.fetch,
    lookup: async (hostname) => {
      const records = await lookup(hostname, { all: true, verbatim: true });
      return records.map((record) => ({ address: record.address, family: record.family }));
    },
    timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
    maxBytes: IMAGE_FETCH_MAX_BYTES,
  };
}

export function isBlockedIp(address: string): boolean {
  const normalized = address.toLowerCase().startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  const family = isIP(normalized);
  if (family === 0) return true;
  return blocked.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

function blockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  return false;
}

/**
 * Public https only. Private, loopback, and link-local addresses are rejected
 * before the request, including after each redirect.
 */
export async function assertPublicImageUrl(
  raw: string,
  resolve: ProbeDeps["lookup"],
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Image URL is invalid." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Image URL must be https." };
  if (url.username || url.password) {
    return { ok: false, reason: "Image URL must not include credentials." };
  }
  if (url.href.length > 2000) return { ok: false, reason: "Image URL is too long." };

  // Node reports IPv6 hostnames with brackets (`[::1]`), which isIP does not accept.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (blockedHostname(hostname)) return { ok: false, reason: "Image host is not allowed." };
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) return { ok: false, reason: "Image host is not allowed." };
    return { ok: true, url: url.toString() };
  }

  let records: DnsAnswer[];
  try {
    records = await resolve(hostname);
  } catch {
    return { ok: false, reason: "Could not resolve the image host." };
  }
  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    return { ok: false, reason: "Image host is not allowed." };
  }
  return { ok: true, url: url.toString() };
}

function looksLikeImage(bytes: Uint8Array): boolean | "need-more" {
  if (bytes.length < 12) return "need-more";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/** jpeg, png, webp, and gif dimensions from header bytes. Incomplete buffers ask for more. */
export function dimensionsFromBytes(bytes: Uint8Array): ByteRead {
  const signature = looksLikeImage(bytes);
  if (signature === "need-more") return "need-more";
  if (!signature) return "unsupported";
  try {
    const result = imageSize(bytes);
    const type = result.type ?? "";
    const width = result.width ?? 0;
    const height = result.height ?? 0;
    if (!ALLOWED_TYPES.has(type)) return "unsupported";
    if (!Number.isFinite(width) || !Number.isFinite(height)) return "need-more";
    if (width < 1 || height < 1 || width > 16384 || height > 16384) return "unsupported";
    return { ok: true, width: Math.round(width), height: Math.round(height), type };
  } catch {
    return "need-more";
  }
}

function contentTypeAllowed(header: string | null): boolean {
  if (!header) return true;
  const type = header.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!type || type === "application/octet-stream" || type === "binary/octet-stream") return true;
  return type === "image/jpeg" || type === "image/jpg" || type === "image/png" || type === "image/webp" || type === "image/gif";
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function readImage(response: Response, maxBytes: number): Promise<ProbeResult> {
  if (!contentTypeAllowed(response.headers.get("content-type"))) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "Image type must be jpeg, png, webp, or gif." };
  }
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, reason: "Image response was empty." };

  const chunks: Uint8Array[] = [];
  let total = 0;
  let result: ProbeResult | null = null;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const room = maxBytes - total;
      const slice = value.byteLength > room ? value.subarray(0, room) : value;
      chunks.push(slice);
      total += slice.byteLength;
      const parsed = dimensionsFromBytes(concat(chunks, total));
      if (parsed === "need-more") continue;
      result =
        parsed === "unsupported"
          ? { ok: false, reason: "Image type must be jpeg, png, webp, or gif." }
          : parsed;
      await reader.cancel().catch(() => undefined);
      break;
    }
  } catch {
    result = { ok: false, reason: "Could not read the image." };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader was already released.
    }
  }
  if (result) return result;

  const parsed = total > 0 ? dimensionsFromBytes(concat(chunks, total)) : "unsupported";
  if (typeof parsed === "object") return parsed;
  if (total >= maxBytes) return { ok: false, reason: "Image is too large to inspect." };
  return { ok: false, reason: "Could not read image dimensions." };
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const error = new Error("Image request timed out.");
    error.name = "TimeoutError";
    controller.abort(error);
  }, ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Fetches just enough of an image to read jpeg, png, webp, or gif dimensions.
 * Stops at `maxBytes` and aborts at `timeoutMs`.
 */
export async function probeImageUrl(raw: string, deps: ProbeDeps = defaultProbeDeps()): Promise<ProbeResult> {
  const timeout = timeoutSignal(deps.timeoutMs);
  let current = raw;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const allowed = await assertPublicImageUrl(current, deps.lookup);
      if (!allowed.ok) return allowed;
      current = allowed.url;

      const response = await deps.fetch(current, {
        signal: timeout.signal,
        redirect: "manual",
        headers: {
          accept: "image/jpeg,image/png,image/webp,image/gif,image/*;q=0.1",
          "user-agent": "CollageStudioIngest/1.0",
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) return { ok: false, reason: "Image redirect was missing a location." };
        if (hop === MAX_REDIRECTS) return { ok: false, reason: "Image URL redirected too many times." };
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return { ok: false, reason: `Image request failed (${response.status}).` };
      }
      return await readImage(response, deps.maxBytes);
    }
    return { ok: false, reason: "Image URL redirected too many times." };
  } catch (error) {
    if (timeout.signal.aborted) return { ok: false, reason: "Image request timed out." };
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "Image request timed out." };
    }
    return { ok: false, reason: "Could not fetch the image." };
  } finally {
    timeout.cancel();
  }
}
