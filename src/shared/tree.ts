import { z } from "zod";

/**
 * The tree as the browser gets it: what the drawing and the search need. Citations, the journal and
 * contacts are not here. The server will produce it; the words are those of docs/glossary.md.
 */

const id = z.string().min(1);
const text = z.object({ ru: z.string(), en: z.string() });

const language = z.enum(["ru", "be", "pl", "lt", "yi", "la", "en", "other"]);

export const certaintySchema = z.enum([
  "hypothesis",
  "one-source",
  "confirmed",
  "contradiction",
  "unresolved",
]);

const nameFormSchema = z.object({
  kind: z.enum(["birth", "married", "church", "nickname", "variant"]),
  language,
  script: z.enum(["Cyrl", "Latn", "Hebr", "other"]),
  given: z.string().nullable(),
  patronymic: z.string().nullable(),
  surname: z.string().nullable(),
  certainty: certaintySchema,
});

const yearSchema = z.object({
  /** Digits: "1885", "1880–1885". An unread date keeps the words of its source. */
  text: z.string(),
  /** The interface turns it into words, for example "about". */
  qualifier: z.enum(["exact", "about", "before", "after", "between", "unread"]),
  /** Gregorian day number of the earliest possible day. */
  sort: z.int().nullable(),
});

const parentageSchema = z.object({
  id,
  /** Null for a parent who is known to exist and nothing more. */
  parent: id.nullable(),
  kind: z.enum(["blood", "adoption", "guardianship", "unknown"]),
  /** False for a version that contradicts the main one. */
  main: z.boolean(),
  certainty: certaintySchema,
});

const personSchema = z.object({
  id,
  sex: z.enum(["male", "female", "other", "unknown"]),
  living: z.enum(["yes", "no", "unknown"]),
  /** The form shown. Null for a person nobody named. */
  name: nameFormSchema.nullable(),
  otherNames: z.array(nameFormSchema),
  branch: id.nullable(),
  parents: z.array(parentageSchema),
  /** The main version of the birth and of the death. */
  birth: yearSchema.nullable(),
  death: yearSchema.nullable(),
  /** The main place, for the search and the card. */
  place: id.nullable(),
});

const unionSchema = z.object({
  id,
  kind: z.enum(["marriage", "civil", "unknown"]),
  /** Null for a partner nobody knows. */
  partners: z.tuple([id, id.nullable()]),
  /** The day it began, counted like `sort` of a year. It orders the unions of a person. */
  began: z.int().nullable(),
  certainty: certaintySchema,
});

const branchSchema = z.object({
  id,
  title: text,
  /** The number of one of the twelve branch colors. */
  color: z.int().min(0).max(11),
});

const placeSchema = z.object({
  id,
  names: z.array(z.object({ text: z.string(), language })),
});

export const treeSnapshotSchema = z.object({
  /** The shape of this file. */
  format: z.literal(1),
  /** The edit of the tree it was taken after. */
  version: z.int().nonnegative(),
  people: z.array(personSchema),
  unions: z.array(unionSchema),
  branches: z.array(branchSchema),
  places: z.array(placeSchema),
});

export type TreeSnapshot = z.infer<typeof treeSnapshotSchema>;
export type TreePerson = z.infer<typeof personSchema>;
export type TreeParentage = z.infer<typeof parentageSchema>;
export type TreeUnion = z.infer<typeof unionSchema>;
export type TreeBranch = z.infer<typeof branchSchema>;
export type TreeYear = z.infer<typeof yearSchema>;
export type TreeNameForm = z.infer<typeof nameFormSchema>;
export type Certainty = z.infer<typeof certaintySchema>;
