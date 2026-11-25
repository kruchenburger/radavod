import { z } from "zod";
import { type FuzzyDate, sortKey } from "../kernel/fuzzy-date";
import type { Patch, State } from "./reverse";
import type {
  TreeBranch,
  TreeNameForm,
  TreePerson,
  TreeSnapshot,
  TreeUnion,
  TreeYear,
} from "./tree";
import { certaintySchema, fuzzyDateSchema, languageSchema, nameFormSchema } from "./values";

/**
 * The tree as the browser gets it, made of what was written in each aggregate. It is pure: the server
 * makes the snapshot of the last version with it, the browser can make that of a past one, and the
 * build makes that of the invented family, so the screens have one source.
 */

/** The version a snapshot was taken after, and the epoch its numbers hold in. */
export type Head = { version: number; epoch: string };

// What the snapshot reads of an aggregate. Identifiers are not checked: the invented family has its own.
const id = z.string().min(1);

const personRead = z.object({
  sex: z.enum(["male", "female", "other", "unknown"]),
  living: z.enum(["yes", "no", "unknown"]),
  names: z.array(nameFormSchema),
  mainName: z.string().nullable(),
  parents: z.array(
    z.object({
      id,
      parent: id,
      union: id.nullable(),
      kind: z.enum(["blood", "adoption", "guardianship", "unknown"]),
      main: z.boolean(),
      certainty: certaintySchema,
    }),
  ),
  childOrder: z.array(id),
});

const unionRead = z.object({
  partners: z.tuple([id, id]),
  kind: z.enum(["marriage", "civil", "unknown"]),
  certainty: certaintySchema,
});

const branchRead = z.object({
  title: z.object({ ru: z.string(), en: z.string() }),
  color: z.int().min(0).max(11),
});

const eventRead = z.object({
  id,
  kind: z.string(),
  date: fuzzyDateSchema.nullable(),
  place: id.nullable(),
  union: id.nullable(),
  main: z.boolean(),
});

const lifeRead = z.object({ events: z.array(eventRead) });

const placeRead = z.object({
  names: z.array(z.object({ text: z.string(), language: languageSchema })),
});

const branchOfRead = id.nullable();

type Event = z.infer<typeof eventRead>;

/** The snapshot of a state. People, unions, branches and places come in the order of the state. */
export function snapshotOf(state: State, { version, epoch }: Head): TreeSnapshot {
  const lives = new Map<string, Event[]>();
  const weddings = new Map<string, number>();
  for (const [key, value] of Object.entries(state)) {
    const [kind, owner = ""] = split(key);
    if (kind !== "life") continue;
    const { events } = read(key, lifeRead, value);
    lives.set(owner, events);
    for (const { kind: what, union, date } of events) {
      const day = date === null ? null : sortKey(date);
      if (what !== "wedding" || union === null || day === null) continue;
      weddings.set(union, Math.min(day, weddings.get(union) ?? day));
    }
  }
  const branchOf = (key: string): string | null =>
    state[key] === undefined ? null : read(key, branchOfRead, state[key]);

  const people: TreePerson[] = [];
  const unions: TreeUnion[] = [];
  const branches: TreeBranch[] = [];
  const places: TreeSnapshot["places"] = [];
  for (const [key, value] of Object.entries(state)) {
    const [kind, owner = ""] = split(key);
    if (kind === "person") {
      const person = read(key, personRead, value);
      people.push(personOf(owner, person, branchOf(`person-branch/${owner}`), lives.get(owner)));
    } else if (kind === "union") {
      const { partners, kind: what, certainty } = read(key, unionRead, value);
      const [first, second] = partners;
      unions.push({
        id: owner,
        kind: what,
        partners: [first, second === "unknown" ? null : second],
        began: weddings.get(owner) ?? null,
        branch: branchOf(`union-branch/${owner}`),
        certainty,
      });
    } else if (kind === "branch") {
      const { title, color } = read(key, branchRead, value);
      branches.push({ id: owner, title: { ru: title.ru, en: title.en }, color });
    } else if (kind === "place") {
      const { names } = read(key, placeRead, value);
      places.push({ id: owner, names: names.map(({ text, language }) => ({ text, language })) });
    }
  }
  return { format: 1, version, epoch, people, unions, branches, places };
}

