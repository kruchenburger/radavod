import { type FuzzyDate, lastDay, sortKey } from "../../../kernel/fuzzy-date";
import type { EventId, PersonId } from "../../../kernel/id";
import type { EventKind, LifeEvent } from "./event";
import { eventsOf, type LifeReader, mainOf } from "./life";

/** Something odd but possible. It is told and blocks nothing. */
export type Warning =
  | { code: "death-before-birth"; birth: EventId; death: EventId }
  | { code: "parent-younger-than-child"; parent: PersonId; child: PersonId }
  | { code: "event-after-death"; event: EventId; death: EventId };

/** A child by blood or adoption, and the parent. */
export type Descent = { parent: PersonId; child: PersonId };

/** "About" is taken for so many days either way. */
const about = 5 * 365.25;
/** What may come after the death of whoever takes part: a child may be born, and a family remembers. */
const posthumous: readonly EventKind[] = ["birth", "burial", "other"];

/** Warnings about a person, given only when the dates leave no doubt. */
export function warningsOf(
  reader: LifeReader,
  id: PersonId,
  descents: readonly Descent[],
): Warning[] {
  const warnings: Warning[] = [];
  const birth = mainOf(reader, id, "birth");
  const death = mainOf(reader, id, "death");
  if (birth && death && isBefore(death.date, birth.date)) {
    warnings.push({ code: "death-before-birth", birth: birth.id, death: death.id });
  }
  for (const { parent, child } of descents) {
    const [older, younger] = [mainOf(reader, parent, "birth"), mainOf(reader, child, "birth")];
    if (older && younger && isBefore(younger.date, older.date)) {
      warnings.push({ code: "parent-younger-than-child", parent, child });
    }
  }
  if (death) {
    for (const event of eventsOf(reader, id)) {
      const isOwnDeath = event.kind === "death" && homeOf(event) === id;
      if (isOwnDeath || posthumous.includes(event.kind)) continue;
      if (isBefore(death.date, event.date)) {
        warnings.push({ code: "event-after-death", event: event.id, death: death.id });
      }
    }
  }
  return warnings;
}

function homeOf({ participants }: LifeEvent): PersonId | undefined {
  return participants[0]?.person;
}

/** Whether every day the first may be is before every day the second may be. */
function isBefore(first: FuzzyDate | null, second: FuzzyDate | null): boolean {
  const last = first && lastDay(first);
  const start = second && sortKey(second);
  if (first === null || second === null || last === null || start === null) return false;
  return last + doubtOf(first) < start - doubtOf(second);
}

function doubtOf({ parsed }: FuzzyDate): number {
  return parsed?.qualifier === "about" ? about : 0;
}
