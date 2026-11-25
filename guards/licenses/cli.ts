import { execSync } from "node:child_process";
import { exceptions } from "./exceptions.ts";
import { check, parseList } from "./guard.ts";

const list = (options: string) =>
  parseList(execSync(`pnpm licenses list --json ${options}`, { encoding: "utf8" }));
const shipped = list("--prod");
const all = list("");

const violations = check(shipped, all, exceptions);
for (const violation of violations) console.error(violation);
console.log(`${shipped.length} shipped, ${all.length} packages, ${violations.length} violations`);
if (violations.length > 0) process.exitCode = 1;
