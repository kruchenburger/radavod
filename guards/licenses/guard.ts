export type Package = { name: string; version: string; license: string };
/** A development tool under another license. A star at the end stands for any ending. */
export type Exception = { name: string; licenses: string[]; reason: string };

const allowed = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "CC0-1.0",
] as const;

/**
 * Checks the license of every package: the shipped ones against the list above, with OFL-1.1 for
 * fonts, the rest against the same list and the exceptions.
 *
 * It believes the `license` field of a package and sees the packages installed on this system only.
 * What ships is decided by `dependencies`; the architecture guard keeps development tools out of it.
 */
export function check(shipped: Package[], all: Package[], exceptions: Exception[]): string[] {
  if (shipped.length === 0 || all.length <= shipped.length) throw new Error("no packages scanned");
  for (const { name, reason } of exceptions) {
    if (!reason.trim()) throw new Error(`no reason for ${name}`);
  }

  const violations = shipped
    .filter(
      ({ name, license }) => !isAllowed(license, [...allowed, ...(isFont(name) ? [OFL] : [])]),
    )
    .map((found) => `shipped: ${describe(found)}`);

  const shippedIds = new Set(shipped.map(idOf));
  const needed = new Set<Exception>();
  for (const found of all) {
    if (shippedIds.has(idOf(found)) || isAllowed(found.license, allowed)) continue;
    const exception = exceptions.find(
      ({ name, licenses }) =>
        matches(name, found.name) && isAllowed(found.license, [...allowed, ...licenses]),
    );
    if (exception) needed.add(exception);
    else violations.push(`development: ${describe(found)}`);
  }

  for (const exception of exceptions) {
    if (!needed.has(exception)) violations.push(`exception: nothing needs ${exception.name}`);
  }
  return violations;
}

/** What `pnpm licenses list --json` prints. */
export function parseList(json: string): Package[] {
  const list = JSON.parse(json) as Record<string, { name: string; versions: string[] }[]>;
  return Object.entries(list).flatMap(([license, packages]) =>
    packages.flatMap(({ name, versions }) =>
      versions.map((version) => ({ name, version, license })),
    ),
  );
}

const OFL = "OFL-1.1";

function isFont(name: string): boolean {
  return /^@fontsource(?:-variable)?\//.test(name);
}

function matches(pattern: string, name: string): boolean {
  return pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

/** An SPDX expression: every license joined by AND must be allowed, one of those joined by OR. */
function isAllowed(expression: string, licenses: readonly string[]): boolean {
  const tokens = expression.match(/[()]|[^\s()]+/g) ?? [];
  let at = 0;

  function any(): boolean {
    let result = every();
    while (tokens[at] === "OR") {
      at += 1;
      result = every() || result;
    }
    return result;
  }
  function every(): boolean {
    let result = one();
    while (tokens[at] === "AND") {
      at += 1;
      result = one() && result;
    }
    return result;
  }
  function one(): boolean {
    const token = tokens[at];
    at += 1;
    if (token !== "(") return token !== undefined && licenses.includes(token);
    const result = any();
    at += 1;
    return tokens[at - 1] === ")" && result;
  }

  // Words left over make it something other than an expression.
  return any() && at === tokens.length;
}

function idOf({ name, version }: Package): string {
  return `${name}@${version}`;
}

function describe(found: Package): string {
  return `${idOf(found)} is under "${found.license}"`;
}
