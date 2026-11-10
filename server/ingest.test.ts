import assert from "node:assert/strict";
import test from "node:test";
import type { SplitNode } from "../src/types/index.ts";
import { createDefaultDocument, MAX_PHOTOS } from "../src/types/index.ts";
import { validateCollageDocument } from "../src/lib/persist/validateDocument.ts";
import {
  normalizeCollageDocument,
  slideBackgroundFor,
} from "../src/lib/slides/background.ts";
import { POST } from "../api/ingest.ts";
import {
  buildIngestDocument,
  collectIngestImages,
  parseIngestBody,
  type LoadedImage,
} from "./buildIngestDocument.ts";
import { handleIngest, type IngestDeps } from "./handleIngest.ts";
import { authorizeIngest, secretsMatch } from "./ingestAuth.ts";
import { deploymentOrigin } from "./origin.ts";
import {
  assertPublicImageUrl,
  dimensionsFromBytes,
  isBlockedIp,
  probeImageUrl,
  type ProbeDeps,
} from "./probeImage.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUSEhIVFhUVGBcYGBgYGBgYGBgYGBgYGBgYGBgYHSggGBolHRcVITEhJSkrLi4uGB8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAQABAAMBIgACEQEDEQH/xAAnAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKCxEAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A/QAA/9k=",
  "base64",
);
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const WEBP = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");

function leaves(node: SplitNode | null): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.frameId];
  return [...leaves(node.a), ...leaves(node.b)];
}

function sequentialIds() {
  let image = 0;
  let frame = 0;
  return {
    imageId: () => `img${(image += 1)}`,
    frameId: () => `frame${(frame += 1)}`,
  };
}

function photo(overrides: Partial<LoadedImage> & Pick<LoadedImage, "url">): LoadedImage {
  return {
    name: "photo.jpg",
    width: 1000,
    height: 800,
    ...overrides,
  };
}

function publicLookup(address = "1.1.1.1"): ProbeDeps["lookup"] {
  return async () => [{ address, family: address.includes(":") ? 6 : 4 }];
}

test("secretsMatch ignores length and authorizeIngest fails closed", async () => {
  assert.equal(secretsMatch("ingest-dev-secret", "ingest-dev-secret"), true);
  assert.equal(secretsMatch("ingest-dev-secret", "ingest-dev-secret-x"), false);
  assert.equal(secretsMatch("short", "a-much-longer-wrong-token"), false);

  const previous = process.env.INGEST_SECRET;
  try {
    delete process.env.INGEST_SECRET;
    const unconfigured = await POST(
      new Request("https://collage.test/api/ingest", {
        method: "POST",
        body: "not-json",
      }),
    );
    assert.equal(unconfigured.status, 503);

    process.env.INGEST_SECRET = "ingest-dev-secret";
    const missing = authorizeIngest(new Request("https://collage.test/api/ingest"));
    assert.equal(missing?.status, 401);
    const wrong = authorizeIngest(
      new Request("https://collage.test/api/ingest", {
        headers: { authorization: "Bearer wrong-token" },
      }),
    );
    assert.equal(wrong?.status, 401);
    const extra = authorizeIngest(
      new Request("https://collage.test/api/ingest", {
        headers: { authorization: "Bearer ingest-dev-secret extra" },
      }),
    );
    assert.equal(extra?.status, 401);
    const ok = authorizeIngest(
      new Request("https://collage.test/api/ingest", {
        headers: { authorization: "bearer ingest-dev-secret" },
      }),
    );
    assert.equal(ok, null);
  } finally {
    if (previous === undefined) delete process.env.INGEST_SECRET;
    else process.env.INGEST_SECRET = previous;
  }
});

