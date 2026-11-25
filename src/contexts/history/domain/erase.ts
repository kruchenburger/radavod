import type { PersonId } from "../../../kernel/id";
import type { NameForm } from "../../../kernel/name-form";
import type { Patch } from "./entry";

/** Stands for an erased person where others were tied to them. */
const erased = "erased";

/**
 * The ways to write a whole name. A part of a name alone is of others too: nobody's is taken because
 * somebody else was erased.
 */
export function wholeNames(forms: readonly Pick<NameForm, "given" | "patronymic" | "surname">[]) {
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

/** Whether a text has a whole name in it, as words. */
export function speaksOf(text: string, names: readonly string[]): boolean {
  return names.some((name) => asWords(name).test(text));
}

function asWords(text: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${text.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&")}(?![\\p{L}\\p{N}])`,
    "gu",
  );
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
export function withoutPerson(
  patches: readonly Patch[],
  id: PersonId,
  names: readonly string[],
): Patch[] {
  return patches
    .filter(({ aggregate }) => !isOf(aggregate, id))
    .map(({ aggregate, path, before, after }) => ({
      aggregate,
      path,
      before: scrubbed(before, id, names),
      after: scrubbed(after, id, names),
    }));
}

/** A value with a mark in the place of a person and of the whole names. */
export function scrubbed(value: unknown, id: PersonId, names: readonly string[]): unknown {
  return inTexts(value, (text) => unnamed(text.replaceAll(id, erased), names));
}

/** A value with a mark in the place of the whole names. */
export function withoutNames(value: unknown, names: readonly string[]): unknown {
  return inTexts(value, (text) => unnamed(text, names));
}

function unnamed(text: string, names: readonly string[]): string {
  return names.reduce((clean, name) => clean.replace(asWords(name), erased), text);
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
