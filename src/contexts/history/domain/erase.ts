import { ERASED as erased, ERASED_IN_WORDS, type PersonId } from "../../../kernel/id";
import type { NameForm } from "../../../kernel/name-form";
import type { Patch } from "./entry";

type Parts = Pick<NameForm, "given" | "patronymic" | "surname">;

/**
 * The ways to write a whole name. A part of a name alone is of others too, and so is a whole name that
 * somebody else has: nobody's is taken because somebody else was erased. A name of one word is never
 * looked for.
 */
export function wholeNames(forms: readonly Parts[], others: readonly Parts[] = []): string[] {
  const theirs = new Set(allWays(others));
  return allWays(forms).filter((name) => !theirs.has(name));
}

function allWays(forms: readonly Parts[]): string[] {
  const whole = forms.flatMap(({ given, patronymic, surname }) =>
    [
      [given, surname],
      [surname, given],
      [given, patronymic, surname],
      [surname, given, patronymic],
      ...(surname.trim() === "" ? [[given, patronymic]] : []),
    ]
      .map((parts) => parts.map((part) => part.trim()))
      .filter((parts) => parts.every((part) => part !== ""))
      .map((parts) => parts.join(" ")),
  );
  // The longest first, so that no part of it is left.
  return [...new Set(whole)].sort((a, b) => b.length - a.length);
}

/** Whole names to look for in texts, as words. */
export type Words = { has(text: string): boolean; clean(text: string): string };

/** Patterns of the names, made once for one erasure and forgotten with it. */
export function wordsOf(names: readonly string[]): Words {
  const patterns = names.map((name) => ({
    name,
    pattern: new RegExp(
      `(?<![\\p{L}\\p{N}])${name.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&")}(?![\\p{L}\\p{N}])`,
      "gu",
    ),
  }));
  return {
    has: (text) =>
      patterns.some(({ name, pattern }) => {
        pattern.lastIndex = 0;
        return text.includes(name) && pattern.test(text);
      }),
    clean: (text) =>
      patterns.reduce(
        (clean, { name, pattern }) =>
          clean.includes(name) ? clean.replace(pattern, ERASED_IN_WORDS) : clean,
        text,
      ),
  };
}

/**
 * The names a person ever had, by the patches of all entries in their order. A name that was edited part
 * by part stands whole in none of them, so the state after each entry is made anew.
 */
export function namesOverTime(
  entries: readonly (readonly Patch[])[],
  id: PersonId,
  then: (value: unknown, patch: Patch) => unknown,
): NameForm[] {
  const values = new Map<string, unknown>();
  return entries.flatMap((patches) => {
    const own = patches.filter(({ aggregate }) => isOf(aggregate, id));
    for (const patch of own) {
      values.set(patch.aggregate, then(values.get(patch.aggregate) ?? null, patch));
    }
    return [...values.values(), ...own.map(({ before }) => before)].flatMap(formsIn);
  });
}

function formsIn(value: unknown): NameForm[] {
  if (typeof value !== "object" || value === null) return [];
  if ("given" in value && "surname" in value && "patronymic" in value) return [value as NameForm];
  return Object.values(value).flatMap(formsIn);
}

/** The patches of an entry without a person: none about them, none that names them. */
export function withoutPerson(patches: readonly Patch[], id: PersonId, words: Words): Patch[] {
  return patches
    .filter(({ aggregate }) => !isOf(aggregate, id))
    .map(({ aggregate, path, before, after }) => ({
      aggregate,
      path,
      before: scrubbed(before, id, words),
      after: scrubbed(after, id, words),
    }));
}

/** A value with a mark in the place of a person and of the whole names. */
export function scrubbed(value: unknown, id: PersonId, words: Words): unknown {
  return inTexts(value, (text) =>
    words.clean(text === id ? erased : text.replaceAll(id, ERASED_IN_WORDS)),
  );
}

/** A value with a mark in the place of the whole names. */
export function withoutNames(value: unknown, words: Words): unknown {
  return inTexts(value, (text) => words.clean(text));
}

function inTexts(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === "string") return change(value);
  if (Array.isArray(value)) return value.map((one) => inTexts(one, change));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, inTexts(one, change)]));
}

function isOf(aggregate: string, id: PersonId): boolean {
  return aggregate.endsWith(`/${id}`);
}
