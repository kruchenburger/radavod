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
 * a commit the range starts from. Examples are judged by today's list.
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

  const before = new Set(boundary.flatMap((commit) => treeOf(root, commit)).map(keyOf));
  const added = new Map<string, Entry & { commit: string }>();
  for (const commit of commits) {
    for (const entry of treeOf(root, commit)) {
      const key = keyOf(entry);
      if (!before.has(key) && !added.has(key)) added.set(key, { ...entry, commit });
    }
  }

  const entries = [...added.values()];
  const violations = readEntries(root, entries).flatMap((file, i) =>
    brokenRules(file, examples).map((rule) => ({
      rule,
      file: file.file,
      commit: entries[i]?.commit ?? "",
    })),
  );
  return { commits: commits.length, files: entries.length, violations };
}

/** The commits of a range, oldest first, and the ones just before it. */
export function commitsOf(
  folder: string,
  revisions: string[],
): { commits: string[]; boundary: string[] } {
  // A shallow copy ends early and looks like a short history.
  if (git(folder, ["rev-parse", "--is-shallow-repository"]).toString().trim() !== "false") {
    throw new Error("cannot read the commits: the copy is shallow");
  }
  const options = ["--reverse", "--topo-order", "--boundary"];
  const lines = git(folder, ["rev-list", ...options, ...revisions, "--"])
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

function keyOf({ file, id }: Entry): string {
  return `${id} ${file}`;
}
