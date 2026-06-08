// Hono app: WS upgrade, static serving of the built frontend, Bun default export.
// In-memory state only — see fly.toml: this MUST run on exactly one machine.

import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { RoomStore } from "./rooms";
import { registerSocket } from "./socket";

const PORT = Number(process.env.PORT ?? 3000);

const app = new Hono();
// Quiet under `bun test` (NODE_ENV=test); log requests in dev/prod.
if (process.env.NODE_ENV !== "test") app.use("*", logger());

// Cache policy: content-hashed assets are immutable (cache for a year);
// everything else (notably index.html) must revalidate so a new deploy is picked
// up without a hard refresh. Skip the WS upgrade and the health check.
app.use("*", async (c, next) => {
  await next();
  const p = c.req.path;
  if (p === "/ws" || p === "/health") return;
  if (p.startsWith("/assets/")) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    c.header("Cache-Control", "no-cache");
  }
});

const store = new RoomStore();
const websocket = registerSocket(app, store);

app.get("/health", (c) => c.json({ ok: true, rooms: store.size }));

// Serve the built SPA, falling back to index.html for client-side routes.
app.get("*", serveStatic({ root: "./frontend/dist" }));
app.get("*", serveStatic({ path: "./frontend/dist/index.html" }));

export default {
  port: PORT,
  fetch: app.fetch,
  websocket,
};