test("parseIngestBody defaults ratio and layout and rejects a bad request", () => {
  const parsed = parseIngestBody({
    title: " Night ",
    images: [{ url: " https://cdn.test/a.jpg ", name: " A ", sourceUrl: "https://src.test/a" }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.body.title, "Night");
  assert.equal(parsed.body.canvasRatio, "1:1");
  assert.equal(parsed.body.layout, "auto");
  assert.equal(parsed.body.images[0]?.url, "https://cdn.test/a.jpg");
  assert.equal(parsed.body.images[0]?.name, "A");
  assert.equal(parsed.body.images[0]?.sourceUrl, "https://src.test/a");

  const tooMany = parseIngestBody({
    images: Array.from({ length: MAX_PHOTOS + 1 }, (_, index) => ({
      url: `https://cdn.test/${index}.jpg`,
    })),
  });
  assert.equal(tooMany.ok, false);

  const badRatio = parseIngestBody({
    images: [{ url: "https://cdn.test/a.jpg" }],
    canvasRatio: "square",
  });
  assert.equal(badRatio.ok, false);

  const badSource = parseIngestBody({
    images: [{ url: "https://cdn.test/a.jpg", sourceUrl: "javascript:alert(1)" }],
  });
  assert.equal(badSource.ok, false);
});

test("dimensionsFromBytes reads jpeg png webp and gif headers", () => {
  assert.deepEqual(dimensionsFromBytes(PNG), { ok: true, width: 1, height: 1, type: "png" });
  const gif = dimensionsFromBytes(GIF);
  assert.equal(typeof gif === "object" && gif.ok && gif.width, 1);
  assert.equal(typeof gif === "object" && gif.ok && gif.height, 1);
  assert.equal(typeof gif === "object" && gif.ok && gif.type, "gif");

  const jpeg = dimensionsFromBytes(JPEG);
  assert.equal(typeof jpeg === "object" && jpeg.ok && jpeg.width, 256);
  assert.equal(typeof jpeg === "object" && jpeg.ok && jpeg.height, 256);
  assert.equal(typeof jpeg === "object" && jpeg.ok && jpeg.type, "jpg");

  const webp = dimensionsFromBytes(WEBP);
  assert.equal(typeof webp === "object" && webp.ok && webp.type, "webp");

  assert.equal(dimensionsFromBytes(JPEG.subarray(0, 4)), "need-more");
  assert.equal(dimensionsFromBytes(Buffer.from("<!doctype html><html></html>")), "unsupported");
});

test("probe rejects private hosts and reads a public png", async () => {
  assert.equal(isBlockedIp("127.0.0.1"), true);
  assert.equal(isBlockedIp("10.1.2.3"), true);
  assert.equal(isBlockedIp("169.254.169.254"), true);
  assert.equal(isBlockedIp("::1"), true);
  assert.equal(isBlockedIp("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIp("fd12::1"), true);
  assert.equal(isBlockedIp("8.8.8.8"), false);

  let lookups = 0;
  let fetches = 0;
  const blocked = await assertPublicImageUrl("https://localhost/a.png", async () => {
    lookups += 1;
    return [{ address: "127.0.0.1", family: 4 }];
  });
  assert.equal(blocked.ok, false);
  assert.equal(lookups, 0);

  const http = await assertPublicImageUrl("http://cdn.test/a.png", publicLookup());
  assert.equal(http.ok, false);
  const creds = await assertPublicImageUrl("https://user:pass@cdn.test/a.png", publicLookup());
  assert.equal(creds.ok, false);
  const loopback = await assertPublicImageUrl("https://[::1]/a.png", publicLookup());
  assert.equal(loopback.ok, false);

  const deps = (fetch: ProbeDeps["fetch"], lookup: ProbeDeps["lookup"]): ProbeDeps => ({
    fetch,
    lookup,
    timeoutMs: 1000,
    maxBytes: 2_000_000,
  });

  const fetched: string[] = [];
  const ok = await probeImageUrl(
    "https://cdn.test/a.png",
    deps(async (input) => {
      fetches += 1;
      fetched.push(String(input));
      return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
    }, publicLookup()),
  );
  assert.deepEqual(ok, { ok: true, width: 1, height: 1, type: "png" });
  assert.equal(fetches, 1);

  fetches = 0;
  const rebound = await probeImageUrl(
    "https://rebind.test/a.png",
    deps(async () => {
      fetches += 1;
      return new Response(PNG);
    }, async () => [{ address: "127.0.0.1", family: 4 }]),
  );
  assert.equal(rebound.ok, false);
  assert.equal(fetches, 0);

  const redirected = await probeImageUrl(
    "https://cdn.test/start.png",
    deps(async (input) => {
      const url = String(input);
      if (url.includes("start.png")) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/secret.png" },
        });
      }
      throw new Error("followed a private redirect");
    }, publicLookup()),
  );
  assert.equal(redirected.ok, false);

  const followed = await probeImageUrl(
    "https://cdn.test/start.png",
    deps(async (input) => {
      if (String(input).includes("start.png")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://images.test/final.png" },
        });
      }
      return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
    }, publicLookup()),
  );
  assert.equal(followed.ok, true);

  const missing = await probeImageUrl(
    "https://cdn.test/missing.png",
    deps(async () => new Response("nope", { status: 404 }), publicLookup()),
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.reason, /404/);

  const html = await probeImageUrl(
    "https://cdn.test/page",
    deps(
      async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
      publicLookup(),
    ),
  );
  assert.equal(html.ok, false);

  const timedOut = await probeImageUrl("https://cdn.test/slow.png", {
    fetch: (_input, init) =>
      new Promise((_resolve, reject) => {
        const abort = () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
      }),
    lookup: publicLookup(),
    timeoutMs: 30,
    maxBytes: 1000,
  });
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) assert.equal(timedOut.reason, "Image request timed out.");
});

