import type { AccessReader } from "./member";

/**
 * The words of the nicknames a member gets when nobody gave a name: an adjective and a creature, as
 * keys. Each language writes them in its own words, so a nickname reads in the language of whoever
 * reads it. They are the domain's own, as the roles are; the browser keeps a copy of the keys.
 */
export const NICKNAME_ADJECTIVES = [
  "rabid",
  "brave",
  "cheerful",
  "sleepy",
  "curious",
  "sly",
  "dashing",
  "noisy",
  "quiet",
  "swift",
  "thoughtful",
  "mischievous",
  "cozy",
  "proud",
  "wise",
  "perky",
  "dreamy",
  "stubborn",
  "busy",
  "gentle",
  "spirited",
  "thrifty",
  "restless",
  "gallant",
  "sunny",
  "starry",
  "secret",
  "daring",
  "humble",
  "elusive",
  "singing",
  "dancing",
  "flying",
  "learned",
  "lucky",
  "tireless",
  "mysterious",
  "generous",
  "punctual",
  "brilliant",
] as const;

export const NICKNAME_CREATURES = [
  "dinosaur",
  "owl",
  "hedgehog",
  "fox",
  "badger",
  "mink",
  "raccoon",
  "squirrel",
  "marmot",
  "hare",
  "robin",
  "lemur",
  "dragon",
  "seagull",
  "penguin",
  "turtle",
  "lynx",
  "bumblebee",
  "dolphin",
  "seal",
  "jay",
  "moose",
  "gecko",
  "tiger",
  "sparrow",
  "chickadee",
  "wolf",
  "bear",
  "narwhal",
  "lark",
  "ant",
  "butterfly",
  "unicorn",
  "phoenix",
  "griffin",
  "marten",
  "bullfinch",
  "swan",
  "cat",
  "panda",
] as const;

/** A playful name of two words, by their keys: whoever reads it sees it in their language. */
export type Nickname = { adjective: string; creature: string };

/** The words nicknames are made of, by their keys. */
export type Words = { adjectives: readonly string[]; creatures: readonly string[] };

const words: Words = { adjectives: NICKNAME_ADJECTIVES, creatures: NICKNAME_CREATURES };

export type NicknamesSpent = { code: "nicknames-spent" };
export const nicknamesSpent = { ok: false, error: { code: "nicknames-spent" } } as const;

const keyOf = ({ adjective, creature }: Nickname): string => `${adjective} ${creature}`;

/**
 * A nickname nobody in the family has: no member, revoked ones too, since a keeper still sees them,
 * and no invitation not yet spent. The seed is a random number made outside; null when every pair is
 * taken. Other words are for tests only.
 */
export function nicknameFor(
  reader: AccessReader,
  seed: number,
  from: Words = words,
): Nickname | null {
  const taken = new Set<string>();
  for (const member of reader.members()) {
    if (member.nickname !== null) taken.add(keyOf(member.nickname));
  }
  for (const invitation of reader.invitations()) {
    if (invitation.nickname !== null) taken.add(keyOf(invitation.nickname));
  }
  const free = from.adjectives
    .flatMap((adjective) => from.creatures.map((creature) => ({ adjective, creature })))
    .filter((one) => !taken.has(keyOf(one)));
  if (free.length === 0) return null;
  return free[Math.abs(Math.trunc(seed)) % free.length] ?? null;
}
