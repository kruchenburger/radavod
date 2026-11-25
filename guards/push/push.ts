import { checkCommits, commitsOf } from "../data/commits.ts";
import { git } from "../data/git.ts";
import { checkSecrets, type Secrets } from "./secrets.ts";

/**
 * Checks the commits git is about to push. `updates` is what git tells a pre-push hook: a line
 * `<local ref> <local id> <remote ref> <remote id>` for each branch or tag.
 *
 * Commits the remote has are left out. The remote itself is asked: what this machine remembers of it
 * may be old, or come from another place.
 */
export function checkPush(
  root: string,
  address: string,
  updates: string,
  secretsIn: (root: string, revisions: string[]) => Secrets = checkSecrets,
): { ok: boolean; messages: string[] } {
  const messages = new Set<string>();
  let ok = true;
  try {
    const known = knownTo(root, address);
    for (const update of updates.split("\n").filter(Boolean)) {
      // Only the local ref may hold a space.
      const [local = "", , there = ""] = update.split(" ").slice(-3);
      if (![local, there].every((id) => /^[0-9a-f]{40,64}$/.test(id))) {
        throw new Error(`cannot read "${update}"`);
      }
      // A deletion pushes nothing.
      if (/^0+$/.test(local)) continue;
      // A tag may name a file itself, and a file has no history to read.
      if (!isCommit(root, local)) throw new Error(`${local} is not a commit`);

      const { commits, boundary } = commitsOf(root, [local], known);
      if (commits.length === 0) continue;
      const revisions = [local, ...boundary.map((commit) => `^${commit}`)];

      const { violations } = checkCommits(root, revisions);
      if (violations.length > 0) {
        ok = false;
        messages.add(familyData(violations));
      }
      const secrets = secretsIn(root, revisions);
      if (secrets === "found") {
        ok = false;
        messages.add(secretFound);
      }
      if (secrets === "not-installed") messages.add(notInstalled);
    }
  } catch (error) {
    ok = false;
    messages.add(`The commits could not be checked: ${(error as Error).message}`);
  }
  if (ok) return { ok, messages: [...messages] };
  return {
    ok,
    messages: [
      "Push refused. Nothing has left this machine.",
      ...messages,
      `What to do: CONTRIBUTING.md, "Before you push".`,
    ],
  };
}

function familyData(violations: { rule: string; file: string; commit: string }[]): string {
  return [
    "These files look like a family's data:",
    ...violations.map(({ rule, file, commit }) => `  ${rule}: ${file} in ${commit}`),
    "Deleting a file in a new commit is not enough: the old commit is pushed too.",
    "Make the commits of this branch again, without the file. It stays on your disk:",
    '  git reset --soft "$(git merge-base origin/main HEAD)"',
    `  git rm --cached --ignore-unmatch "${violations[0]?.file}"`,
    "  git commit",
    "An invented example goes to examples/ and is listed in guards/data/examples.json.",
  ].join("\n");
}

const secretFound = [
  "gitleaks found a secret, listed above. Revoke it if it is real.",
  "Deleting it in a new commit is not enough: the old commit is pushed too.",
].join("\n");

const notInstalled = "gitleaks is not installed, so nobody looked for secrets: https://gitleaks.io";

/** What the remote has and this machine has too. */
function knownTo(root: string, address: string): string[] {
  const lines = git(root, ["ls-remote", "--", address]).toString().split("\n").filter(Boolean);
  const ids = new Set(lines.map((line) => line.split("\t")[0]));
  const input = [...ids].map((id) => `${id}^{commit}\n`).join("");
  const found = git(root, ["cat-file", "--batch-check"], input).toString();
  return [...found.matchAll(/^([0-9a-f]+) commit /gm)].map(([, id = ""]) => id);
}

function isCommit(root: string, id: string): boolean {
  try {
    git(root, ["cat-file", "-e", `${id}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
