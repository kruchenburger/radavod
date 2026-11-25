import { readFileSync } from "node:fs";
import { checkPush } from "./push.ts";
import { checkSecrets } from "./secrets.ts";

const [first = "", ...revisions] = process.argv.slice(2);

if (first === "--secrets") {
  const secrets = checkSecrets(process.cwd(), revisions);
  console.log(`secrets: ${secrets}`);
  if (secrets !== "clean") process.exitCode = 1;
} else {
  // git names the remote and its address, and lists the updates on the standard input.
  const { ok, messages } = checkPush(process.cwd(), first, readFileSync(0, "utf8"));
  for (const message of messages) console.error(message);
  if (!ok) process.exitCode = 1;
}
