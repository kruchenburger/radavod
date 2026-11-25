import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import type { Files } from "./fixtures.ts";

// Inside a git hook these point at the real repository.
for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function temporaryFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "guard-data-"));
  folders.push(folder);
  return folder;
}

/** A new empty repository. */
export function repository(): string {
  const root = temporaryFolder();
  git(root, "init", "--quiet");
  return root;
}

/** A new repository with the files staged and nothing committed. */
export function stage(files: Files): string {
  const root = repository();
  write(root, files);
  if (Object.keys(files).length > 0) git(root, "-c", "core.autocrlf=false", "add", "--force", ".");
  return root;
}

/** Commits what is staged, with these files written or, where null, removed. */
export function commit(root: string, files: Record<string, Uint8Array | null> = {}): string {
  for (const [file, content] of Object.entries(files)) {
    if (content) {
      write(root, { [file]: content });
      git(root, "-c", "core.autocrlf=false", "add", "--force", file);
    } else {
      git(root, "rm", "--quiet", "--cached", file);
      rmSync(join(root, file), { recursive: true, force: true });
    }
  }
  git(root, "commit", "--quiet", "--allow-empty", "--no-verify", "--message", "a commit");
  return git(root, "rev-parse", "HEAD").trim();
}

export function git(root: string, ...args: string[]): string {
  const author = ["-c", "user.name=Nobody", "-c", "user.email=nobody@example.com"];
  const options = [...author, "-c", "commit.gpgsign=false"];
  const { status, stdout, stderr } = spawnSync("git", [...options, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (status !== 0) throw new Error(stderr);
  return stdout;
}

function write(root: string, files: Files): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
}
