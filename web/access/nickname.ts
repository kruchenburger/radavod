import { NICKNAME_ADJECTIVES, type NICKNAME_CREATURES } from "../../src/shared/nickname";
import type { Key, Params } from "../i18n/t";

type Creature = (typeof NICKNAME_CREATURES)[number];

/** The gender of each creature in Russian, which the adjective of a nickname agrees with. */
const genders: Readonly<Record<Creature, "m" | "f">> = {
  dinosaur: "m",
  owl: "f",
  hedgehog: "m",
  fox: "f",
  badger: "m",
  mink: "f",
  raccoon: "m",
  squirrel: "f",
  marmot: "m",
  hare: "m",
  robin: "f",
  lemur: "m",
  dragon: "m",
  seagull: "f",
  penguin: "m",
  turtle: "f",
  lynx: "f",
  bumblebee: "m",
  dolphin: "m",
  seal: "f",
  jay: "f",
  moose: "m",
  gecko: "m",
  tiger: "m",
  sparrow: "m",
  chickadee: "f",
  wolf: "m",
  bear: "m",
  narwhal: "m",
  lark: "m",
  ant: "m",
  butterfly: "f",
  unicorn: "m",
  phoenix: "m",
  griffin: "m",
  marten: "f",
  bullfinch: "m",
  swan: "m",
  cat: "f",
  panda: "f",
};

type Named = { name: string; nickname: { adjective: string; creature: string } | null };

/**
 * What to call a member or whom a link lets in: the name they go by, else their nickname in the
 * language of the page, the adjective agreeing with the creature. A nickname of words the page does
 * not know, from a newer server, reads as nothing rather than as keys.
 */
export function nameOf(
  t: (key: Key, params?: Params) => string,
  { name, nickname }: Named,
): string {
  if (name !== "" || nickname === null) return name;
  const { adjective, creature } = nickname;
  const adjectives: readonly string[] = NICKNAME_ADJECTIVES;
  if (!adjectives.includes(adjective) || !Object.hasOwn(genders, creature)) return "";
  const gender = genders[creature as Creature];
  return `${t(`nickname.adjective.${adjective}.${gender}` as Key)} ${t(`nickname.creature.${creature}` as Key)}`;
}
