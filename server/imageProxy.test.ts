import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../api/image-proxy.ts";
import { routeCollageApi } from "./devRouter.ts";
import { handleImageProxy } from "./handleImageProxy.ts";
import { fetchPublicImage, type ProbeDeps } from "./probeImage.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function publicLookup(address = "1.1.1.1"): ProbeDeps["lookup"] {
  return async () => [{ address, family: address.includes(":") ? 6 : 4 }];
}

function deps(fetch: ProbeDeps["fetch"], maxBytes = 2_000_000): ProbeDeps {
  return {
    fetch,
    lookup: publicLookup(),
    timeoutMs: 1000,
    maxBytes,
  };
}

test("image proxy returns image bytes and blocks open-proxy and private hosts", async () => {
  let fetches = 0;
  const okDeps = deps(async (input) => {
    fetches += 1;
    assert.equal(String(input), "https://cdn.test/a.png");
    return new Response(PNG, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "set-cookie": "session=secret",
      },
    });
  });

  const response = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("https://cdn.test/a.png")),
    okDeps,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  assert.equal(fetches, 1);

  const crossSite = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("https://cdn.test/a.png"), {
      headers: { "sec-fetch-site": "cross-site" },
    }),
    okDeps,
  );
  assert.equal(crossSite.status, 403);
  assert.equal(fetches, 1);

  const foreignOrigin = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("https://cdn.test/a.png"), {
      headers: { origin: "https://evil.test" },
    }),
    okDeps,
  );
  assert.equal(foreignOrigin.status, 403);

  const sameOrigin = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("https://cdn.test/a.png"), {
      headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" },
    }),
    okDeps,
  );
  assert.equal(sameOrigin.status, 200);
  await sameOrigin.arrayBuffer();

  const missing = await handleImageProxy(new Request("http://localhost/api/image-proxy"), okDeps);
  assert.equal(missing.status, 400);

  const httpUrl = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("http://cdn.test/a.png")),
    okDeps,
  );
  assert.equal(httpUrl.status, 400);

  const blocked = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("https://localhost/a.png")),
    deps(async () => {
      throw new Error("fetched a private host");
    }),
  );
  assert.equal(blocked.status, 400);

  const redirected = await fetchPublicImage(
    "https://cdn.test/start.png",
    deps(async (input) => {
      if (String(input).includes("start.png")) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/secret.png" },
        });
      }
      throw new Error("followed a private redirect");
    }),
  );
  assert.equal(redirected.ok, false);
  if (!redirected.ok) assert.equal(redirected.status, 400);

  const html = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("https://cdn.test/page")),
    deps(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })),
  );
  assert.equal(html.status, 415);

  const tooBig = await handleImageProxy(
    new Request("http://localhost/api/image-proxy?url=" + encodeURIComponent("https://cdn.test/big.png")),
    deps(async () => {
      const body = new Uint8Array(80);
      body.set(PNG.subarray(0, Math.min(PNG.length, 80)));
      return new Response(body, { status: 200, headers: { "content-type": "image/png" } });
    }, 64),
  );
  assert.equal(tooBig.status, 413);

  const posted = await routeCollageApi(
    new Request("http://localhost/api/image-proxy?url=https://cdn.test/a.png", { method: "POST" }),
  );
  assert.equal(posted.status, 405);

  const route = await GET(new Request("http://localhost/api/image-proxy"));
  assert.equal(route.status, 400);
});
