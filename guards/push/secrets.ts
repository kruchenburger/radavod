import { spawnSync } from "node:child_process";
import { commitsOf } from "../data/commits.ts";
import { git, rootOf } from "../data/git.ts";

export type Secrets = "clean" | "found" | "not-installed";
export type Run = (
  root: string,
  args: string[],
) => { status: number | null; stderr: string; missing: boolean };

/** A merge shows what it brought in, or a change made in the merge itself would stay unseen. */
const MERGES = "--diff-merges=first-parent";

/**
 * Looks for secrets in every commit of a range, with gitleaks.
 *
 * gitleaks ends well when git told it nothing at all, so a clean answer counts only when it also
 * says that it read commits.
 */
export function checkSecrets(folder: string, revisions: string[], run: Run = gitleaks): Secrets {
  const root = rootOf(folder);
  if (commitsOf(root, revisions).commits.length === 0) throw new Error("no commits scanned");

  const { status, stderr, missing } = run(root, [
    "git",
    "--no-banner",
    "--no-color",
    "--redact",
    "--verbose",
    "--ignore-gitleaks-allow",
    `--log-opts=${[MERGES, ...revisions].join(" ")}`,
    ".",
  ]);
  if (missing) return "not-installed";
  if (status === 1 && stderr.includes("leaks found")) return "found";
  if (status !== 0 || /\bERR\b/.test(stderr)) throw new Error(`gitleaks: ${stderr.trim()}`);

  const [, scanned] = /(\d+) commits scanned/.exec(stderr) ?? [];
  if (scanned === undefined || (Number(scanned) === 0 && addsLines(root, revisions))) {
    throw new Error("gitleaks scanned nothing");
  }
  return "clean";
}

function addsLines(root: string, revisions: string[]): boolean {
  const changes = git(root, ["log", MERGES, "--format=", "--numstat", ...revisions, "--"]);
  return /^[1-9]\d*\t/m.test(changes.toString());
}

/** Findings go straight to the terminal, without the secrets themselves. */
function gitleaks(root: string, args: string[]): ReturnType<Run> {
  const { error, status, stderr } = spawnSync("gitleaks", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "pipe"],
  });
  const missing = (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
  if (error && !missing) throw error;
  return { status, stderr: stderr ?? "", missing };
}
