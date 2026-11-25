import { fileURLToPath } from "node:url";
import { checkCommits } from "./commits.ts";
import { check } from "./guard.ts";

const [first, ...revisions] = process.argv.slice(2);

if (first === "--commits") {
  const { commits, files, violations } = checkCommits(process.cwd(), revisions);
  for (const { rule, file, commit } of violations) console.error(`${rule}: ${file} in ${commit}`);
  console.log(`${commits} commits, ${files} files, ${violations.length} violations`);
  if (violations.length > 0) process.exitCode = 1;
} else {
  const { files, violations } = check(first ?? fileURLToPath(new URL("../..", import.meta.url)));
  for (const { rule, file } of violations) console.error(`${rule}: ${file}`);
  console.log(`${files} files, ${violations.length} violations`);
  if (violations.length > 0) process.exitCode = 1;
}
