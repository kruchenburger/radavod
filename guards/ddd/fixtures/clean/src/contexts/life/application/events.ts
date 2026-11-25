import type { Person } from "../../kinship";
import type { Place } from "../../places";
import type { Event } from "../domain/event";

// kinship_person is owned by kinship: a comment is not SQL.
export const born = (who: Person, where: Place): Event => ({
  id: "1",
  personId: who.id,
  placeId: where.id,
});
