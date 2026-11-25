import listed from "./examples.json" with { type: "json" };
import { type Entry, fields, git, readEntries, rootOf } from "./git.ts";
import { brokenRules, checkExamples, type Examples, type Violation } from "./guard.ts";

export type CommitReport = {
  commits: number;
  files: number;
  violations: (Violation & { commit: string })[];
};

/**
 * Looks for a family's data in every commit of a range: what one commit adds and the next one
 * removes is still published. Revisions are written as for `git rev-list`, for example `base..head`.
 *
 * Every file of every commit is read, apart from those that stand unchanged, under the same name, in
 * a commit the range starts from. An example may be listed in any of these commits, but the rules it
 * may break are those of today's list.
 */
export function checkCommits(
  folder: string,
  revisions: string[],
  examples: Examples = listed,
): CommitReport {
  checkExamples(examples);
  const root = rootOf(folder);
  const { commits, boundary } = commitsOf(root, revisions);
  if (commits.length === 0) throw new Error("no commits scanned");

  const before = boundary.flatMap((commit) => treeOf(root, commit));
  const seen = new Set(before.map(keyOf));
  const lists = new Map(before.filter(isList).map((entry) => [entry.id, entry]));
  const added: (Entry & { commit: string })[] = [];
  for (const commit of commits) {
    for (const entry of treeOf(root, commit)) {
      if (isList(entry)) lists.set(entry.id, entry);
      if (seen.has(keyOf(entry))) continue;
      seen.add(keyOf(entry));
      added.push({ ...entry, commit });
    }
  }

  const names = readEntries(root, [...lists.values()]).flatMap(({ bytes }) => namesIn(bytes));
  const allExamples = { ...Object.fromEntries(names.map((name) => [name, []])), ...examples };
  const violations = readEntries(root, added).flatMap((file, i) =>
    brokenRules(file, allExamples).map((rule) => ({
      rule,
      file: file.file,
      commit: added[i]?.commit ?? "",
    })),
  );
  return { commits: commits.length, files: added.length, violations };
}

/** The commits of a range, oldest first, and the ones just before it. */
export function commitsOf(
  folder: string,
  revisions: string[],
  known: string[] = [],
): { commits: string[]; boundary: string[] } {
  // A shallow copy ends early and looks like a short history.
  if (git(folder, ["rev-parse", "--is-shallow-repository"]).toString().trim() !== "false") {
    throw new Error("the copy is shallow. Run git fetch --unshallow");
  }
  const options = ["--reverse", "--topo-order", "--boundary", "--stdin"];
  const input = known.map((id) => `^${id}\n`).join("");
  const lines = git(folder, ["rev-list", ...options, ...revisions, "--"], input)
    .toString()
    .split("\n")
    .filter(Boolean);
  return {
    commits: lines.filter((line) => !line.startsWith("-")),
    boundary: lines.filter((line) => line.startsWith("-")).map((line) => line.slice(1)),
  };
}

function treeOf(root: string, commit: string): Entry[] {
  return fields(git(root, ["ls-tree", "-r", "-z", commit])).map((line) => {
    const [info = "", file = ""] = line.split(/\t(.*)/s);
    const [mode = "", , id = ""] = info.split(" ");
    return { file, mode, id };
  });
}

function isList({ file }: Entry): boolean {
  return file === "guards/data/examples.json";
}

/** The names in a list of examples. An unreadable one has none. */
function namesIn(bytes: Buffer): string[] {
  try {
    return Object.keys(JSON.parse(bytes.toString()));
  } catch {
    return [];
  }
}

function keyOf({ file, id }: Entry): string {
  return `${id} ${file}`;
}
