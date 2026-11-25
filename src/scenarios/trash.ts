import type { Citation, EvidenceError } from "../contexts/evidence";
import type { Trashed, TrashedUnion } from "../contexts/history";
import type { KinshipError, Parentage, Person, PersonWritten, Union } from "../contexts/kinship";
import type { LifeError, LifeEvent } from "../contexts/life";
import type { EventId, MemberId, PersonId } from "../kernel/id";
import { missing } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import type { Contexts, UnitOfWork } from "./unit-of-work";

export type TrashError = KinshipError | LifeError | EvidenceError;

/** What does not come back as it was. `other` is at the other end of the link. */
export type RestorePlan = {
  /** Parentages that come back as versions, for their place is taken. */
  becomeVersions: Parentage[];
  /** Links to who or what is gone, or that would be impossible now. */
  dropped: Link[];
  /** Links to people in the trash. They come back with them. */
  waiting: Link[];
};
export type Link = {
  kind: "parentage" | "union" | "event" | "source" | "branch";
  other: string;
};

/** Puts a person in the trash with every link, so that nobody names them any more. */
export function trash(
  c: Contexts,
  id: PersonId,
  { now, actor }: { now: number; actor: MemberId },
): Result<object, TrashError> {
  const person = c.kinship.get(id);
  if (person === null) return missing(id);
  const trashed: Trashed = {
    id,
    version: 0,
    at: now,
    by: actor,
    person: writtenOf(person),
    branch: person.branch,
    children: person.children.flatMap((child) =>
      parentsOf(c, child)
        .filter(({ parent }) => parent === id)
        .map((parentage) => ({ child, parentage })),
    ),
    unions: person.unions.flatMap((one) => unionOf(c, c.kinship.union(one))),
    events: c.life.eventsOf(id).filter((event) => homeOf(event) === id),
    guest: c.life
      .eventsOf(id)
      .filter((event) => homeOf(event) !== id)
      .map((event) => ({ home: homeOf(event), event: event.id, roles: rolesOf(event, id) })),
    citations: c.evidence.citationsOf(id),
  };
  const error = takeOut(c, id, trashed);
  if (error !== null) return error;
  c.history.trash.put(id, trashed);
  return { ok: true, value: {} };
}

/** Removes a person and whatever ties them, by the rules of each context. */
function takeOut(c: Contexts, id: PersonId, trashed: Trashed): Refusal {
  const steps: (() => Result<unknown, TrashError>)[] = [
    ...[...trashed.citations, ...trashed.unions.flatMap(({ citations }) => citations)].map(
      (citation) => () => {
        const { fact, id: one } = citation as Citation;
        return c.evidence.uncite(fact, one);
      },
    ),
    ...trashed.events.map((event) => () => c.life.remove(id, (event as LifeEvent).id)),
    ...trashed.guest.map(({ home, event }) => () => {
      const told = c.life.event(home, event as EventId);
      if (told === null) return missing(event);
      const participants = told.participants.filter(({ person }) => person !== id);
      return c.life.edit(home, { ...told, participants });
    }),
    ...trashed.unions.map((one) => () => c.kinship.apply({ do: "remove-union", id: one.id })),
    ...trashed.children.map(({ child, parentage }) => () => {
      const { id: link } = parentage as Parentage;
      return c.kinship.apply({ do: "remove-parent", child, id: link });
    }),
    () => c.kinship.apply({ do: "remove-person", id }),
    // Rows with nothing in them go too: they would name whoever is gone.
    () => c.life.putBack([{ kind: "life", id, value: null }]),
    () =>
      c.evidence.putBack(
        [id, ...trashed.unions.map((one) => one.id)].map((subject) => ({
          kind: "cited",
          id: subject,
          value: null,
        })),
      ),
  ];
  for (const step of steps) {
    const result = step();
    if (!result.ok) return result;
  }
  return null;
}

/** What a restore would do, without doing it. It is the restore itself, not kept. */
export function previewRestore(unit: UnitOfWork, id: PersonId): Result<RestorePlan, TrashError> {
  return unit.preview((c) => restore(c, id));
}

