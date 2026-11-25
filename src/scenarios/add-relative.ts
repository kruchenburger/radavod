import type { KinshipError, Parentage } from "../contexts/kinship";
import type { PersonId, UnionId } from "../kernel/id";
import { type Missing, missing } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import type { AddRelativeInput } from "../shared/scenarios";
import { asNew, type CitationRequired } from "./certainty";
import type { Contexts } from "./unit-of-work";

export type AddRelativeError = KinshipError | Missing | CitationRequired;

/**
 * Adds a parent, a partner or a child to a person: somebody new, somebody who is there, or a parent or
 * partner nobody knows. A child born into a union gets both partners as main blood parents; a child of
 * one person has the other parent unknown. A new link is a hypothesis.
 */
export function addRelative(
  c: Contexts,
  input: AddRelativeInput,
): Result<{ person: PersonId | null }, AddRelativeError> {
  const { of, person } = input;
  if (c.kinship.get(of) === null) return missing(of);
  let relative: PersonId | "unknown" = "unknown";
  if (person !== "unknown" && "existing" in person) relative = person.existing;
  else if (person !== "unknown") {
    const sure = asNew(person.names.map(({ certainty }) => certainty));
    if (!sure.ok) return sure;
    const added = c.kinship.apply({ do: "add-person", person, branch: null });
    if (!added.ok) return added;
    relative = person.id;
  }
  const done = linked(c, input, relative);
  if (!done.ok) return done;
  return { ok: true, value: { person: relative === "unknown" ? null : relative } };
}

function linked(
  c: Contexts,
  input: AddRelativeInput,
  relative: PersonId | "unknown",
): Result<unknown, KinshipError | Missing> {
  const { of } = input;
  switch (input.as) {
    case "parent":
      return addParent(c, of, relative, input.union ?? null);
    case "partner":
      return c.kinship.apply({
        do: "add-union",
        union: {
          id: input.union,
          partners: [of, relative],
          kind: "unknown",
          branch: null,
          certainty: "hypothesis",
        },
      });
    case "child": {
      // The child is somebody: a child nobody knows is refused by the input.
      const child = relative as PersonId;
      const union = input.union ?? null;
      if (union === null) return addParent(c, child, of, null);
      const found = c.kinship.union(union);
      if (found === null) return missing(union);
      // The person it is added to comes first; a partner nobody knows leads to nobody.
      const parents = [of, ...found.partners.filter((one) => one !== of && one !== "unknown")];
      for (const parent of parents) {
        const added = addParent(c, child, parent, union);
        if (!added.ok) return added;
      }
      return { ok: true, value: null };
    }
  }
}

function addParent(
  c: Contexts,
  child: PersonId,
  parent: PersonId | "unknown",
  union: UnionId | null,
): Result<unknown, KinshipError> {
  const parentage: Parentage = {
    id: linkId(c.kinship.get(child)?.parents ?? [], parent),
    parent,
    union,
    kind: "blood",
    main: true,
    certainty: "hypothesis",
  };
  return c.kinship.apply({ do: "add-parent", child, parentage });
}

/** The identifier of a link within the child: the parent's, and a number when that is taken. */
function linkId(links: readonly Parentage[], parent: PersonId | "unknown"): string {
  const taken = new Set(links.map(({ id }) => id));
  let id: string = parent;
  for (let n = 2; taken.has(id); n++) id = `${parent}-${n}`;
  return id;
}
