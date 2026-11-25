import type { ExampleFamily } from "./family.ts";
import { kinOf } from "./kin.ts";

const reach = 3;

/**
 * Who stands in the centre first, so that nothing of the first screen is empty: somebody of the
 * direct line with three generations on both sides, and several unions or children. Of those, the
 * one with the most people around; the first of the family when that is the same. Null when there
 * is nobody.
 */
export function fullestOfLine(family: ExampleFamily, line: string): string | null {
  const kin = kinOf(family);
  const around = (person: string, next: (id: string) => string[]): string[][] => {
    const generations: string[][] = [];
    const seen = new Set([person]);
    let front = [person];
    for (let i = 0; i < reach; i += 1) {
      front = [...new Set(front.flatMap(next))].filter((id) => !seen.has(id));
      for (const id of front) seen.add(id);
      generations.push(front);
    }
    return generations;
  };

  const isOnLine = kin.ancestors(line).add(line);
  let best: { person: string; people: number } | null = null;
  for (const { id } of family.people) {
    if (!isOnLine.has(id)) continue;
    const generations = [...around(id, kin.parents), ...around(id, kin.children)];
    if (generations.some((people) => people.length === 0)) continue;
    const hasMuch = new Set(kin.partners(id)).size > 1 || new Set(kin.children(id)).size > 2;
    if (!hasMuch) continue;
    const people = generations.flat().length;
    if (best === null || people > best.people) best = { person: id, people };
  }
  return best?.person ?? null;
}