/** Brings a person back from the trash, as far as the tree still lets it. */
export function restore(c: Contexts, id: PersonId): Result<RestorePlan, TrashError> {
  const trashed = c.history.trash.get(id);
  if (trashed === null) return missing(id);
  const back = new Return(c, trashed);
  const error = back.all();
  return error ?? { ok: true, value: back.plan };
}

type Refusal = { ok: false; error: TrashError } | null;

/** One return from the trash. */
class Return {
  readonly plan: RestorePlan = { becomeVersions: [], dropped: [], waiting: [] };
  readonly #c: Contexts;
  readonly #id: PersonId;
  readonly #trashed: Trashed;
  readonly #person: PersonWritten;

  constructor(c: Contexts, trashed: Trashed) {
    this.#c = c;
    this.#id = trashed.id;
    this.#trashed = trashed;
    this.#person = trashed.person as PersonWritten;
  }

  all(): Refusal {
    const { kinship, history } = this.#c;
    const { sex, living, names, mainName, parents, childOrder } = this.#person;
    const added = kinship.apply({
      do: "add-person",
      person: { id: this.#id, sex, living, names, mainName },
      branch: this.#branch(this.#trashed.branch),
    });
    if (!added.ok) return added;
    for (const one of this.#trashed.unions) this.#union(one);
    for (const link of parents) this.#parent(link);
    for (const { child, parentage } of this.#trashed.children) {
      this.#child(child, parentage as Parentage);
    }
    for (const event of this.#trashed.events) this.#event(event as LifeEvent);
    for (const { home, event, roles } of this.#trashed.guest) this.#guest(home, event, roles);
    for (const citation of this.#trashed.citations) this.#cite(citation as Citation);
    const children = kinship.get(this.#id)?.children ?? [];
    const order = childOrder.filter((child) => children.includes(child));
    kinship.apply({ do: "order-children", person: this.#id, order });
    history.trash.put(this.#id, null);
    return null;
  }

  #branch(branch: Trashed["branch"]): Trashed["branch"] {
    if (branch === null || this.#c.kinship.branch(branch) !== null) return branch;
    this.plan.dropped.push({ kind: "branch", other: branch });
    return null;
  }

  #union(one: TrashedUnion): void {
    const { kinship } = this.#c;
    const written = one.union as Pick<Union, "partners" | "kind" | "certainty">;
    const other = written.partners.find((partner) => partner !== this.#id) ?? "unknown";
    if (other !== "unknown" && kinship.get(other) === null) {
      this.#wait("union", other, (theirs) => ({ ...theirs, unions: [...theirs.unions, one] }));
      return;
    }
    const branch = this.#branch(one.branch);
    const added = kinship.apply({ do: "add-union", union: { ...written, id: one.id, branch } });
    if (!added.ok) {
      this.plan.dropped.push({ kind: "union", other });
      return;
    }
    for (const citation of one.citations) this.#cite(citation as Citation);
    for (const { child, parentage } of one.children) {
      const link = parentsOf(this.#c, child).find(({ id }) => id === parentage);
      // Whoever got another union since keeps it, and who is not a partner is refused.
      if (link?.union === null) {
        const patch = { union: one.id };
        kinship.apply({ do: "edit-parent", child, id: parentage, patch });
      }
    }
  }

  #parent(link: Parentage): void {
    const { parent } = link;
    if (parent !== "unknown" && this.#c.kinship.get(parent) === null) {
      const kept = { child: this.#id, parentage: link };
      this.#wait("parentage", parent, (theirs) => ({
        ...theirs,
        children: [...theirs.children, kept],
      }));
      return;
    }
    this.#tie(this.#id, link, parent);
  }

  #child(child: PersonId, link: Parentage): void {
    if (this.#c.kinship.get(child) === null) {
      this.#wait("parentage", child, (theirs) => {
        const person = theirs.person as PersonWritten;
        return { ...theirs, person: { ...person, parents: [...person.parents, link] } };
      });
      return;
    }
    this.#tie(child, link, child);
  }

  /** A parentage as it was, else without its union, else as a version. */
  #tie(child: PersonId, link: Parentage, other: string): void {
    const { kinship } = this.#c;
    const union = link.union !== null && kinship.union(link.union) === null ? null : link.union;
    const parentage = { ...link, union };
    const add = (one: Parentage) => kinship.apply({ do: "add-parent", child, parentage: one });
    const added = add(parentage);
    if (added.ok) return;
    const version = { ...parentage, main: false };
    if (added.error.code === "third-main-blood-parent" && add(version).ok) {
      this.plan.becomeVersions.push(version);
    } else this.plan.dropped.push({ kind: "parentage", other });
  }

  #event(event: LifeEvent): void {
    const { kinship, life, places } = this.#c;
    const participants = event.participants.filter(({ person, role }) => {
      if (kinship.get(person) !== null) return true;
      const guest = { home: this.#id, event: event.id, roles: [role] };
      this.#wait("event", person, (theirs) => ({ ...theirs, guest: [...theirs.guest, guest] }));
      return false;
    });
    const place = event.place !== null && places.get(event.place) === null ? null : event.place;
    const union = event.union !== null && kinship.union(event.union) === null ? null : event.union;
    life.add({ ...event, participants, place, union });
  }

  #guest(home: PersonId, event: string, roles: string[]): void {
    const { kinship, life } = this.#c;
    if (kinship.get(home) === null) {
      this.#wait("event", home, (theirs) => ({
        ...theirs,
        events: (theirs.events as LifeEvent[]).map((one) =>
          one.id === event ? this.#joined(one, roles) : one,
        ),
      }));
      return;
    }
    const told = life.event(home, event as EventId);
    if (told === null || !life.edit(home, this.#joined(told, roles)).ok) {
      this.plan.dropped.push({ kind: "event", other: home });
    }
  }

