/** Places, their names and historical affiliation. */
export { placesTables, sqlitePlaces } from "./adapters/sqlite-places";
export { type Places, placesOver } from "./application/places";
export type { PlacesStore } from "./application/ports";
export type { Change, NewPlace, Period, Place, PlacePatch, PlaceTarget } from "./domain/place";
