import type { TreePerson } from "../../src/shared/tree";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { kinOf } from "../tree/layout/kin";
import type { Line } from "../tree/layout/types";
import { cssFont, rem } from "../tree/type";
import type { Words } from "../tree/words";
import { useData } from "./data";

type ApartLinksProps = {
  lines: Line[];
  className: string | undefined;
  /** Where the name of the other partner leads. */
  hrefOf: (other: TreePerson) => string;
};

/** Partners who stand apart, named under a card: each name is a link of its own beside the card's. */
export function ApartLinks({ lines, className, hrefOf }: ApartLinksProps) {
  const { snapshot, words } = useData();
  return lines.map((line) => {
    const other = line.to === undefined ? undefined : kinOf(snapshot).person(line.to);
    if (line.part !== "apart" || other === undefined) return null;
    return (
      <Link
        key={`apart ${other.id}`}
        className={className}
        href={hrefOf(other)}
        aria-label={words.apart(other)}
        style={{ left: rem(line.x), top: rem(line.y), font: cssFont(line.style, line.h) }}
      >
        {line.text}
      </Link>
    );
  });
}

type Said = { direct: boolean; isSpouse?: boolean; folded?: number | undefined };

/** A card in one sentence for a screen reader: the name, years, branch, and what the card shows. */
export function useCardLabel(): (person: TreePerson, words: Words, said: Said) => string {
  const { t } = useLanguage();
  return (person, words, { direct, isSpouse = false, folded }) => {
    const name = words.name(person);
    return [
      isSpouse ? t("tree.partner", { name }) : name,
      words.person(person).years,
      words.branch(person.branch),
      ...(direct ? [t("tree.direct")] : []),
      ...(folded === undefined ? [] : [t("tree.folded", { number: folded })]),
    ].join(", ");
  };
}
