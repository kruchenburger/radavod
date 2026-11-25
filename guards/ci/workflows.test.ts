import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { checkAll, checkFile, readFiles } from "./workflows.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sha = "a".repeat(40);
const name = ".github/workflows/a.yml";

const clean = `
name: A
on: pull_request
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@${sha} # v1.0.0
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - run: echo "$TITLE"
        env:
          TITLE: \${{ github.event.pull_request.title }}
`;
const step = (text: string) => clean.replace("- run:", `- ${text}\n      - run:`);

it("accepts a clean workflow", () => {
  expect(checkFile(name, clean)).toEqual([]);
});

it.each<[what: string, rule: string, source: string]>([
  ["an action by tag", "unpinned", step("uses: actions/cache@v4")],
  ["an action by branch", "unpinned", step("uses: actions/cache@main")],
  ["an action by a short SHA", "unpinned", step("uses: actions/cache@abcdef0")],
  ["an action without a version", "unpinned", step("uses: actions/cache")],
  ["an image", "unpinned", step("uses: docker://alpine:3")],
  ["a local action from elsewhere", "unpinned", step("uses: ./somewhere")],
  ["a local action out of the folder", "unpinned", step("uses: ./.github/actions/../../x")],
  [
    "a reusable workflow by tag",
    "unpinned",
    `${clean}  more:\n    uses: a/b/.github/workflows/c.yml@v1\n`,
  ],
  ["a container by tag", "unpinned", clean.replace("steps:", "container: node:26\n    steps:")],
  [
    "a container by tag, at length",
    "unpinned",
    clean.replace("steps:", "container:\n      image: node:26\n    steps:"),
  ],
  [
    "a service by tag",
    "unpinned",
    clean.replace("steps:", "services:\n      db:\n        image: redis:8\n    steps:"),
  ],

  ["no permissions", "permissions", clean.replace("permissions:\n  contents: read\n", "")],
  ["all permissions", "permissions", clean.replace(":\n  contents: read", ": write-all")],
  ["all read permissions", "permissions", clean.replace(":\n  contents: read", ": read-all")],
  ["more than reading the code", "permissions", clean.replace("contents: read", "issues: read")],
  ["writing", "permissions", clean.replace("contents: read", "contents: write")],
  [
    "a job that writes",
    "permissions",
    clean.replace("steps:", "permissions:\n      contents: write\n    steps:"),
  ],
  [
    "a job with all permissions",
    "permissions",
    clean.replace("steps:", "permissions: write-all\n    steps:"),
  ],

  [
    "pull_request_target",
    "privileged-event",
    clean.replace("on: pull_request", "on: pull_request_target"),
  ],
  [
    "pull_request_target in a list",
    "privileged-event",
    clean.replace("on: pull_request", "on: [push, pull_request_target]"),
  ],
  [
    "pull_request_target as a key",
    "privileged-event",
    clean.replace("on: pull_request", "on:\n  pull_request_target:\n    types: [opened]"),
  ],
  [
    "pull_request_target in another case",
    "privileged-event",
    clean.replace("on: pull_request", "on: Pull_Request_Target"),
  ],
  ["workflow_run", "privileged-event", clean.replace("on: pull_request", "on: workflow_run")],
  ["no event", "privileged-event", clean.replace("on: pull_request\n", "")],

  [
    "a secret",
    "secrets",
    clean.replace("${{ github.event.pull_request.title }}", "${{ secrets.TOKEN }}"),
  ],
  ["a secret by index", "secrets", clean.replace("github.event", "SECRETS['a'] || github.event")],
  ["every secret", "secrets", clean.replace("github.event", "toJSON(secrets) || github.event")],
  ["a secret in a condition", "secrets", step("if: secrets.TOKEN != ''\n        run: echo")],
  [
    "inherited secrets",
    "secrets",
    `${clean}  more:\n    uses: a/b/.github/workflows/c.yml@${sha}\n    secrets: inherit\n`,
  ],

  [
    "text of a pull request in run",
    "expression-in-run",
    step('run: echo "${{ github.head_ref }}"'),
  ],
  ["any expression in run", "expression-in-run", step("run: echo ${{ env.TITLE }}")],
  [
    "an expression in a script",
    "expression-in-run",
    step(
      `uses: actions/github-script@${sha}\n        with:\n          script: "\${{ github.ref }}"`,
    ),
  ],
  [
    "an expression in the shell",
    "expression-in-run",
    step("run: echo\n        shell: ${{ env.X }}"),
  ],

  [
    "an expression in a script, in another case",
    "expression-in-run",
    step(
      `uses: actions/github-script@${sha}\n        with:\n          Script: "\${{ github.ref }}"`,
    ),
  ],
  [
    "a default shell of a job",
    "hidden",
    clean.replace("steps:", "defaults:\n      run:\n        shell: bash {0}\n    steps:"),
  ],
  [
    "a default shell of a workflow",
    "hidden",
    clean.replace("jobs:", "defaults:\n  run:\n    shell: bash {0}\njobs:"),
  ],
  ["a merge key", "hidden", step("<<: { uses: actions/cache@v4 }")],
  [
    "credentials kept by a checkout in another case",
    "credentials",
    step(`uses: Actions/Checkout@${sha}`),
  ],
  [
    "credentials kept on disk",
    "credentials",
    clean.replace("\n        with:\n          persist-credentials: false", ""),
  ],
  ["a failure nobody sees", "ignored-failure", step("run: x\n        continue-on-error: true")],
  ["a job without a time limit", "time-limit", clean.replace("    timeout-minutes: 5\n", "")],
  ["YAML that cannot be read", "unreadable", `${clean}  - broken`],
  ["a key written twice", "unreadable", `${clean}permissions: {}\n`],
])("rejects %s", (_what, rule, source) => {
  expect(source).not.toBe(clean);
  expect(checkFile(name, source).map((violation) => violation.rule)).toContain(rule);
});

