import type { Citation } from "../contexts/evidence";
import {
  purge,
  scrubbed,
  type Words,
  withoutNames,
  wordsOf,
  type Trashed,
  wholeNames,
} from "../contexts/history";
import type { PersonWritten } from "../contexts/kinship";
import { factOf, type LifeEvent } from "../contexts/life";
import type { EventId, MemberId, PersonId } from "../kernel/id";
import type { NameForm } from "../kernel/name-form";
import type { Result } from "../kernel/result";
import { type State, withoutErased } from "../shared/reverse";
import { trash, type TrashError } from "./trash";
import type { Contexts, Reading, StaleVersion, UnitOfWork } from "./unit-of-work";

/** Who was erased. It lies with the members, so that a rollback of the tree does not bring them back. */
export interface Ledger {
  remember(ids: PersonId[]): void | Promise<void>;
  all(): PersonId[] | Promise<PersonId[]>;
}

export type EraseError = TrashError | StaleVersion;
/** Where others still write the whole name in words of their own, as "kind/id". */
export type Erased = { mentions: string[] };

/** The scenario of an erasure, as the journal names it. */
export const erasing = "erase";
export type Eraser = { actor: MemberId; now: number };

/**
 * Takes a person out of the tree, the trash and the whole history, for ever. The ledger first: a repeat
 * after a crash finishes it and is harmless. What was also about somebody else stays with them.
 */
export async function eraseForever(
  ledger: Ledger,
  unit: UnitOfWork,
  act: Eraser,
  id: PersonId,
  newId: () => EventId,
): Promise<Result<Erased, EraseError>> {
  await ledger.remember([id]);
  return eraseHere(unit, act, id, newId);
}

/** Erases again whoever was erased, after the tree went back to a point in time. */
export async function reapplyErasures(
  ledger: Ledger,
  unit: UnitOfWork,
  act: Eraser,
  newId: () => EventId,
): Promise<void> {
  for (const id of await ledger.all()) {
    const done = eraseHere(unit, act, id, newId);
    if (!done.ok) throw new Error(`not-erased ${done.error.code}`);
  }
}

/** The part of an erasure that is done in the tree, in one transaction. */
export function eraseHere(
  unit: UnitOfWork,
  act: Eraser,
  id: PersonId,
  newId: () => EventId,
): Result<Erased, EraseError> {
  let forms: NameForm[] = [];
  let others: NameForm[] = [];
  const done = unit.run(
    { ...act, scenario: erasing, expected: {} },
    (c): Result<Erased, EraseError> => {
      forms = formsOf(c, id);
      const state = c.history.state();
      others = namesOfOthers(state, id);
      const words = wordsOf(wholeNames(forms, others));
      if (c.kinship.get(id) !== null) {
        const gone = trash(c, id, act);
        if (!gone.ok) return gone;
      }
      const trashed = c.history.trash.get(id);
      if (trashed !== null) {
        c.history.trash.put(id, null);
        // What goes over to others does not name the one who goes, in words either.
        for (const event of trashed.events as LifeEvent[]) {
          handOver(c, trashed, event, newId, (value) => withoutNames(value, words) as typeof value);
        }
      }
      for (const other of c.history.trash.everybody()) {
        c.history.trash.put(other.id, untied(other, id));
      }
      // Somebody who went by an undo may have left rows with nothing in them.
      const left = c.life.putBack([{ kind: "life", id, value: null }]);
      if (!left.ok) return left;
      const cited = c.evidence.putBack([{ kind: "cited", id, value: null }]);
      if (!cited.ok) return cited;
      // What changed since the state was read is the person who goes and what they took.
      return { ok: true, value: { mentions: mentionsIn(c.history.state(), id, words) } };
    },
    {
      tell: (written) =>
        written
          .filter((one) => one.id !== id)
          .map((one) => ({
            ...one,
            before: scrubbed(one.before, id, wordsOf(wholeNames(forms, others))),
            after: scrubbed(one.after, id, wordsOf(wholeNames(forms, others))),
          })),
      last: (sql) => purge(sql, id, forms, others),
    },
  );
  return done.ok ? { ok: true, value: done.value.value } : done;
}

