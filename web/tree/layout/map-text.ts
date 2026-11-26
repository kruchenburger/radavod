import type { TreePerson } from "../../../src/shared/tree";
import { detailRuns } from "./around-text";
import type { BranchMap, MapCard } from "./branch-map";
import { flow, type Run } from "./text";
import type { CardText, Line, Measure, TextStyle, Wording } from "./types";

type MapTextOptions = {
  map: Pick<BranchMap, "metrics" | "pages">;
  measure: Measure;
  wording: Wording;
  person: (id: string) => TreePerson | undefined;
};

/** Room for the sign of a union before a name, and the share of a card its name takes. */
const ring = 16;
const nameShare = 23 / 42;

/**
 * Texts of one card: the name, then the years and the branch when it is not that of the page. The
 * canvas does not hold them: thousands of cards are never on the screen at once.
 */
export function mapText(card: MapCard, options: MapTextOptions): Line[] {
  const { metrics } = options.map;
  const indent = ring * card.level;
  const name = { lineHeight: metrics.line * nameShare, indent, lines: 1 };
  const size = { measure: options.measure, width: metrics.w, ...name };
  if (card.reference !== undefined) {
    const { title, detail } = options.wording.reference(card.reference);
    const style: TextStyle = "nearReference";
    const runs: Run[] = [
      { text: title, part: "title", style },
      { text: detail, part: "detail", style },
    ];
    return flow(runs, size);
  }
  const person = card.person === null ? undefined : options.person(card.person);
  if (person === undefined) return [];
  const text = options.wording.person(person);
  const lines = flow(nameRuns(text, card), size);
  const page = options.map.pages[card.page];
  const branch = person.branch !== null && person.branch === page?.branch ? "" : text.branch;
  const runs = detailRuns({ ...text, branch }, "nearDetail");
  const below = metrics.line * nameShare;
  return [...lines, ...flow(runs, { ...size, y: below, lineHeight: metrics.line - below })];
}

/** The length of the bar that stands for a name on the strip of the whole: as long as the name. */
export function barOf(
  text: CardText,
  { metrics }: Pick<BranchMap, "metrics">,
  measure: Measure,
): number {
  const full = measure(`${text.given} ${text.surname}`, "nearName");
  return Math.min(metrics.w, Math.max(0.42 * metrics.w, full));
}

function nameRuns({ given, surname }: CardText, { direct }: MapCard): Run[] {
  const style: TextStyle = direct ? "nearNameDirect" : "nearName";
  return [
    { text: given, part: "given", style },
    { text: surname, part: "surname", style },
  ];
}
