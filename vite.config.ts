import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  root: "web",
  plugins: [react(), fontLicences()],
  // wrangler.jsonc serves this folder.
  build: { outDir: "../dist/client", emptyOutDir: true },
});

/** OFL-1.1 asks that its text goes where the font goes. A font without it fails the build. */
function fontLicences(): Plugin {
  const { resolve } = createRequire(import.meta.url);
  return {
    name: "font-licences",
    apply: "build",
    generateBundle() {
      for (const name of Object.keys(packageJson.dependencies).filter((name) =>
        name.startsWith("@fontsource"),
      )) {
        const source = readFileSync(resolve(`${name}/LICENSE`), "utf8");
        if (!source.includes("SIL OPEN FONT LICENSE")) this.error(`${name} is not under OFL-1.1`);
        this.emitFile({
          type: "asset",
          fileName: `licences/${name.replace("@", "").replace("/", "-")}.txt`,
          source,
        });
      }
    },
  };
}
