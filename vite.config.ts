import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  // wrangler.jsonc serves this folder.
  build: { outDir: "../dist/client", emptyOutDir: true },
});
