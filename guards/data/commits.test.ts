import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { checkCommits } from "./commits.ts";
import { contents } from "./fixtures.ts";
import { commit, git, repository } from "./temporary.ts";

const gedcom = { rule: "gedcom-content", file: "a.txt" };

/** A repository with a first commit, tagged `base`. */
function started(files: Record<string, Uint8Array> = { "readme.md": contents.clean }): string {
  const root = repository();
  commit(root, files);
  git(root, "tag", "base");
  return root;
}

it("accepts clean commits and counts them", () => {
  const root = started();
  commit(root, { "a.txt": contents.clean });
  commit(root, { "a.txt": null });
  expect(checkCommits(root, ["base..HEAD"])).toEqual({ commits: 2, files: 1, violations: [] });
});

it("finds a file added and removed inside one pull request", () => {
  const root = started();
  const id = commit(root, { "a.txt": contents.gedcom });
  commit(root, { "a.txt": null });
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([{ ...gedcom, commit: id }]);
});

it("finds a file whose content was replaced later", () => {
  const root = started();
  const id = commit(root, { "a.txt": contents.gedcom });
  commit(root, { "a.txt": contents.clean });
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([{ ...gedcom, commit: id }]);
});

it("names the first commit that holds the file, once", () => {
  const root = started();
  const id = commit(root, { "a.txt": contents.gedcom });
  commit(root, { "b.txt": contents.clean });
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([{ ...gedcom, commit: id }]);
});

it("finds a file on a side branch that was merged", () => {
  const root = started();
  git(root, "checkout", "--quiet", "-b", "side");
  const id = commit(root, { "a.txt": contents.gedcom });
  commit(root, { "a.txt": null });
  git(root, "checkout", "--quiet", "-");
  commit(root, { "b.txt": contents.clean });
  git(root, "merge", "--quiet", "--no-edit", "side");
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([{ ...gedcom, commit: id }]);
});

it("finds a file that only a merge commit holds", () => {
  const root = started();
  git(root, "checkout", "--quiet", "-b", "side");
  commit(root, { "b.txt": contents.clean });
  git(root, "checkout", "--quiet", "-");
  commit(root, { "c.txt": contents.clean });
  git(root, "merge", "--quiet", "--no-commit", "side");
  const id = commit(root, { "a.txt": contents.gedcom });
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([{ ...gedcom, commit: id }]);
});

it("finds an old file under a new forbidden name", () => {
  const root = started();
  const id = commit(root, { "readme.md": null, "tree.ged": contents.clean });
  commit(root, { "tree.ged": null });
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([
    { rule: "gedcom-name", file: "tree.ged", commit: id },
  ]);
});

it("finds an example that was never listed", () => {
  const root = started();
  const id = commit(root, { "examples/a.json": contents.clean });
  commit(root, { "examples/a.json": null });
  expect(checkCommits(root, ["base..HEAD"], {}).violations).toEqual([
    { rule: "unlisted-example", file: "examples/a.json", commit: id },
  ]);
});

it("allows a listed example only the rules it is listed for", () => {
  const root = started();
  const file = "examples/tree.txt";
  commit(root, { [file]: contents.gedcom });
  expect(checkCommits(root, ["base..HEAD"], { [file]: ["gedcom-content"] }).violations).toEqual([]);
  expect(checkCommits(root, ["base..HEAD"], { [file]: [] }).violations).toHaveLength(1);
});

it("takes an example that was listed in the same range", () => {
  const list = "guards/data/examples.json";
  const listing = (name: string) => Buffer.from(JSON.stringify({ [name]: ["gedcom-content"] }));
  const root = started();
  commit(root, { "examples/a.json": contents.clean });
  commit(root, { [list]: listing("examples/a.json") });
  commit(root, { "examples/a.json": null, "examples/b.json": contents.clean });
  commit(root, { [list]: listing("examples/b.json") });
  expect(checkCommits(root, ["base..HEAD"], {}).violations).toEqual([]);

  commit(root, { [list]: Buffer.from("not a list"), "examples/c.json": contents.clean });
  expect(checkCommits(root, ["base..HEAD"], {}).violations).toHaveLength(1);
  // A list inside the range lets no rule be broken.
  commit(root, { [list]: listing("examples/c.json"), "examples/c.json": contents.gedcom });
  expect(checkCommits(root, ["base..HEAD"], {}).violations).toMatchObject([
    { rule: "gedcom-content", file: "examples/c.json" },
  ]);
});

