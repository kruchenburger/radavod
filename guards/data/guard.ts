import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join, posix } from "node:path";
import listed from "./examples.json" with { type: "json" };
import { rules, textOf } from "./rules.ts";

export type Violation = { rule: string; file: string };
export type Report = { files: number; violations: Violation[] };
/** Files allowed in `examples/`, each with the rules it may break. */
export type Examples = Record<string, string[]>;

/**
 * Looks for a family's data in every file git tracks or has staged.
 *
 * It does not see: untracked files, earlier commits, other branches, text in images and PDF,
 * encrypted or encoded data (base64, a compressed or encrypted database), archives of a kind not in
 * `rules.ts` (brotli has no signature at all), parts of a GEDCOM file with no header, person, family
 * or name line, GEDCOM in an encoding that is not ASCII-based, a backup marker without quotes, and a
 * family in a format of its own: a SQL dump, a table, prose, CSV, JSON or XML without the marker.
 */
export function check(folder: string, examples: Examples = listed): Report {
  for (const [file, allowed] of Object.entries(examples)) {
    if (!file.startsWith("examples/") || posix.normalize(file) !== file) {
      throw new Error(`not in examples: ${file}`);
    }
    const unknown = allowed.filter((rule) => !Object.hasOwn(rules, rule));
    if (unknown.length > 0) throw new Error(`${file}: unknown rule ${unknown.join(", ")}`);
  }

  const root = git(folder, ["rev-parse", "--show-toplevel"]).toString().replace(/\n$/, "");
  const versions = new Map<string, Buffer[]>();
  for (const { file, bytes } of [...staged(root), ...changedOnDisk(root)]) {
    if (isLfsPointer(bytes)) throw new Error(`cannot read ${file}: it is a Git LFS pointer`);
    versions.set(file, [...(versions.get(file) ?? []), bytes]);
  }
  if (versions.size === 0) throw new Error("no files scanned");

  const violations: Violation[] = [];
  for (const [file, found] of versions) {
    const allowed = Object.hasOwn(examples, file) ? examples[file] : undefined;
    const contents = found.map((bytes) => ({ file, bytes, text: textOf(bytes) }));
    for (const [rule, breaks] of Object.entries(rules)) {
      if (allowed?.includes(rule)) continue;
      if (contents.some((content) => breaks(content, allowed !== undefined))) {
        violations.push({ rule, file });
      }
    }
  }
  return { files: versions.size, violations };
}

type File = { file: string; bytes: Buffer };

/** What the next commit holds: every tracked file as it is in the index. */
function staged(root: string): File[] {
  const entries = fields(git(root, ["ls-files", "--stage", "-z"])).map((entry) => {
    const [info = "", file = ""] = entry.split(/\t(.*)/s);
    const [mode, id = ""] = info.split(" ");
    if (mode === "160000") throw new Error(`cannot read ${file}: it is a submodule`);
    return { file, id };
  });
  const ids = entries.map(({ id }) => `${id}\n`).join("");
  const output = git(root, ["cat-file", "--batch"], ids);

  let at = 0;
  return entries.map(({ file, id }) => {
    const end = output.indexOf("\n", at);
    const [found, type, size] = output.toString("latin1", at, end).split(" ");
    if (end < 0 || found !== id || type !== "blob") throw new Error(`cannot read ${file}`);
    const start = end + 1;
    at = start + Number(size) + 1;
    if (at > output.length) throw new Error(`cannot read ${file}`);
    return { file, bytes: output.subarray(start, at - 1) };
  });
}

/** Tracked files whose copy on disk differs from the index. A deleted one has no copy. */
function changedOnDisk(root: string): File[] {
  const changed = fields(git(root, ["diff-files", "--name-only", "-z"]));
  return changed.flatMap((file) => {
    const path = join(root, file);
    try {
      const link = lstatSync(path).isSymbolicLink();
      return { file, bytes: link ? Buffer.from(readlinkSync(path)) : readFileSync(path) };
    } catch (cause) {
      const { code } = cause as NodeJS.ErrnoException;
      if (code === "ENOENT" || code === "ENOTDIR") return [];
      throw new Error(`cannot read ${file}`, { cause });
    }
  });
}

function isLfsPointer(bytes: Buffer): boolean {
  return bytes.toString("latin1", 0, 23) === "version https://git-lfs";
}

function fields(output: Buffer): string[] {
  return output.toString().split("\0").slice(0, -1);
}

function git(folder: string, args: string[], input = ""): Buffer {
  const { error, status, stdout, stderr } = spawnSync("git", args, {
    cwd: folder,
    input,
    maxBuffer: Number.POSITIVE_INFINITY,
    env: { ...process.env, LC_ALL: "C" },
  });
  if (error) throw error;
  if (status !== 0) throw new Error(`git ${args[0]}: ${stderr.toString().trim()}`);
  return stdout;
}
