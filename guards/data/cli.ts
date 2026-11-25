import { fileURLToPath } from "node:url";
import { check } from "./guard.ts";

const root = process.argv[2] ?? fileURLToPath(new URL("../..", import.meta.url));
const { files, violations } = check(root);

for (const { rule, file } of violations) console.error(`${rule}: ${file}`);
console.log(`${files} files, ${violations.length} violations`);
if (violations.length > 0) process.exitCode = 1;
