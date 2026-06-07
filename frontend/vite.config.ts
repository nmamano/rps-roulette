import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(here, "./src"),
      "@shared": resolve(here, "../shared"),
    },
  },
  server: {
    host: true,
    proxy: {
      // Dev: Vite on :5173 proxies the WebSocket to the Bun server on :3000.
      "/ws": { target: "http://127.0.0.1:3000", ws: true, changeOrigin: true },
      "/health": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
