import { z } from "zod";
import type { Certainty } from "../kernel/certainty";
import type { FuzzyDate, ParsedDate, PartialDate } from "../kernel/fuzzy-date";
import type { FactRef, Id } from "../kernel/id";
import type { Language, NameForm, NameKind, Script } from "../kernel/name-form";

/** Schemas of the values of the kernel, strict: what is stored and what comes in is read by them. */

export const certaintySchema = z.enum([
  "hypothesis",
  "one-source",
  "confirmed",
  "contradiction",
  "unresolved",
]) satisfies z.ZodType<Certainty>;

export const languageSchema = z.enum([
  "ru",
  "be",
  "pl",
  "lt",
  "yi",
  "la",
  "en",
  "other",
]) satisfies z.ZodType<Language>;

export const scriptSchema = z.enum(["Cyrl", "Latn", "Hebr", "other"]) satisfies z.ZodType<Script>;

export const nameKindSchema = z.enum([
  "birth",
  "married",
  "church",
  "nickname",
  "variant",
]) satisfies z.ZodType<NameKind>;

/** 22 characters of base58: no 0, O, I and l. */
const base58 = "[1-9A-HJ-NP-Za-km-z]{22}";

function idOf<K extends string>(kind: K) {
  const pattern = new RegExp(`^${kind}_${base58}$`);
  return z.custom<Id<K>>((value) => typeof value === "string" && pattern.test(value));
}

export const personIdSchema = idOf("person");
export const unionIdSchema = idOf("union");
export const eventIdSchema = idOf("event");
export const placeIdSchema = idOf("place");
export const sourceIdSchema = idOf("source");
export const citationIdSchema = idOf("citation");
export const branchIdSchema = idOf("branch");
export const memberIdSchema = idOf("member");

export const factRefSchema = z.strictObject({
  subject: z.union([personIdSchema, unionIdSchema]),
  fact: z.string().min(1),
}) satisfies z.ZodType<FactRef>;

/** The identifier of a thing within an aggregate. Paths of the journal are parted by "/". */
export const partIdSchema = z.string().regex(/^[^/]+$/);

export const nameFormSchema = z.strictObject({
  id: partIdSchema,
  language: languageSchema,
  script: scriptSchema,
  kind: nameKindSchema,
  given: z.string(),
  patronymic: z.string(),
  surname: z.string(),
  certainty: certaintySchema,
}) satisfies z.ZodType<NameForm>;

const partialDateSchema = z.strictObject({
  year: z.int(),
  month: z.int().min(1).max(12).exactOptional(),
  day: z.int().min(1).max(31).exactOptional(),
}) satisfies z.ZodType<PartialDate>;

const parsedDateSchema = z.strictObject({
  qualifier: z.enum(["exact", "about", "before", "after", "between"]),
  calendar: z.enum(["julian", "gregorian"]),
  from: partialDateSchema,
  to: partialDateSchema.exactOptional(),
}) satisfies z.ZodType<ParsedDate>;

export const fuzzyDateSchema = z.strictObject({
  text: z.string(),
  parsed: parsedDateSchema.nullable(),
}) satisfies z.ZodType<FuzzyDate>;
