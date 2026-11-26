import type { TreePerson } from "../../../src/shared/tree";
import { detailRuns } from "./around-text";
import { type BranchMap, type MapCard, mapMetrics } from "./branch-map";
import { flow, type Run } from "./text";
import type { CardText, Line, Measure, TextStyle, Wording } from "./types";

type MapTextOptions = {
  map: Pick<BranchMap, "level" | "metrics" | "pages">;
  measure: Measure;
  wording: Wording;
  person: (id: string) => TreePerson | undefined;
};

/** Room for the sign of a union before a name, and the share of a card its name takes. */
const ring = { far: 0, closer: 14, near: 16 };
const nameShare = { far: 1, closer: 1, near: 23 / 42 };

/**
 * Texts of one card. The map does not hold them: thousands of cards are never on the screen at
 * once. From far there is no text, see `barOf`.
 */
export function mapText(card: MapCard, options: MapTextOptions): Line[] {
  const { level, metrics } = options.map;
  if (level === "far") return [];
  const indent = ring[level] * card.level;
  const name = { lineHeight: metrics.line * nameShare[level], indent, lines: 1 };
  const size = { measure: options.measure, width: metrics.w, ...name };
  if (card.reference !== undefined) {
    const { title, detail } = options.wording.reference(card.reference);
    const style: TextStyle = level === "near" ? "nearReference" : "closerReference";
    const runs: Run[] = [
      { text: title, part: "title", style },
      { text: detail, part: "detail", style },
    ];
    return flow(runs, size);
  }
  const person = card.person === null ? undefined : options.person(card.person);
  if (person === undefined) return [];
  const text = options.wording.person(person);
  const lines = flow(nameRuns(text, card, level), size);
  if (level === "closer") return lines;
  const page = options.map.pages[card.page];
  const branch = person.branch !== null && person.branch === page?.branch ? "" : text.branch;
  const runs = detailRuns({ ...text, branch }, "nearDetail");
  const below = metrics.line * nameShare.near;
  return [...lines, ...flow(runs, { ...size, y: below, lineHeight: metrics.line - below })];
}

/** The length of the bar that stands for a name from far: as long as the name, within bounds. */
export function barOf(
  text: CardText,
  { metrics }: Pick<BranchMap, "metrics">,
  measure: Measure,
): number {
  const full = measure(`${text.given} ${text.surname}`, "closerName");
  const share = full / mapMetrics.closer.w;
  return metrics.w * Math.min(1, Math.max(0.42, share));
}

function nameRuns(
  { given, surname }: CardText,
  { direct }: MapCard,
  level: "closer" | "near",
): Run[] {
  const style: TextStyle = `${level}Name${direct ? "Direct" : ""}`;
  return [
    { text: given, part: "given", style },
    { text: surname, part: "surname", style },
  ];
}
