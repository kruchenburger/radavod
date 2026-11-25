import { checkCommits, commitsOf } from "../data/commits.ts";
import { git } from "../data/git.ts";
import { checkSecrets, type Secrets } from "./secrets.ts";

/**
 * Checks the commits git is about to push. `updates` is what git tells a pre-push hook: a line
 * `<local ref> <local id> <remote ref> <remote id>` for each branch or tag.
 *
 * Commits known to be on the remote are left out. A push to an address instead of a named remote
 * knows only what it replaces, so it may check the whole history.
 */
export function checkPush(
  root: string,
  remote: string,
  updates: string,
  secretsIn: (root: string, revisions: string[]) => Secrets = checkSecrets,
): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  let ok = true;
  try {
    for (const update of updates.split("\n").filter(Boolean)) {
      const [, local = "", , there = ""] = update.split(" ");
      if (![local, there].every((id) => /^[0-9a-f]{40,64}$/.test(id))) {
        throw new Error(`cannot read "${update}"`);
      }
      // A deletion pushes nothing.
      if (isNone(local)) continue;
      // A tag may name a file itself, and a file has no history to read.
      if (!hasCommit(root, local)) throw new Error(`${local} is not a commit`);

      const known = isNone(there) || !hasCommit(root, there) ? [] : [there];
      const revisions = [local, "--not", ...known, `--remotes=${remote}`];
      if (commitsOf(root, revisions).commits.length === 0) continue;

      const { violations } = checkCommits(root, revisions);
      if (violations.length > 0) {
        ok = false;
        messages.push(familyData(violations));
      }
      const secrets = secretsIn(root, revisions);
      if (secrets === "found") {
        ok = false;
        messages.push(secretFound);
      }
      if (secrets === "not-installed" && !messages.includes(notInstalled)) {
        messages.push(notInstalled);
      }
    }
  } catch (error) {
    ok = false;
    messages.push(`The commits could not be checked: ${(error as Error).message}`);
  }
  if (!ok) {
    messages.unshift("Push refused. Nothing has left this machine.");
    messages.push(`More about this check: CONTRIBUTING.md, "Before you push".`);
  }
  return { ok, messages };
}

function familyData(violations: { rule: string; file: string; commit: string }[]): string {
  return [
    "These files look like a family's data:",
    ...violations.map(({ rule, file, commit }) => `  ${rule}: ${file} in ${commit}`),
    "Deleting a file in a new commit is not enough: the old commit is pushed too.",
    "Take the file out of the commit that added it, for example with",
    `  git rebase --interactive ${violations[0]?.commit}^`,
    "An invented example goes to examples/ and is listed in guards/data/examples.json.",
  ].join("\n");
}

const secretFound = [
  "gitleaks found a secret, listed above.",
  "Revoke it if it is real, and take it out of the commit that added it, not only of the last one.",
].join("\n");

const notInstalled =
  "gitleaks is not installed, so the commits were not checked for secrets: https://gitleaks.io";

function isNone(id: string): boolean {
  return /^0+$/.test(id);
}

function hasCommit(root: string, id: string): boolean {
  try {
    git(root, ["cat-file", "-e", `${id}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
