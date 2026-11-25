import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseDocument } from "yaml";

export type Violation = { rule: string; file: string; text: string };
/** Write permissions by file and job. Every other job may only read. */
export type Writes = Record<string, Record<string, string[]>>;

/** CodeQL reports what it found in the Security tab of the repository. */
export const writes: Writes = { "codeql.yml": { analyze: ["security-events"] } };

/** Both run with the rights of the repository while somebody else decides what they run on. */
const privileged = ["pull_request_target", "workflow_run"];

type Step = Record<string, unknown> & { with?: Record<string, unknown> };
type Job = Record<string, unknown> & { steps?: Step[] };

export function readFiles(root: string): Map<string, string> {
  const folder = ".github";
  const files = readdirSync(join(root, folder), { recursive: true, encoding: "utf8" })
    .map((file) => `${folder}/${file.replaceAll("\\", "/")}`)
    .filter((file) => isWorkflow(file) || /\/action\.ya?ml$/.test(file));
  return new Map(files.sort().map((file) => [file, readFileSync(join(root, file), "utf8")]));
}

export function checkAll(files: Map<string, string>, allowed: Writes = writes): Violation[] {
  if (![...files.keys()].some(isWorkflow)) throw new Error("no workflows scanned");
  return [...files].flatMap(([file, source]) => checkFile(file, source, allowed));
}

/** A workflow or a local action. Secrets, unpinned code and text of strangers stay out of both. */
export function checkFile(file: string, source: string, allowed: Writes = writes): Violation[] {
  const violations: Violation[] = [];
  const add = (rule: string, text: string) => violations.push({ rule, file, text });

  const document = parseDocument(source);
  if (document.errors.length > 0) {
    for (const { message } of document.errors) add("unreadable", message);
    return violations;
  }
  const content = document.toJS() as Record<string, unknown>;

  for (const [key, text] of scalarsOf(content)) {
    const isExpression = text.includes("${{") || key === "if";
    if (key === "secrets" || (isExpression && /\bsecrets\b/i.test(text))) add("secrets", text);
    // A merge key hides the rest of a step from this check, and a default shell from its step.
    if (["<<", "defaults"].includes(key)) add("hidden", key);
  }

  if (isWorkflow(file)) {
    const events = eventsOf(content.on);
    if (events.length === 0) add("privileged-event", "no event");
    for (const event of events)
      if (privileged.includes(event.toLowerCase())) add("privileged-event", event);
    if (!["{}", '{"contents":"read"}'].includes(JSON.stringify(content.permissions))) {
      add("permissions", "the workflow");
    }
    for (const [id, job] of Object.entries((content.jobs ?? {}) as Record<string, Job>)) {
      const listed = allowed[basename(file)]?.[id] ?? [];
      if (!isMinimal(job.permissions, listed)) add("permissions", id);
      if (typeof job["timeout-minutes"] !== "number" && !job.uses) add("time-limit", id);
      checkStep(job);
      for (const image of imagesOf(job)) {
        if (!/@sha256:[0-9a-f]{64}$/.test(image)) add("unpinned", image);
      }
      job.steps?.forEach(checkStep);
    }
  } else {
    const runs = content.runs as Job | undefined;
    // Any other kind brings an image or a script no step here shows.
    if (runs?.using !== "composite") add("hidden", String(runs?.using));
    runs?.steps?.forEach(checkStep);
  }
  return violations;

  /** Also the keys a job shares with a step. */
  function checkStep(step: Step): void {
    const { uses, run, shell } = step;
    if (typeof uses === "string" && !isPinned(uses)) add("unpinned", uses);
    if (typeof uses === "string" && /^actions\/checkout@/i.test(uses)) {
      if (step.with?.["persist-credentials"] !== false) add("credentials", uses);
    }
    // Text becomes code here, whoever wrote it. It goes through `env` instead.
    for (const code of [run, shell, ...scriptsOf(step)]) {
      if (String(code).includes("${{")) add("expression-in-run", String(code));
    }
    if (step["continue-on-error"]) add("ignored-failure", String(run ?? uses));
  }
}

/** The names of inputs are the same in any case. */
function scriptsOf(step: Step): unknown[] {
  return Object.entries(step.with ?? {}).flatMap(([name, value]) =>
    name.toLowerCase() === "script" ? [value] : [],
  );
}

function isWorkflow(file: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
}

function isPinned(uses: string): boolean {
  return (
    /^\.\/\.github\/actions\/[\w-]+$/.test(uses) || /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(uses)
  );
}

function isMinimal(permissions: unknown, listed: string[]): boolean {
  if (permissions === undefined) return true;
  if (typeof permissions !== "object" || permissions === null) return false;
  return Object.entries(permissions).every(
    ([name, value]) => value === "read" || value === "none" || listed.includes(name),
  );
}

function eventsOf(on: unknown): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.map(String);
  return Object.keys(on ?? {});
}

function imagesOf({ container, services }: Job): string[] {
  const all = [container, ...Object.values(services ?? {})].filter(Boolean);
  return all.map((image) =>
    typeof image === "string" ? image : String((image as { image: unknown }).image),
  );
}

/** Every value with the key it stands under, however deep. */
function scalarsOf(value: unknown, key = ""): [key: string, text: string][] {
  if (typeof value !== "object" || value === null) return [[key, String(value)]];
  if (Array.isArray(value)) return value.flatMap((item) => scalarsOf(item, key));
  return Object.entries(value).flatMap(([name, item]) => [
    ...(["secrets", "<<", "defaults"].includes(name) ? [[name, ""] as [string, string]] : []),
    ...scalarsOf(item, name),
  ]);
}
