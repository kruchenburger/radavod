import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // wrangler.jsonc serves this folder.
  build: { outDir: "../dist/client", emptyOutDir: true },
});
