import { type FuzzyDate, lastDay, sortKey } from "../../../kernel/fuzzy-date";
import type { EventId, PersonId } from "../../../kernel/id";
import type { EventKind } from "./event";
import { eventsOf, type LifeReader, mainOf } from "./life";

/** Something odd but possible. It is told and blocks nothing. */
export type Warning =
  | { code: "death-before-birth"; birth: EventId; death: EventId }
  | { code: "parent-younger-than-child"; parent: PersonId; child: PersonId }
  | { code: "event-after-death"; event: EventId; death: EventId };

/** A child by blood or adoption, and the parent. */
export type Descent = { parent: PersonId; child: PersonId };

/** "About" is taken for so many days either way. */
const aboutDays = 5 * 365.25;
/** What may come after a death: a child is born, a verdict is taken back, a family remembers. */
const posthumous: readonly EventKind[] = ["birth", "burial", "repression", "other"];
/** Who was there. Whoever has another role may only be named, as a dead father at a wedding. */
const present: readonly string[] = ["principal", "godparent", "witness"];

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
      const [about, ...others] = event.participants;
      const isOwn = about?.person === id;
      const wasThere = others.some((one) => one.person === id && present.includes(one.role));
      if (posthumous.includes(event.kind) || (isOwn && event.kind === "death")) continue;
      if ((isOwn || wasThere) && isBefore(death.date, event.date)) {
        warnings.push({ code: "event-after-death", event: event.id, death: death.id });
      }
    }
  }
  return warnings;
}

/** Whether every day the first may be is before every day the second may be. */
function isBefore(first: FuzzyDate | null, second: FuzzyDate | null): boolean {
  const last = first && lastDay(first);
  const start = second && sortKey(second);
  if (first === null || second === null || last === null || start === null) return false;
  return last + doubtOf(first) < start - doubtOf(second);
}

function doubtOf({ parsed }: FuzzyDate): number {
  return parsed?.qualifier === "about" ? aboutDays : 0;
}
