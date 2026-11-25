import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateFamily } from "./generate.ts";
import { sampleOf } from "./snapshot.ts";

// The built app fetches the example from /sample/tree.json, so it never imports this folder.
const [target] = process.argv.slice(2);
if (target === undefined) throw new Error("name the folder of the built app");
const folder = join(target, "sample");
mkdirSync(folder, { recursive: true });
writeFileSync(join(folder, "tree.json"), JSON.stringify(sampleOf(generateFamily(1, 300))));
