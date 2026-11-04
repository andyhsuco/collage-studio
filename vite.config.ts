import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function collageApiDev(): Plugin {
  return {
    name: "collage-api-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/collages")) {
          next();
          return;
        }
        void dispatchCollageApi(server, req, res).catch((error: unknown) => {
          console.error(
            "collage api dev failed",
            error instanceof Error ? error.message : "unknown",
          );
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Could not save the collage." }));
          }
        });
      });
    },
  };
}

async function dispatchCollageApi(
  server: ViteDevServer,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const method = (req.method ?? "GET").toUpperCase();
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
  });

  const loaded = (await server.ssrLoadModule(path.resolve("server/devRouter.ts"))) as {
    routeCollageApi?: (request: Request) => Promise<Response>;
  };
  if (!loaded.routeCollageApi) {
    throw new Error("Collage API router did not load.");
  }
  const response = await loaded.routeCollageApi(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key === "transfer-encoding" || key === "content-length") return;
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

export default defineConfig({
  plugins: [react(), tailwindcss(), collageApiDev()],
});
