import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: the API runs on PORT (7818, npm start) and Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5187, proxy: { "/api": { target: "http://127.0.0.1:7818" } } },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/testSetup.js" },
});
