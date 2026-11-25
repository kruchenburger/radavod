import type { EvidenceError, EvidenceTarget } from "../contexts/evidence";
import type { FamilyTarget, KinshipError } from "../contexts/kinship";
import type { LifeError, LifeTarget } from "../contexts/life";
import type { PlaceTarget } from "../contexts/places";
import { inUse } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import type { Contexts } from "./unit-of-work";

/** An aggregate as "kind/id" and its value as the journal has it, null when it is not there. */
export type Target = { aggregate: string; value: unknown };

export type PutBackError = KinshipError | LifeError | EvidenceError;

/**
 * Puts aggregates of several contexts as they were. Each context keeps its rules, and nothing that goes
 * may be named by what stays. The values come from the journal, and the rows they make are checked by
 * their schemas when they are written.
 */
export function putBack(c: Contexts, targets: readonly Target[]): Result<object, PutBackError> {
  const all = targets.map(({ aggregate, value }) => {
    const [kind = "", id = ""] = aggregate.split("/");
    return { kind, id, value };
  });
  const of = <T>(...kinds: string[]) => all.filter(({ kind }) => kinds.includes(kind)) as T[];
  const isThere = ({ value }: { value: unknown }) => value !== null;
  const [places, evidence] = [of<PlaceTarget>("place"), of<EvidenceTarget>("source", "cited")];

  const family = c.kinship.putBack(
    of<FamilyTarget>("person", "union", "branch", "person-branch", "union-branch"),
  );
  if (!family.ok) return family;
  c.places.putBack(places.filter(isThere));
  const cited = c.evidence.putBack(evidence);
  if (!cited.ok) return cited;
  const lives = c.life.putBack(of<LifeTarget>("life"));
  if (!lives.ok) return lives;

  const gone = places.filter((place) => !isThere(place));
  for (const { id } of gone) {
    const count = c.life.countAt(id);
    if (count > 0) return inUse(count);
  }
  c.places.putBack(gone);
  for (const target of of<FamilyTarget>("person", "union")) {
    if (target.value !== null) continue;
    const events = target.kind === "person" ? c.life.eventsOf(target.id).length : 0;
    const citations =
      target.kind === "person" || target.kind === "union"
        ? c.evidence.citationsOf(target.id).length
        : 0;
    if (events + citations > 0) return inUse(events + citations);
  }
  return { ok: true, value: {} };
}