it("checks the steps of a local action", () => {
  const action = (body: string) =>
    checkFile(
      ".github/actions/setup/action.yml",
      `name: Setup\nruns:\n  using: composite\n  steps:\n    - ${body}\n`,
    ).map(({ rule }) => rule);
  expect(action("run: pnpm install\n      shell: bash")).toEqual([]);
  expect(action("uses: actions/setup-node@v7")).toEqual(["unpinned"]);
  expect(action("run: echo ${{ inputs.x }}\n      shell: bash")).toEqual(["expression-in-run"]);
});

it("rejects a local action that is an image or a script", () => {
  for (const runs of ["using: docker\n  image: docker://alpine:3", "using: node24\n  main: a.js"]) {
    const found = checkFile(".github/actions/a/action.yml", `name: A\nruns:\n  ${runs}\n`);
    expect(found.map(({ rule }) => rule)).toEqual(["hidden"]);
  }
});

it("accepts a write permission that is listed for its job", () => {
  const source = clean.replace("steps:", "permissions:\n      security-events: write\n    steps:");
  expect(checkFile(name, source)).toHaveLength(1);
  expect(checkFile(name, source, { "a.yml": { check: ["security-events"] } })).toEqual([]);
  expect(checkFile(name, source, { "a.yml": { other: ["security-events"] } })).toHaveLength(1);
  expect(checkFile(name, source, { "b.yml": { check: ["security-events"] } })).toHaveLength(1);
});

it("fails when nothing was scanned", () => {
  expect(() => checkAll(new Map())).toThrow("no workflows scanned");
  expect(() => readFiles(fileURLToPath(new URL(".", import.meta.url)))).toThrow();
});

it("accepts the workflows of this repository", () => {
  const files = readFiles(root);
  expect([...files.keys()]).toEqual(
    expect.arrayContaining([".github/workflows/ci.yml", ".github/actions/setup/action.yml"]),
  );
  expect(checkAll(files)).toEqual([]);
});

const ci = parse(readFileSync(`${root}/.github/workflows/ci.yml`, "utf8"));

it("runs on every pull request, whatever files it changes", () => {
  expect(ci.on).toEqual({ pull_request: null, push: { branches: ["main"] } });
});

it("skips no job and lets check wait for all of them", () => {
  const { check, ...jobs } = ci.jobs;
  expect(Object.keys(jobs).sort()).toEqual(["build", "e2e", "guards", "lint", "security", "test"]);
  expect([...check.needs].sort()).toEqual(Object.keys(jobs).sort());
  // Without it a failed job would skip check, and a skipped check passes for a required one.
  expect(check.if).toBe("always()");
  expect(check.name).toBeUndefined();
  for (const [job, { if: condition, needs, strategy }] of Object.entries<Record<string, unknown>>(
    jobs,
  )) {
    expect([condition, needs, strategy], job).toEqual([undefined, undefined, undefined]);
  }
});

it("runs no step conditionally, except to report a failure", () => {
  const conditions = Object.values<{ steps: { if?: string }[] }>(ci.jobs)
    .flatMap(({ steps }) => steps.map((step) => step.if))
    .filter(Boolean);
  expect(conditions).toEqual(["failure()"]);
});

it.each([
  ["success success success", 0],
  ["success", 0],
  ["", 1],
  ["success failure success", 1],
  ["success cancelled", 1],
  ["skipped success", 1],
])("turns the results %j into an exit code", (results, code) => {
  const [step] = ci.jobs.check.steps;
  expect(step.env).toEqual({ RESULTS: "${{ join(needs.*.result, ' ') }}" });
  const run = spawnSync("sh", ["-c", step.run], {
    env: { ...process.env, RESULTS: results },
  });
  expect(run.status).toBe(code);
});
