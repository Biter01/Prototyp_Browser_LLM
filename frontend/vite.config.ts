import { defineConfig } from "vite";

// Das Backend läuft auf Port 3000. Der Browser spricht nur mit Vite (/api/...),
// Vite leitet weiter; so braucht das Backend kein CORS.
// 127.0.0.1 statt localhost: unter Windows löst localhost sonst evtl. auf ::1 auf.
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, "") },
    },
  },
  optimizeDeps: { exclude: ["@mlc-ai/web-llm"] },
});
