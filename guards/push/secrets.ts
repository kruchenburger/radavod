import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitsOf } from "../data/commits.ts";
import { git, rootOf } from "../data/git.ts";

export type Secrets = "clean" | "found" | "not-installed";
export type Run = (
  root: string,
  args: string[],
) => { status: number | null; stderr: string; missing: boolean };

/**
 * A merge shows what it brought in, or a change made in the merge itself would stay unseen. Text is
 * shown whatever attributes or a zero byte make of the file.
 */
const DIFF = [
  "--diff-merges=first-parent",
  "--text",
  "--no-textconv",
  "--no-ext-diff",
  "--no-color",
];

/**
 * Looks for secrets in every commit of a range, with gitleaks.
 *
 * gitleaks ends well when git told it nothing at all, so a clean answer counts only when it also
 * says that it read commits.
 *
 * It does not see secrets in UTF-16 or in encoded data, in files its own rules leave out (lockfiles,
 * SVG and others) and in the messages of commits and tags.
 */
export function checkSecrets(folder: string, revisions: string[], run: Run = gitleaks): Secrets {
  const root = rootOf(folder);
  if (commitsOf(root, revisions).commits.length === 0) throw new Error("no commits scanned");

  // gitleaks splits the options at spaces, and a name may have one.
  const ids = git(root, ["rev-parse", "--revs-only", ...revisions])
    .toString()
    .trim()
    .split("\n");
  const { status, stderr, missing } = run(root, [
    "git",
    "--no-banner",
    "--no-color",
    "--redact",
    "--verbose",
    "--ignore-gitleaks-allow",
    `--log-opts=${[...DIFF, ...ids].join(" ")}`,
    ".",
  ]);
  if (missing) return "not-installed";
  if (status === 1 && stderr.includes("leaks found")) return "found";
  if (status !== 0 || /\bERR\b/.test(stderr)) {
    throw new Error(`gitleaks must be 8.19 or newer, and it said: ${stderr.trim()}`);
  }

  const [, scanned] = /(\d+) commits scanned/.exec(stderr) ?? [];
  if (scanned === undefined || (Number(scanned) === 0 && addsLines(root, ids))) {
    throw new Error("gitleaks scanned nothing");
  }
  return "clean";
}

function addsLines(root: string, ids: string[]): boolean {
  const changes = git(root, ["log", ...DIFF, "--format=", "--numstat", ...ids, "--"]);
  return /^[1-9]\d*\t/m.test(changes.toString());
}

/** Findings go straight to the terminal, without the secrets themselves. */
function gitleaks(root: string, args: string[]): ReturnType<Run> {
  // Started elsewhere, gitleaks finds no settings in the repository that would tell it to look away.
  const elsewhere = mkdtempSync(join(tmpdir(), "guard-push-"));
  try {
    const settings = Object.keys(process.env).filter((key) => key.startsWith("GITLEAKS_"));
    const { error, status, stderr } = spawnSync("gitleaks", args, {
      cwd: elsewhere,
      encoding: "utf8",
      stdio: ["ignore", "inherit", "pipe"],
      env: {
        ...process.env,
        ...Object.fromEntries(settings.map((key) => [key, undefined])),
        GIT_DIR: git(root, ["rev-parse", "--absolute-git-dir"]).toString().trim(),
        GIT_NO_REPLACE_OBJECTS: "1",
      },
    });
    const missing = (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
    if (error && !missing) throw error;
    return { status, stderr: stderr ?? "", missing };
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
  }
}
