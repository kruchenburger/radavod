import { foldName } from "../../src/kernel/name-form";
import type { TreeNameForm, TreePerson, TreeSnapshot } from "../../src/shared/tree";

export type Found = {
  person: TreePerson;
  /** The name it was found by, when it is not the one shown. */
  form: TreeNameForm | null;
};

type Text = { words: string[]; form: TreeNameForm | null; rank: number };

const wordsOf = (...parts: (string | null)[]): string[] =>
  foldName(parts.filter((part) => part !== null).join(" "))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");

/** Looks through every form of every name and the main places, word by word. */
export function searchOf({ people, places }: TreeSnapshot): (query: string) => Found[] {
  const placeWords = new Map(
    places.map(({ id, names }) => [id, wordsOf(...names.map(({ text }) => text))]),
  );
  const index = people.map((person) => {
    const named = ({ given, patronymic, surname }: TreeNameForm): string[] =>
      wordsOf(given, patronymic, surname);
    const texts: Text[] = [
      ...(person.name === null ? [] : [{ words: named(person.name), form: null, rank: 0 }]),
      ...person.otherNames.map((form) => ({ words: named(form), form, rank: 1 })),
    ];
    return { person, texts, place: placeWords.get(person.place ?? "") ?? [] };
  });

  return (query) => {
    const asked = wordsOf(query);
    if (asked.length === 0) return [];
    const found: (Found & { rank: number })[] = [];
    for (const { person, texts, place } of index) {
      let best: (Found & { rank: number }) | null = null;
      for (const { words, form, rank } of texts.length > 0 ? texts : [nothing]) {
        const missing = asked.filter((word) => !words.some((own) => own.startsWith(word)));
        if (missing.some((word) => !place.some((own) => own.startsWith(word)))) continue;
        const isWhole = asked.every((word) => words.includes(word));
        const isByPlace = missing.length === asked.length;
        const own = (isByPlace ? 8 : missing.length > 0 ? 4 : 0) + rank * 2 + (isWhole ? 0 : 1);
        if (best === null || own < best.rank) {
          best = { person, form: isByPlace ? null : form, rank: own };
        }
      }
      if (best !== null) found.push(best);
    }
    return found.sort((a, b) => a.rank - b.rank).map(({ person, form }) => ({ person, form }));
  };
}

const nothing: Text = { words: [], form: null, rank: 0 };
