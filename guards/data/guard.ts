import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join, posix } from "node:path";
import listed from "./examples.json" with { type: "json" };
import { fields, type File, git, readEntries, rootOf } from "./git.ts";
import { rules, textOf } from "./rules.ts";

export type Violation = { rule: string; file: string };
export type Report = { files: number; violations: Violation[] };
/** Files allowed in `examples/`, each with the rules it may break. */
export type Examples = Record<string, string[]>;

/**
 * Looks for a family's data in every file git tracks or has staged.
 *
 * It does not see: untracked files, earlier commits (`checkCommits` reads them), other branches, the
 * message and the author of a commit, text in images and PDF,
 * encrypted or encoded data (base64, a compressed or encrypted database), archives of a kind not in
 * `rules.ts` (brotli has no signature at all), archives other than zip after other bytes,
 * parts of a GEDCOM file with no header, no person or family record and no name with the surname in
 * slashes, GEDCOM in an encoding that is not ASCII-based, a backup marker without quotes or with more
 * in the same quotes, and a family in a format of its own: a SQL dump, a table, prose, CSV, JSON or
 * XML without the marker.
 */
export function check(folder: string, examples: Examples = listed): Report {
  checkExamples(examples);
  const root = rootOf(folder);
  const versions = new Map<string, File[]>();
  for (const found of [...staged(root), ...changedOnDisk(root)]) {
    versions.set(found.file, [...(versions.get(found.file) ?? []), found]);
  }
  if (versions.size === 0) throw new Error("no files scanned");

  const violations: Violation[] = [];
  for (const [file, found] of versions) {
    const broken = new Set(found.flatMap((version) => brokenRules(version, examples)));
    for (const rule of broken) violations.push({ rule, file });
  }
  return { files: versions.size, violations };
}

export function checkExamples(examples: Examples): void {
  for (const [file, allowed] of Object.entries(examples)) {
    if (!file.startsWith("examples/") || posix.normalize(file) !== file) {
      throw new Error(`not in examples: ${file}`);
    }
    const unknown = allowed.filter((rule) => !Object.hasOwn(rules, rule));
    if (unknown.length > 0) throw new Error(`${file}: unknown rule ${unknown.join(", ")}`);
  }
}

export function brokenRules({ file, bytes }: File, examples: Examples): string[] {
  if (isLfsPointer(bytes)) throw new Error(`cannot read ${file}: it is a Git LFS pointer`);
  const allowed = Object.hasOwn(examples, file) ? examples[file] : undefined;
  const content = { file, bytes, text: textOf(bytes) };
  return Object.entries(rules)
    .filter(([rule, breaks]) => !allowed?.includes(rule) && breaks(content, allowed !== undefined))
    .map(([rule]) => rule);
}

/** What the next commit holds: every tracked file as it is in the index. */
function staged(root: string): File[] {
  const entries = fields(git(root, ["ls-files", "--stage", "-z"])).map((entry) => {
    const [info = "", file = ""] = entry.split(/\t(.*)/s);
    const [mode = "", id = ""] = info.split(" ");
    return { file, mode, id };
  });
  return readEntries(root, entries);
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
