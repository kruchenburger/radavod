import { runGuard } from "./guard.ts";

const { modules, edges, violations } = await runGuard(process.argv[2] ?? "src");

for (const { rule, from, to } of violations) console.error(`${rule}: ${from} -> ${to}`);
console.log(`${modules} modules, ${edges} imports, ${violations.length} violations`);
if (violations.length > 0) process.exitCode = 1;