test("probe stops at the size cap when dimensions never appear", async () => {
  const body = new Uint8Array(200);
  body[0] = 0xff;
  body[1] = 0xd8;
  const result = await probeImageUrl("https://cdn.test/huge.jpg", {
    fetch: async () => new Response(body, { status: 200, headers: { "content-type": "image/jpeg" } }),
    lookup: publicLookup(),
    timeoutMs: 1000,
    maxBytes: 64,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "Image is too large to inspect.");
});

test("buildIngestDocument validates and opens with editor defaults", () => {
  const doc = buildIngestDocument(
    [
      photo({
        url: "https://cdn.test/wide.jpg",
        name: "wide.jpg",
        sourceUrl: "https://src.test/wide",
        width: 2000,
        height: 500,
      }),
      photo({ url: "https://cdn.test/tall.jpg", name: "tall.jpg", width: 400, height: 1600 }),
      photo({ url: "https://cdn.test/square.png", name: "square.png", width: 800, height: 800 }),
    ],
    { canvasRatio: "4:5", customWidth: 1080, customHeight: 1080, layout: "auto" },
    sequentialIds(),
  );

  const validated = validateCollageDocument(doc);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  for (const key of Object.keys(createDefaultDocument())) {
    assert.equal(key in validated.doc, true, key);
  }

  assert.equal(validated.doc.canvasRatio, "4:5");
  assert.equal(validated.doc.backgroundColor, "#ffffff");
  assert.deepEqual(validated.doc.slideEdits, {});
  assert.deepEqual(validated.doc.slideBackgrounds, {});
  assert.equal(validated.doc.frameOrder.length, 3);
  assert.deepEqual(leaves(validated.doc.layoutTree).sort(), [...validated.doc.frameOrder].sort());
  assert.equal(validated.doc.gridRows != null && validated.doc.gridRows >= 1, true);
  const wide = validated.doc.images.img1 as { sourceUrl?: string };
  assert.equal(wide.sourceUrl, "https://src.test/wide");
  assert.equal(validated.doc.frames.frame1?.cropX, 0.5);
  assert.equal(validated.doc.frames.frame1?.zoom, 1);

  const normalized = normalizeCollageDocument(validated.doc);
  assert.equal(slideBackgroundFor(normalized.slideBackgrounds, "img1").mode, "auto");
  assert.equal(slideBackgroundFor(normalized.slideBackgrounds, "img2").mode, "auto");

  const row = buildIngestDocument(
    [photo({ url: "https://cdn.test/a.jpg" }), photo({ url: "https://cdn.test/b.jpg" })],
    { canvasRatio: "1:1", customWidth: 1080, customHeight: 1080, layout: "row" },
    sequentialIds(),
  );
  assert.equal(row.layoutTree?.type, "split");
  if (row.layoutTree?.type === "split") assert.equal(row.layoutTree.axis, "v");
  assert.equal(validateCollageDocument(row).ok, true);

  const column = buildIngestDocument(
    [photo({ url: "https://cdn.test/a.jpg" }), photo({ url: "https://cdn.test/b.jpg" })],
    { canvasRatio: "1:1", customWidth: 1080, customHeight: 1080, layout: "column" },
    sequentialIds(),
  );
  assert.equal(column.layoutTree?.type, "split");
  if (column.layoutTree?.type === "split") assert.equal(column.layoutTree.axis, "h");

  const single = buildIngestDocument(
    [photo({ url: "https://cdn.test/only.jpg", width: 640, height: 480 })],
    { canvasRatio: "1:1", customWidth: 1080, customHeight: 1080, layout: "auto" },
    sequentialIds(),
  );
  assert.deepEqual(single.layoutTree, { type: "leaf", frameId: single.frameOrder[0] });
  assert.equal(validateCollageDocument(single).ok, true);

  const best = buildIngestDocument(
    [photo({ url: "https://cdn.test/a.jpg" }), photo({ url: "https://cdn.test/b.jpg" })],
    { canvasRatio: "1:1", customWidth: 1080, customHeight: 1080, layout: "best" },
    sequentialIds(),
  );
  assert.deepEqual(leaves(best.layoutTree).sort(), [...best.frameOrder].sort());
  assert.equal(validateCollageDocument(best).ok, true);
});

test("collectIngestImages keeps order and reports failures", async () => {
  const { loaded, skipped } = await collectIngestImages(
    [
      { url: "https://cdn.test/a.png", name: "  " },
      { url: "https://cdn.test/missing.png" },
      { url: "https://cdn.test/b.png", name: "Bee" },
    ],
    async (url) => {
      if (url.includes("missing")) return { ok: false, reason: "Image request failed (404)." };
      return { ok: true, width: 10, height: 20, type: "png" };
    },
  );
  assert.deepEqual(
    loaded.map((image) => image.name),
    ["a.png", "Bee"],
  );
  assert.equal(loaded[0]?.width, 10);
  assert.deepEqual(skipped, [
    { url: "https://cdn.test/missing.png", reason: "Image request failed (404)." },
  ]);
});

test("handleIngest returns absolute links and skips images that fail", async () => {
  const saved: Array<{ source: string; title: string | null; doc: unknown }> = [];
  let probes = 0;
  const deps = (probe: IngestDeps["probe"], save: IngestDeps["save"]): IngestDeps => ({
    authorize: () => null,
    probe,
    save,
    origin: deploymentOrigin,
  });

  const response = await handleIngest(
    new Request("https://collage-slides-studio.vercel.app/api/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": "collage-slides-studio.vercel.app",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({
        title: " Board ",
        canvasRatio: "4:5",
        images: [
          { url: "https://cdn.test/a.png", name: "A", sourceUrl: "https://src.test/a" },
          { url: "https://cdn.test/missing.png" },
        ],
      }),
    }),
    deps(
      async (url) => {
        probes += 1;
        if (url.includes("missing")) return { ok: false, reason: "Image request failed (404)." };
        return { ok: true, width: 800, height: 1000, type: "png" };
      },
      async (input) => {
        saved.push(input);
        return { ok: true, collage: { id: "abcdefghijkl", editToken: "tok+en", title: input.title } };
      },
    ),
  );

  assert.equal(response.status, 201);
  const payload = (await response.json()) as {
    id: string;
    viewUrl: string;
    editUrl: string;
    title: string | null;
    skipped: Array<{ url: string }>;
  };
  assert.equal(payload.id, "abcdefghijkl");
  assert.equal(payload.viewUrl, "https://collage-slides-studio.vercel.app/c/abcdefghijkl");
  assert.equal(
    payload.editUrl,
    "https://collage-slides-studio.vercel.app/c/abcdefghijkl?edit=tok%2Ben",
  );
  assert.equal(payload.title, "Board");
  assert.deepEqual(payload.skipped, [{ url: "https://cdn.test/missing.png", reason: "Image request failed (404)." }]);
  assert.equal(saved[0]?.source, "ingest");
  assert.equal(saved[0]?.title, "Board");
  assert.equal(validateCollageDocument(saved[0]?.doc).ok, true);
  assert.equal(probes, 2);

  let savedAgain = false;
  const empty = await handleIngest(
    new Request("https://collage.test/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ images: [{ url: "https://cdn.test/missing.png" }] }),
    }),
    deps(
      async () => ({ ok: false, reason: "Could not fetch the image." }),
      async () => {
        savedAgain = true;
        return { ok: false, response: new Response(null, { status: 500 }) };
      },
    ),
  );
  assert.equal(empty.status, 400);
  const emptyBody = (await empty.json()) as { error: string; skipped: unknown[] };
  assert.match(emptyBody.error, /None of the images could be loaded/);
  assert.equal(emptyBody.skipped.length, 1);
  assert.equal(savedAgain, false);

  probes = 0;
  const overflow = await handleIngest(
    new Request("https://collage.test/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        images: Array.from({ length: MAX_PHOTOS + 1 }, (_, index) => ({
          url: `https://cdn.test/${index}.jpg`,
        })),
      }),
    }),
    deps(
      async () => {
        probes += 1;
        return { ok: true, width: 1, height: 1, type: "png" };
      },
      async () => {
        throw new Error("should not save");
      },
    ),
  );
  assert.equal(overflow.status, 400);
  assert.equal(probes, 0);
});

test("deploymentOrigin prefers the forwarded host", () => {
  const forwarded = deploymentOrigin(
    new Request("http://127.0.0.1/api/ingest", {
      headers: {
        "x-forwarded-host": "collage-slides-studio.vercel.app",
        "x-forwarded-proto": "https",
      },
    }),
  );
  assert.equal(forwarded, "https://collage-slides-studio.vercel.app");

  const previous = process.env.VERCEL_URL;
  const previousProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const local = deploymentOrigin(new Request("http://localhost:5173/api/ingest"));
    assert.equal(local, "http://localhost:5173");

    process.env.VERCEL_URL = "collage-slides-studio-abc123.vercel.app";
    const vercel = deploymentOrigin(new Request("http://127.0.0.1/api/ingest"));
    assert.equal(vercel, "https://collage-slides-studio-abc123.vercel.app");
  } finally {
    if (previous === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previous;
    if (previousProduction === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previousProduction;
  }
});
