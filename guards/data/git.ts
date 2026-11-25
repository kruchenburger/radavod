import { spawnSync } from "node:child_process";

export type Entry = { file: string; mode: string; id: string };
export type File = { file: string; bytes: Buffer };

export function rootOf(folder: string): string {
  return git(folder, ["rev-parse", "--show-toplevel"]).toString().replace(/\n$/, "");
}

/** The content of each entry, in the same order. An entry without content here is an error. */
export function readEntries(root: string, entries: Entry[]): File[] {
  for (const { file, mode } of entries) {
    if (mode === "160000") throw new Error(`cannot read ${file}: it is a submodule`);
  }
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

/** The parts of an output made with `-z`. */
export function fields(output: Buffer): string[] {
  return output.toString().split("\0").slice(0, -1);
}

export function git(
  folder: string,
  args: string[],
  input = "",
  env: Record<string, string> = {},
): Buffer {
  const { error, status, stdout, stderr } = spawnSync("git", args, {
    cwd: folder,
    input,
    maxBuffer: Number.POSITIVE_INFINITY,
    // A replaced object shows other content here than where it is pushed.
    env: { ...process.env, LC_ALL: "C", GIT_NO_REPLACE_OBJECTS: "1", ...env },
  });
  if (error) throw error;
  if (status !== 0) throw new Error(`git ${args[0]}: ${stderr.toString().trim()}`);
  return stdout;
}