  #joined(event: LifeEvent, roles: string[]): LifeEvent {
    const more = roles.map((role) => ({ person: this.#id, role }));
    return { ...event, participants: [...event.participants, ...more] };
  }

  #cite(citation: Citation): void {
    if (this.#c.evidence.cite(citation).ok) return;
    this.plan.dropped.push({ kind: "source", other: citation.source });
  }

  /** Leaves a link with the one at its other end, if they are in the trash too. */
  #wait(kind: Link["kind"], other: PersonId, keep: (theirs: Trashed) => Trashed): void {
    const { trash: bin } = this.#c.history;
    const theirs = bin.get(other);
    if (theirs === null) this.plan.dropped.push({ kind, other });
    else {
      bin.put(other, keep(theirs));
      this.plan.waiting.push({ kind, other });
    }
  }
}

function writtenOf({ sex, living, names, mainName, parents, childOrder }: Person): PersonWritten {
  return { sex, living, names, mainName, parents, childOrder };
}

function unionOf(c: Contexts, union: Union | null): TrashedUnion[] {
  if (union === null) return [];
  const { id, partners, kind, certainty, branch } = union;
  const children = partners.flatMap((partner) =>
    partner === "unknown" ? [] : (c.kinship.get(partner)?.children ?? []),
  );
  return [
    {
      id,
      union: { partners, kind, certainty },
      branch,
      citations: c.evidence.citationsOf(id),
      children: [...new Set(children)].flatMap((child) =>
        parentsOf(c, child)
          .filter((link) => link.union === id)
          .map((link) => ({ child, parentage: link.id })),
      ),
    },
  ];
}

function parentsOf(c: Contexts, child: PersonId): Parentage[] {
  return c.kinship.get(child)?.parents ?? [];
}

function homeOf({ participants }: LifeEvent): PersonId {
  const [first] = participants;
  if (first === undefined) throw new Error("event-of-nobody");
  return first.person;
}

function rolesOf({ participants }: LifeEvent, id: PersonId): string[] {
  return participants.filter(({ person }) => person === id).map(({ role }) => role);
}
