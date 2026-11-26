import type { Problem, Table } from "./table";

/** What an import of a table will add, told before anything is added. */
export type Preview = {
  people: {
    row: number;
    given: string;
    patronymic: string;
    surname: string;
    /** The surname at birth, when the table gives one apart. */
    maiden: string | null;
    born: string | null;
    died: string | null;
    living: "yes" | "no" | "unknown";
  }[];
  unions: number;
  /** Links from a child to a parent. */
  parents: number;
  births: number;
  deaths: number;
  sources: number;
  left: Table["left"];
  problems: Problem[];
};

/** What a table adds; `refused` are the problems of the parents the tree would not take. */
export function previewOf(
  { people, unions, links, problems, left }: Table,
  refused: readonly Problem[] = [],
): Preview {
  return {
    people: people.map(({ row, names, birth, death, living }) => {
      const [current, born] = names;
      return {
        row,
        given: current?.given ?? "",
        patronymic: current?.patronymic ?? "",
        surname: current?.surname ?? "",
        maiden: born?.surname ?? null,
        born: birth?.text ?? null,
        died: death?.text ?? null,
        living,
      };
    }),
    unions: unions.length,
    parents:
      people.filter(({ father }) => father !== null).length +
      people.filter(({ mother }) => mother !== null).length -
      refused.length,
    births: people.filter(({ birth }) => birth !== null).length,
    deaths: people.filter(({ death }) => death !== null).length,
    sources: links.length,
    left,
    problems: [...problems, ...refused].sort((a, b) => a.row - b.row),
  };
}
