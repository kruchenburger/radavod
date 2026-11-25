import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, expect, it } from "vitest";
import listed from "./examples.json" with { type: "json" };
import { bad, contents, type Files, good } from "./fixtures.ts";
import { check, type Report, type Violation } from "./guard.ts";
import { rules } from "./rules.ts";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const gedcomInA = [{ rule: "gedcom-content", file: "a.txt" }];

// One repository with every fixture in a folder of its own: git is slow to start.
const all = [...bad.map(([, , files]) => files), ...good.map(([, files]) => files)];
const isExample = (files: Files): boolean => Object.keys(files).some((f) => /^examples/i.test(f));
let report: Report;

beforeAll(() => {
  const entries = all.flatMap((files, i) =>
    isExample(files)
      ? []
      : Object.entries(files).map(([f, bytes]) => [`${i}/${f}`, bytes] as const),
  );
  report = check(stage(Object.fromEntries(entries)));
  expect(report.files).toBe(entries.length);
});

function violationsIn(files: Files): Violation[] {
  // A fixture in examples keeps its path, which the rule looks at.
  if (isExample(files)) return check(stage(files)).violations;
  const folder = `${all.indexOf(files)}/`;
  return report.violations
    .filter(({ file }) => file.startsWith(folder))
    .map(({ rule, file }) => ({ rule, file: file.slice(folder.length) }));
}

it.each(bad)("rejects %s by %s", (_name, rule, files) => {
  expect(violationsIn(files)).toEqual(Object.keys(files).map((file) => ({ rule, file })));
});

it.each(good)("accepts %s", (_name, files) => {
  expect(violationsIn(files)).toEqual([]);
});

it("has a bad fixture for every rule", () => {
  expect([...new Set(bad.map(([, rule]) => rule))].sort()).toEqual(Object.keys(rules).sort());
});

it("allows a listed example only the rules it is listed for", () => {
  const file = "examples/tree.ged";
  const root = stage({ [file]: contents.gedcom });
  expect(check(root, { [file]: ["gedcom-name", "gedcom-content"] }).violations).toEqual([]);
  expect(check(root, { [file]: ["gedcom-name"] }).violations).toEqual([
    { rule: "gedcom-content", file },
  ]);
});

it("refuses a list that reaches outside examples", () => {
  const root = stage({ "a.txt": contents.gedcom });
  expect(() => check(root, { "a.txt": ["gedcom-content"] })).toThrow("a.txt");
  expect(() => check(root, { "examples/../a.txt": ["gedcom-content"] })).toThrow("a.txt");
});

it("refuses a list that names an unknown rule", () => {
  const root = stage({ "examples/a.txt": contents.clean });
  expect(() => check(root, { "examples/a.txt": ["gedcom"] })).toThrow("gedcom");
});

it("reads what is staged, not only what is on disk", () => {
  const root = stage({ "a.txt": contents.gedcom });
  writeFileSync(join(root, "a.txt"), contents.clean);
  expect(check(root).violations).toEqual(gedcomInA);
});

it("reads a tracked file that changed on disk and is not staged", () => {
  const root = stage({ "a.txt": contents.clean });
  writeFileSync(join(root, "a.txt"), contents.gedcom);
  expect(check(root).violations).toEqual(gedcomInA);
});

it("reads a file added with intent to add", () => {
  const root = stage({ "b.txt": contents.clean });
  writeFileSync(join(root, "a.txt"), contents.gedcom);
  git(root, "add", "--intent-to-add", "a.txt");
  expect(check(root).violations).toEqual(gedcomInA);
});

it("reads a staged file that is gone from the disk", () => {
  const root = stage({ "a.txt": contents.gedcom });
  rmSync(join(root, "a.txt"));
  expect(check(root).violations).toEqual(gedcomInA);
});

it("reports a file once when the stage and the disk break the same rule", () => {
  const root = stage({ "a.txt": contents.gedcom });
  writeFileSync(join(root, "a.txt"), Buffer.concat([contents.clean, contents.gedcom]));
  expect(check(root)).toEqual({ files: 1, violations: gedcomInA });
});

it("reads the whole repository when started in a subfolder", () => {
  const root = stage({ "a.txt": contents.gedcom, "docs/b.txt": contents.clean });
  expect(check(join(root, "docs"))).toEqual({ files: 2, violations: gedcomInA });
});

it("fails when nothing is tracked", () => {
  expect(() => check(stage({}))).toThrow("no files scanned");
});

it("fails outside a repository", () => {
  expect(() => check(temporaryFolder())).toThrow("not a git repository");
});

it("fails when the content of a tracked file is missing", () => {
  const root = stage({ "a.txt": contents.clean });
  const objects = join(root, ".git/objects");
  for (const folder of readdirSync(objects).filter((name) => name.length === 2)) {
    rmSync(join(objects, folder), { recursive: true, force: true });
  }
  expect(() => check(root)).toThrow("cannot read a.txt");
});

it("fails when a tracked file turned into a folder", () => {
  const root = stage({ "a.txt": contents.clean });
  rmSync(join(root, "a.txt"));
  mkdirSync(join(root, "a.txt"));
  writeFileSync(join(root, "a.txt/b.txt"), contents.gedcom);
  expect(() => check(root)).toThrow("cannot read a.txt");
});

it("fails on a submodule, whose content is elsewhere", () => {
  const root = stage({ "a.txt": contents.clean });
  git(root, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},module`);
  expect(() => check(root)).toThrow("cannot read module: it is a submodule");
});

it("fails on a Git LFS pointer, whose content is elsewhere", () => {
  const pointer = ["version https://git-lfs.github.com/spec/v1", "oid sha256:0", "size 9", ""];
  const root = stage({ "a.txt": Buffer.from(pointer.join("\n")) });
  expect(() => check(root)).toThrow("cannot read a.txt");
});

it("scans this repository", () => {
  const { files, violations } = check(repository);
  expect(files).toBeGreaterThan(150);
  expect(violations).toEqual([]);
});

it("lists only examples that exist", () => {
  const tracked = git(repository, "ls-files", "examples").split("\n");
  expect(Object.keys(listed)).toContain("examples/family.json");
  expect(tracked).toEqual(expect.arrayContaining(Object.keys(listed)));
});

it.each<[string, Files, number, string]>([
  ["clean", { "a.txt": contents.clean }, 0, "1 files, 0 violations"],
  ["broken", { "a.txt": contents.gedcom }, 1, "gedcom-content: a.txt"],
  ["empty", {}, 1, "no files scanned"],
])("turns a %s repository into an exit code", (_name, files, code, output) => {
  const cli = fileURLToPath(new URL("cli.ts", import.meta.url));
  const run = spawnSync(process.execPath, [cli, stage(files)], { encoding: "utf8" });
  expect(run.stdout + run.stderr).toContain(output);
  expect(run.status).toBe(code);
});

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function temporaryFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "guard-data-"));
  folders.push(folder);
  return folder;
}

/** A new repository with the files staged and nothing committed. */
function stage(files: Files): string {
  const root = temporaryFolder();
  git(root, "init", "--quiet");
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  if (Object.keys(files).length > 0) git(root, "-c", "core.autocrlf=false", "add", "--force", ".");
  return root;
}

function git(root: string, ...args: string[]): string {
  const { status, stdout, stderr } = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (status !== 0) throw new Error(stderr);
  return stdout;
}