/** What others still say of a person by the whole name, for whoever erases to decide about. */
export function mentionsOf(c: Reading, id: PersonId): string[] {
  const state = c.history.state();
  return mentionsIn(state, id, wordsOf(wholeNames(formsOf(c, id), namesOfOthers(state, id))));
}

function mentionsIn(state: State, id: PersonId, words: Words): string[] {
  return Object.entries(state)
    .filter(([aggregate]) => !aggregate.endsWith(`/${id}`))
    .filter(([, value]) => textsIn(value).some((text) => words.has(text)))
    .map(([aggregate]) => aggregate);
}

function formsOf(c: Reading, id: PersonId): NameForm[] {
  const trashed = c.history.trash.get(id)?.person as PersonWritten | undefined;
  return c.kinship.get(id)?.names ?? trashed?.names ?? [];
}

/** The names of everybody else, in the tree and in the trash. */
function namesOfOthers(state: State, id: PersonId): NameForm[] {
  return Object.entries(state).flatMap(([aggregate, value]) => {
    if (aggregate.endsWith(`/${id}`)) return [];
    if (aggregate.startsWith("person/")) return (value as PersonWritten).names;
    if (aggregate.startsWith("trash/")) return ((value as Trashed).person as PersonWritten).names;
    return [];
  });
}

function textsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(textsIn);
}

/** An event that is about others too goes on with the next of them, with its citations. */
function handOver(
  c: Contexts,
  trashed: Trashed,
  event: LifeEvent,
  newId: () => EventId,
  clean: <T>(value: T) => T,
): void {
  const bin = c.history.trash;
  // Whoever is in the trash has left the event, and says there what they were in it.
  const waiting = bin
    .everybody()
    .flatMap(({ id: person, guest }) =>
      guest
        .filter((one) => one.home === trashed.id && one.event === event.id)
        .flatMap(({ roles }) => roles.map((role) => ({ person, role }))),
    );
  const others = [...event.participants, ...waiting].filter(({ person }) => {
    const isThere = c.kinship.get(person) !== null || bin.get(person) !== null;
    return person !== trashed.id && isThere;
  });
  const isOfTwo = event.kind === "wedding" || event.kind === "divorce";
  const next = others.find(({ role }) => isOfTwo || role === "principal");
  if (next === undefined) return;
  const home = next.person;
  const id = newId();
  const rest = others.filter((one) => one !== next);
  for (const { person, role } of rest) {
    const theirs = bin.get(person);
    if (theirs === null || person === home) continue;
    bin.put(person, { ...theirs, guest: [...theirs.guest, { home, event: id, roles: [role] }] });
  }
  const here = rest.filter(({ person }) => person === home || c.kinship.get(person) !== null);
  const moved = { ...event, id, participants: [next, ...here] };
  const told = clean(moved);
  const citations = (trashed.citations as Citation[])
    .filter(({ fact }) => fact.fact === factOf(event).fact)
    .map((citation) => clean({ ...citation, fact: factOf(moved) }));
  const theirs = bin.get(home);
  if (theirs !== null) {
    bin.put(home, {
      ...theirs,
      events: [...theirs.events, told],
      citations: [...theirs.citations, ...citations],
    });
    return;
  }
  const place = event.place !== null && c.places.get(event.place) === null ? null : event.place;
  const union = event.union !== null && c.kinship.union(event.union) === null ? null : event.union;
  c.life.add({ ...told, place, union });
  for (const citation of citations) c.evidence.cite(citation);
}

/** Somebody in the trash without any link to an erased person. */
function untied(trashed: Trashed, id: PersonId): Trashed {
  const marked = scrubbed(trashed, id, wordsOf([])) as Trashed;
  return withoutErased(`trash/${trashed.id}`, marked) as Trashed;
}
