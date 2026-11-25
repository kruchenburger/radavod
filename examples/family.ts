/**
 * The shape of the example family. It uses the words of the domain but is not the domain model: the
 * app never imports it.
 */

export type Text = { ru: string; en: string };

export type Language = "ru" | "be" | "pl" | "lt" | "yi" | "la" | "en";
export type Script = "Cyrl" | "Latn" | "Hebr";
export type Certainty = "hypothesis" | "one-source" | "confirmed" | "contradiction" | "unresolved";

export type PartialDate = { year: number; month?: number; day?: number };

/** A date as the source writes it, and what could be read in it, down to the smallest known part. */
export type FuzzyDate = {
  text: string;
  parsed: null | {
    qualifier: "exact" | "about" | "before" | "after" | "between";
    precision: "day" | "month" | "year";
    calendar: "julian" | "gregorian";
    from: PartialDate;
    /** The second date of "between". */
    to: PartialDate | null;
  };
};

export type NameForm = {
  id: string;
  kind: "birth" | "married" | "church" | "nickname" | "variant";
  language: Language;
  script: Script;
  given: string | null;
  patronymic: string | null;
  surname: string | null;
  certainty: Certainty;
};

export type Person = {
  id: string;
  sex: "male" | "female" | "unknown";
  living: "yes" | "no" | "unknown";
  branch: string | null;
  /** The first form is the one shown. A person nobody named has none. */
  names: NameForm[];
};

export type Branch = {
  id: string;
  name: Text;
  /** A number in the set of branch colors. */
  color: number;
};

/** One link from a child to a parent. A null parent is known to exist and nothing more. */
export type Parentage = {
  id: string;
  child: string;
  parent: string | null;
  kind: "blood" | "adoption" | "guardianship" | "unknown";
  /** False for a version that contradicts the main one. */
  main: boolean;
  certainty: Certainty;
};

export type Union = {
  id: string;
  kind: "marriage" | "civil" | "unknown";
  partners: [string, string];
  certainty: Certainty;
};

export type FamilyEvent = {
  id: string;
  kind: "birth" | "baptism" | "wedding" | "divorce" | "emigration" | "death" | "burial";
  date: FuzzyDate | null;
  place: string | null;
  participants: { person: string; role: "principal" | "godparent" | "witness" }[];
  union: string | null;
  /** False for a second version of the same birth or death. */
  main: boolean;
  certainty: Certainty;
};

export type PlaceName = {
  text: string;
  language: Language;
  script: Script;
  from: number | null;
  to: number | null;
};

export type Place = {
  id: string;
  names: PlaceName[];
  affiliations: { name: Text; from: number; to: number | null }[];
  coordinates: null;
};

export type SourceKind = "register" | "census" | "document" | "photo" | "story";
export type Source = { id: string; kind: SourceKind; title: string };

/** A fact is a name form, a parentage, a union or an event. */
export type Citation = { id: string; source: string; fact: string; detail: string };

export type ExampleFamily = {
  branches: Branch[];
  people: Person[];
  parentages: Parentage[];
  unions: Union[];
  /** The union where all branches meet. */
  lastCouple: string;
  events: FamilyEvent[];
  places: Place[];
  sources: Source[];
  citations: Citation[];
};

/** JSON with one record per line, so a change shows up as the records it touches. */
export function serialize(family: ExampleFamily): string {
  const parts = Object.entries(family).map(([key, value]) => {
    const body = Array.isArray(value)
      ? `[\n${value.map((record) => JSON.stringify(record)).join(",\n")}\n]`
      : JSON.stringify(value);
    return `${JSON.stringify(key)}: ${body}`;
  });
  return `{\n${parts.join(",\n")}\n}\n`;
}
