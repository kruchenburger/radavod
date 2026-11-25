import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { commit, git, repository } from "../data/temporary.ts";
import { checkSecrets, type Run } from "./secrets.ts";

const text = (value: string): Uint8Array => Buffer.from(value);
/** Put together here, so that no scanner takes this file for a leak. */
const secret = text(`token = "${["ghp", "wWPw5k4aXcaT4fNP0UcnZwJUVFk6LO0pINUx"].join("_")}"\n`);

function started(): string {
  const root = repository();
  commit(root, { "readme.md": text("clean\n") });
  git(root, "tag", "base");
  return root;
}

/** Stands for gitleaks, with this exit code and these last words. */
function answer(status: number | null, stderr: string): Run {
  return () => ({ status, stderr, missing: status === null });
}

it("passes on what gitleaks found", () => {
  const root = started();
  commit(root, { "a.txt": text("a\n") });
  const check = (run: Run) => checkSecrets(root, ["base..HEAD"], run);
  expect(check(answer(0, "INF 1 commits scanned."))).toBe("clean");
  expect(check(answer(1, "INF 1 commits scanned.\nWRN leaks found: 1"))).toBe("found");
  expect(check(answer(null, ""))).toBe("not-installed");
});

it.each([
  ["reported an error", "ERR fatal: bad revision\nINF 0 commits scanned."],
  ["said nothing", ""],
  ["scanned no commit", "INF 0 commits scanned.\nINF no leaks found"],
])("does not believe gitleaks that %s and found no leaks", (_name, stderr) => {
  const root = started();
  commit(root, { "a.txt": text("a\n") });
  expect(() => checkSecrets(root, ["base..HEAD"], answer(0, stderr))).toThrow("gitleaks");
});

it("fails on an exit code it does not know", () => {
  const root = started();
  commit(root, { "a.txt": text("a\n") });
  expect(() => checkSecrets(root, ["base..HEAD"], answer(126, "unknown flag"))).toThrow(
    "unknown flag",
  );
});

it("expects nothing scanned where no line was added", () => {
  const root = started();
  commit(root, { "readme.md": null });
  const run = answer(0, "INF 0 commits scanned.\nINF no leaks found");
  expect(checkSecrets(root, ["base..HEAD"], run)).toBe("clean");
});

it("fails when there are no commits or no such revision", () => {
  const run = answer(0, "INF 1 commits scanned.");
  expect(() => checkSecrets(started(), ["base..HEAD"], run)).toThrow("no commits scanned");
  expect(() => checkSecrets(started(), ["base..nowhere"], run)).toThrow("nowhere");
});

// The security job of the CI installs gitleaks and runs these.
const installed = spawnSync("gitleaks", ["version"]).status === 0;

it.skipIf(!installed)("finds a secret added and removed inside one range", () => {
  const root = started();
  commit(root, { "a.txt": secret });
  commit(root, { "a.txt": null });
  expect(checkSecrets(root, ["base..HEAD"])).toBe("found");
});

it.skipIf(!installed)("finds a secret that only a merge commit holds", () => {
  const root = started();
  git(root, "checkout", "--quiet", "-b", "side");
  commit(root, { "b.txt": text("b\n") });
  git(root, "checkout", "--quiet", "-");
  commit(root, { "c.txt": text("c\n") });
  git(root, "merge", "--quiet", "--no-commit", "side");
  commit(root, { "a.txt": secret });
  commit(root, { "a.txt": null });
  expect(checkSecrets(root, ["base..HEAD"])).toBe("found");
});

it.skipIf(!installed)("is not talked out of it by a comment", () => {
  const root = started();
  commit(root, { "a.txt": Buffer.concat([secret.subarray(0, -1), text(" # gitleaks:allow\n")]) });
  expect(checkSecrets(root, ["base..HEAD"])).toBe("found");
});

it.skipIf(!installed)("accepts clean commits", () => {
  const root = started();
  commit(root, { "a.txt": text("a\n") });
  expect(checkSecrets(root, ["base..HEAD"])).toBe("clean");
});
