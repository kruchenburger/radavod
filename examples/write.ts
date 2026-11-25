import { writeFileSync } from "node:fs";
import { serialize } from "./family.ts";
import { generateFamily } from "./generate.ts";

writeFileSync(new URL("family.json", import.meta.url), serialize(generateFamily(1, 300)));
