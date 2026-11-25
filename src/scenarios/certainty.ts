import type { EvidenceError } from "../contexts/evidence";
import type { KinshipError, Parentage, Union } from "../contexts/kinship";
import { eventOf, type LifeError, type LifeEvent } from "../contexts/life";
import { type Certainty, needsCitation } from "../kernel/certainty";
import { type FactRef, isId, type PersonId, type UnionId } from "../kernel/id";
import type { NameForm } from "../kernel/name-form";
import { type Missing, missing } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import type { CiteFactInput, SetCertaintyInput, UnciteInput } from "../shared/scenarios";
import type { Contexts, Reading } from "./unit-of-work";

/**
 * How well a fact is known. Each context keeps the certainty of its facts; the rule that a fact of one
 * source or a confirmed one needs a citation spans them and evidence, so it lives here.
 */

export type CitationRequired = { code: "citation-required" };
export type CertaintyError = CitationRequired | Missing | KinshipError | LifeError | EvidenceError;

type Fact =
  | { of: "name"; person: PersonId; name: NameForm }
  | { of: "parentage"; person: PersonId; link: Parentage }
  | { of: "union"; union: Union }
  | { of: "event"; home: PersonId; event: LifeEvent };

const citationRequired = { ok: false, error: { code: "citation-required" } } as const;

/** The certainty of a fact, null when there is no such fact. */
export function certaintyOf(c: Pick<Reading, "kinship" | "life">, fact: FactRef): Certainty | null {
  const found = factIn(c, fact);
  if (found === null) return null;
  switch (found.of) {
    case "name":
      return found.name.certainty;
    case "parentage":
      return found.link.certainty;
    case "union":
      return found.union.certainty;
    case "event":
      return found.event.certainty;
  }
}

export function setCertainty(
  c: Contexts,
  { fact, certainty }: SetCertaintyInput,
): Result<object, CertaintyError> {
  if (needsCitation(certainty) && c.evidence.countFor(fact) === 0) return citationRequired;
  return put(c, fact, certainty);
}

/** Cites a source behind a fact, a new source with it, and says how well the fact is known now. */
export function citeFact(c: Contexts, input: CiteFactInput): Result<object, CertaintyError> {
  const { fact, source, citation, page = "", quote = "", certainty } = input;
  if (factIn(c, fact) === null) return missing(fact.fact);
  if (typeof source !== "string") {
    const added = c.evidence.addSource(source);
    if (!added.ok) return added;
  }
  const id = typeof source === "string" ? source : source.id;
  const cited = c.evidence.cite({ id: citation, source: id, fact, page, quote });
  if (!cited.ok) return cited;
  return certainty === undefined ? { ok: true, value: {} } : setCertainty(c, { fact, certainty });
}

/** Takes a citation back. A fact the last one stood behind is a hypothesis again. */
export function uncite(
  c: Contexts,
  { fact, citation }: UnciteInput,
): Result<object, CertaintyError> {
  const taken = c.evidence.uncite(fact, citation);
  if (!taken.ok) return taken;
  const now = certaintyOf(c, fact);
  if (taken.value.left > 0 || now === null || now === "hypothesis") return { ok: true, value: {} };
  return put(c, fact, "hypothesis");
}

/**
 * Whether new facts may be called so: a new fact has no citation yet. It is for scenarios that make
 * facts with a certainty given.
 */
export function asNew(certainties: readonly Certainty[]): Result<object, CitationRequired> {
  return certainties.some(needsCitation) ? citationRequired : { ok: true, value: {} };
}

function put(c: Contexts, fact: FactRef, certainty: Certainty): Result<object, CertaintyError> {
  const found = factIn(c, fact);
  if (found === null) return missing(fact.fact);
  switch (found.of) {
    case "name":
      return c.kinship.apply({
        do: "put-name",
        person: found.person,
        name: { ...found.name, certainty },
      });
    case "parentage":
      return c.kinship.apply({
        do: "edit-parent",
        child: found.person,
        id: found.link.id,
        patch: { certainty },
      });
    case "union":
      return c.kinship.apply({ do: "edit-union", id: found.union.id, patch: { certainty } });
    case "event":
      return c.life.edit(found.home, { ...found.event, certainty });
  }
}

/** Where a fact is kept: "name:<id>", "parentage:<id>" and events of a person, "union" of a union. */
function factIn(c: Pick<Reading, "kinship" | "life">, fact: FactRef): Fact | null {
  const event = eventOf(fact);
  if (event !== null) {
    const found = c.life.event(event.home, event.id);
    return found && { of: "event", home: event.home, event: found };
  }
  const { subject, fact: what } = fact;
  if (isId("union", subject)) {
    const union = what === "union" ? c.kinship.union(subject as UnionId) : null;
    return union && { of: "union", union };
  }
  const person = isId("person", subject) ? c.kinship.get(subject) : null;
  if (person === null) return null;
  const [kind, id] = [what.slice(0, what.indexOf(":")), what.slice(what.indexOf(":") + 1)];
  if (kind === "name") {
    const name = person.names.find((one) => one.id === id);
    return name ? { of: "name", person: person.id, name } : null;
  }
  if (kind === "parentage") {
    const link = person.parents.find((one) => one.id === id);
    return link ? { of: "parentage", person: person.id, link } : null;
  }
  return null;
}
