import { z } from "zod";
import {
  branchIdSchema,
  certaintySchema,
  citationIdSchema,
  factRefSchema,
  nameFormSchema,
  partIdSchema,
  personIdSchema,
  sourceIdSchema,
  unionIdSchema,
} from "./values";

/** What the scenarios of the tree take, for the Worker and the browser alike. Each is strict. */

const sexSchema = z.enum(["male", "female", "other", "unknown"]);
const livingSchema = z.enum(["yes", "no", "unknown"]);

export const newPersonInput = z.strictObject({
  id: personIdSchema,
  sex: sexSchema,
  living: livingSchema,
  names: z.array(nameFormSchema),
  /** Null shows the first name. */
  mainName: partIdSchema.nullable(),
});

const existing = z.strictObject({ existing: personIdSchema });
const anybody = z.union([newPersonInput, existing, z.literal("unknown")]);

export const addRelativeInput = z.discriminatedUnion("as", [
  z.strictObject({
    of: personIdSchema,
    as: z.literal("parent"),
    person: anybody,
    /** The union of the parent the person was born or taken into. */
    union: unionIdSchema.exactOptional(),
  }),
  z.strictObject({
    of: personIdSchema,
    as: z.literal("partner"),
    person: anybody,
    /** The identifier of the union the two make. */
    union: unionIdSchema,
  }),
  z.strictObject({
    of: personIdSchema,
    as: z.literal("child"),
    /** A child nobody knows is no relative to add. */
    person: z.union([newPersonInput, existing]),
    /** The union the child is born into; both partners become its parents. */
    union: unionIdSchema.exactOptional(),
  }),
]);

export const editPersonInput = z.strictObject({
  id: personIdSchema,
  patch: z.strictObject({
    sex: sexSchema.exactOptional(),
    living: livingSchema.exactOptional(),
    mainName: partIdSchema.exactOptional(),
  }),
});

export const newSourceInput = z.strictObject({
  id: sourceIdSchema,
  kind: z.enum(["document", "book", "story", "site", "import", "other"]),
  title: z.string(),
  repository: z.string(),
  note: z.string(),
});

export const citeFactInput = z.strictObject({
  fact: factRefSchema,
  /** A source that is there, or a new one. */
  source: z.union([sourceIdSchema, newSourceInput]),
  citation: citationIdSchema,
  page: z.string().exactOptional(),
  quote: z.string().exactOptional(),
  /** What the fact is known as once the citation stands behind it. */
  certainty: certaintySchema.exactOptional(),
});

export const unciteInput = z.strictObject({ fact: factRefSchema, citation: citationIdSchema });

export const setCertaintyInput = z.strictObject({
  fact: factRefSchema,
  certainty: certaintySchema,
});

export const assignBranchInput = z.strictObject({
  person: personIdSchema,
  branch: branchIdSchema.nullable(),
  descendants: z.boolean(),
  /** Also those descendants who have a branch. */
  overwrite: z.boolean(),
});

export type AddRelativeInput = z.infer<typeof addRelativeInput>;
export type EditPersonInput = z.infer<typeof editPersonInput>;
export type CiteFactInput = z.infer<typeof citeFactInput>;
export type UnciteInput = z.infer<typeof unciteInput>;
export type SetCertaintyInput = z.infer<typeof setCertaintyInput>;
export type AssignBranchInput = z.infer<typeof assignBranchInput>;
