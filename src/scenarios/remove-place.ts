import type { PlaceId } from "../kernel/id";
import { type InUse, inUse, type Missing } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import type { Contexts } from "./unit-of-work";

/** Removes a place no event happened at. */
export function removePlace(
  { life, places }: Pick<Contexts, "life" | "places">,
  id: PlaceId,
): Result<object, Missing | InUse> {
  const count = life.countAt(id);
  return count > 0 ? inUse(count) : places.remove(id);
}