function personOf(
  id: string,
  { sex, living, names, mainName, parents, childOrder }: z.infer<typeof personRead>,
  branch: string | null,
  events: readonly Event[] = [],
): TreePerson {
  const shown = names.find((one) => one.id === mainName) ?? null;
  const main = (kind: "birth" | "death") => events.find((one) => one.kind === kind && one.main);
  const [birth, death] = [main("birth"), main("death")];
  return {
    id,
    sex,
    living,
    name: shown && formOf(shown),
    otherNames: names.filter((one) => one !== shown).map(formOf),
    branch,
    parents: parents.map(({ id: link, parent, union, kind, main: isMain, certainty }) => ({
      id: link,
      parent: parent === "unknown" ? null : parent,
      union,
      kind,
      main: isMain,
      certainty,
    })),
    childOrder: [...childOrder],
    birth: birth?.date ? yearOf(birth.date) : null,
    death: death?.date ? yearOf(death.date) : null,
    place: birth?.place ?? death?.place ?? null,
  };
}

/** A part nobody wrote is null, as the browser knows it. */
function formOf({
  kind,
  language,
  script,
  given,
  patronymic,
  surname,
  certainty,
}: z.infer<typeof nameFormSchema>): TreeNameForm {
  const part = (text: string) => (text === "" ? null : text);
  return {
    kind,
    language,
    script,
    given: part(given),
    patronymic: part(patronymic),
    surname: part(surname),
    certainty,
  };
}

/** A date as the tree shows it: its years in digits, what they mean, and its earliest day. */
export function yearOf(date: FuzzyDate): TreeYear {
  const { text, parsed } = date;
  if (parsed === null) return { text, qualifier: "unread", sort: null };
  const { qualifier, from, to } = parsed;
  return {
    text: to === undefined ? String(from.year) : `${from.year}–${to.year}`,
    qualifier,
    sort: sortKey(date),
  };
}

/**
 * What a client must ask for again after the patches: "person/<id>", "union/<id>", "branch/<id>" and
 * "place/<id>" of the snapshot. A wedding dates its union, so a change of an event names the union the
 * event is of now, given by `unionOf`, and those its patches name.
 */
export function touchedBy(
  patches: readonly Patch[],
  unionOf: (home: string, event: string) => string | null,
): string[] {
  const touched = new Set<string>();
  for (const { aggregate, path, before, after } of patches) {
    const [kind, owner = ""] = split(aggregate);
    switch (kind) {
      case "person":
      case "person-branch":
        touched.add(`person/${owner}`);
        break;
      case "union":
      case "union-branch":
        touched.add(`union/${owner}`);
        break;
      case "branch":
      case "place":
        touched.add(aggregate);
        break;
      case "life": {
        touched.add(`person/${owner}`);
        const [field, event, part] = path.split("/");
        const unions = [before, after].flatMap((value) =>
          part === "union" ? [value] : unionsIn(value),
        );
        if (field === "events" && event !== undefined && event !== "") {
          unions.push(unionOf(owner, event));
        }
        for (const one of unions) if (typeof one === "string") touched.add(`union/${one}`);
        break;
      }
    }
  }
  return [...touched];
}

/** The unions events in a value of a life are of. */
function unionsIn(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(unionsIn);
  if (typeof value !== "object" || value === null) return [];
  const { union, events } = value as { union?: unknown; events?: unknown };
  return [union, ...unionsIn(events ?? [])];
}

function split(aggregate: string): [string, string | undefined] {
  const at = aggregate.indexOf("/");
  return at < 0 ? [aggregate, undefined] : [aggregate.slice(0, at), aggregate.slice(at + 1)];
}

/** A value of the state that is not what was written is the fault of the code. */
function read<T>(key: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`corrupt-state ${key}`);
  return parsed.data;
}
