import { mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";

// The code of the app names its modules without ".ts", as the bundler reads them. Node is told so.
registerHooks({
  resolve(specifier, context, next) {
    const isOurs = specifier.startsWith(".") && context.parentURL?.includes("/src/") === true;
    if (!isOurs || /\.[a-z]+$/u.test(specifier)) return next(specifier, context);
    return next(`${specifier}.ts`, context);
  },
});

// The snapshot is made by the code that makes the snapshot of a real tree.
const { generateFamily } = await import("./generate.ts");
const { sampleOf } = await import("./snapshot.ts");

// The built app fetches the example from /sample/tree.json, so it never imports this folder.
const [target] = process.argv.slice(2);
if (target === undefined) throw new Error("name the folder of the built app");
const folder = join(target, "sample");
mkdirSync(folder, { recursive: true });
writeFileSync(join(folder, "tree.json"), JSON.stringify(sampleOf(generateFamily(1, 300))));
