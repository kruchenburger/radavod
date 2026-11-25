import { check, fixture, readTree, repository } from "./guard.ts";

const name = process.argv[2];
const { files, texts, violations } = check(name ? fixture(name) : readTree(repository));

for (const { rule, file, line, text } of violations) {
  console.error(`${rule}: ${file}:${line} ${text}`);
}
console.log(`${files} files, ${texts} texts, ${violations.length} violations`);
if (violations.length > 0) process.exitCode = 1;