it("takes a change and the removal of an example that was listed before", () => {
  const list = "guards/data/examples.json";
  const file = "examples/a.json";
  const listed = Buffer.from(JSON.stringify({ [file]: [] }));
  const root = started({ [list]: listed, [file]: contents.clean });
  commit(root, { [file]: Buffer.from("changed") });
  commit(root, { [list]: Buffer.from("{}"), [file]: null });
  expect(checkCommits(root, ["base..HEAD"], {}).violations).toEqual([]);
});

it("reads a path with spaces and other letters", () => {
  const root = started();
  const file = "докі/мой файл.txt";
  const id = commit(root, { [file]: contents.gedcom });
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([{ ...gedcom, file, commit: id }]);
});

it("leaves alone what was there before", () => {
  const root = started({ "readme.md": contents.gedcom });
  commit(root, { "b.txt": contents.clean });
  commit(root, { "readme.md": null });
  expect(checkCommits(root, ["base..HEAD"]).violations).toEqual([]);
});

it("takes the options of git rev-list", () => {
  const root = started();
  const id = commit(root, { "a.txt": contents.gedcom });
  expect(checkCommits(root, ["HEAD", "--not", "base"]).violations).toEqual([
    { ...gedcom, commit: id },
  ]);
});

it("reads a whole history", () => {
  const root = started({ "readme.md": contents.gedcom });
  expect(checkCommits(root, ["HEAD"])).toMatchObject({
    commits: 1,
    files: 1,
    violations: [{ rule: "gedcom-content" }],
  });
});

it("reads every file when started in a subfolder", () => {
  const root = started({ "docs/readme.md": contents.clean });
  commit(root, { "a.txt": contents.gedcom });
  expect(checkCommits(`${root}/docs`, ["base..HEAD"]).violations).toHaveLength(1);
});

it("fails when there are no commits", () => {
  expect(() => checkCommits(started(), ["base..HEAD"])).toThrow("no commits scanned");
});

it("fails on a revision that does not exist", () => {
  expect(() => checkCommits(started(), ["base..nowhere"])).toThrow("nowhere");
});

it("fails on a shallow copy, which hides commits", () => {
  const root = started();
  commit(root, { "a.txt": contents.gedcom });
  commit(root, { "a.txt": null });
  const copy = repository();
  git(copy, "fetch", "--quiet", "--depth", "1", pathToFileURL(root).href, "HEAD");
  expect(() => checkCommits(copy, ["FETCH_HEAD"])).toThrow("shallow");
});

it("fails on a submodule, whose content is elsewhere", () => {
  const root = started();
  git(root, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},module`);
  commit(root);
  commit(root, { module: null });
  expect(() => checkCommits(root, ["base..HEAD"])).toThrow("cannot read module: it is a submodule");
});

it("fails on a Git LFS pointer, whose content is elsewhere", () => {
  const root = started();
  const pointer = ["version https://git-lfs.github.com/spec/v1", "oid sha256:0", "size 9", ""];
  commit(root, { "a.txt": Buffer.from(pointer.join("\n")) });
  expect(() => checkCommits(root, ["base..HEAD"])).toThrow("cannot read a.txt");
});

it.each([
  ["clean", contents.clean, 0, "1 commits, 1 files, 0 violations"],
  ["broken", contents.gedcom, 1, "gedcom-content: a.txt in "],
])("turns %s commits into an exit code", (_name, content, code, output) => {
  const root = started();
  commit(root, { "a.txt": content });
  const cli = fileURLToPath(new URL("cli.ts", import.meta.url));
  const run = spawnSync(process.execPath, [cli, "--commits", "base..HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(run.stdout + run.stderr).toContain(output);
  expect(run.status).toBe(code);
});
