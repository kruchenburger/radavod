import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { contents } from "../data/fixtures.ts";
import { commit, git, repository, temporaryFolder } from "../data/temporary.ts";
import { checkPush } from "./push.ts";
import type { Secrets } from "./secrets.ts";

const hooks = fileURLToPath(new URL("../../.githooks", import.meta.url));
const none = "0".repeat(40);

/** A repository with a pushed first commit and the remote it was pushed to. */
function started(): { root: string; remote: string } {
  const remote = temporaryFolder();
  git(remote, "init", "--quiet", "--bare");
  const root = repository();
  commit(root, { "readme.md": contents.clean });
  git(root, "checkout", "--quiet", "-B", "main");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "--quiet", "origin", "main");
  return { root, remote };
}

function push(root: string, ...args: string[]) {
  const options = ["-c", `core.hooksPath=${hooks}`];
  const run = spawnSync("git", [...options, "push", ...args], { cwd: root, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

const refs = (remote: string): string => git(remote, "for-each-ref", "--format=%(refname)").trim();

it("lets clean commits through", () => {
  const { root, remote } = started();
  commit(root, { "a.txt": contents.clean });
  expect(push(root, "origin", "main", "main:refs/heads/other").status).toBe(0);
  expect(refs(remote)).toBe("refs/heads/main\nrefs/heads/other");
});

it("refuses a file added and removed, and says what to do", () => {
  const { root, remote } = started();
  const before = git(remote, "rev-parse", "main");
  const id = commit(root, { "a.txt": contents.gedcom });
  commit(root, { "a.txt": null });
  const { status, output } = push(root, "origin", "main");
  expect(status).not.toBe(0);
  expect(output).toContain(`gedcom-content: a.txt in ${id}`);
  expect(output).toContain("git rebase --interactive");
  expect(output).toContain("CONTRIBUTING.md");
  expect(git(remote, "rev-parse", "main")).toBe(before);
});

it("refuses a new branch, a tag and a push to an address", () => {
  const { root, remote } = started();
  git(root, "checkout", "--quiet", "-b", "side");
  commit(root, { "a.txt": contents.gedcom });
  git(root, "tag", "--annotate", "--message", "a tag", "v1");
  expect(push(root, "origin", "side").status).not.toBe(0);
  expect(push(root, "origin", "v1").status).not.toBe(0);
  expect(push(root, remote, "side").status).not.toBe(0);
  expect(refs(remote)).toBe("refs/heads/main");
});

it("refuses when one branch of many is bad", () => {
  const { root, remote } = started();
  git(root, "checkout", "--quiet", "-b", "side");
  commit(root, { "a.txt": contents.gedcom });
  git(root, "checkout", "--quiet", "main");
  commit(root, { "b.txt": contents.clean });
  expect(push(root, "--atomic", "origin", "main", "side").status).not.toBe(0);
  expect(refs(remote)).toBe("refs/heads/main");
});

it("leaves alone what the other side already has", () => {
  const { root, remote } = started();
  commit(root, { "a.txt": contents.gedcom });
  git(root, "push", "--quiet", "origin", "main");
  commit(root, { "b.txt": contents.clean });
  expect(push(root, "origin", "main").status).toBe(0);
  expect(push(root, remote, "main:again").status).not.toBe(0);
});

it("lets a deletion and a branch without new commits through", () => {
  const { root, remote } = started();
  expect(push(root, "origin", "main:other").status).toBe(0);
  expect(push(root, "origin", "--delete", "other").status).toBe(0);
  expect(refs(remote)).toBe("refs/heads/main");
});

it("refuses what is not a commit", () => {
  const { root, remote } = started();
  git(root, "tag", "blob", "HEAD:readme.md");
  expect(push(root, "origin", "blob").status).not.toBe(0);
  expect(refs(remote)).toBe("refs/heads/main");
});

it.each<[Secrets, boolean, string]>([
  ["clean", true, ""],
  ["found", false, "Revoke"],
  ["not-installed", true, "gitleaks is not installed"],
])("with secrets %s lets the push through: %s", (secrets, passes, words) => {
  const { root } = started();
  const id = commit(root, { "a.txt": contents.clean });
  const update = `refs/heads/main ${id} refs/heads/main ${none}\n`;
  const { ok, messages } = checkPush(root, "origin", update, () => secrets);
  expect(ok).toBe(passes);
  expect(messages.join("\n")).toContain(words);
});

it("refuses when a check could not run", () => {
  const { root } = started();
  const id = commit(root, { "a.txt": contents.clean });
  const update = `refs/heads/main ${id} refs/heads/main ${none}\n`;
  const broken = (): never => {
    throw new Error("gitleaks scanned nothing");
  };
  const { ok, messages } = checkPush(root, "origin", update, broken);
  expect(ok).toBe(false);
  expect(messages.join("\n")).toContain("gitleaks scanned nothing");
});

it("refuses a line it does not understand", () => {
  expect(checkPush(started().root, "origin", "main\n", () => "clean").ok).toBe(false);
});

it("is a hook git can run", () => {
  expect(git(hooks, "ls-files", "--stage", "pre-push")).toMatch(/^100755 /);
});
