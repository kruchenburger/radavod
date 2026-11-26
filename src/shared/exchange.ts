import { z } from "zod";

/** What the import of a family table takes and answers, for the Worker and the browser alike. */

/** The pages of import and export: a member's pages, served as those of access are. */
export const EXCHANGE_PAGES = ["/import"] as const;

export const importTableInput = z.strictObject({ text: z.string() });

const count = z.int().nonnegative();
const row = z.int().positive();

export const problemCodes = [
  "unknown-generation",
  "unknown-sex",
  "unknown-month",
  "impossible-date",
  "unreadable-date",
  "male-patronymic",
  "female-patronymic",
  "missing-father",
  "missing-mother",
  "same-parent",
  "parent-cycle",
  "parent-generation",
  "father-female",
  "mother-male",
  "unknown-spouse",
  "ambiguous-spouse",
] as const;

export const tablePreview = z.strictObject({
  people: z.array(
    z.strictObject({
      row,
      given: z.string(),
      patronymic: z.string(),
      surname: z.string(),
      maiden: z.string().nullable(),
      born: z.string().nullable(),
      died: z.string().nullable(),
      living: z.enum(["yes", "no", "unknown"]),
    }),
  ),
  unions: count,
  parents: count,
  births: count,
  deaths: count,
  sources: count,
  left: z.strictObject({ statuses: count, notes: count }),
  problems: z.array(
    z.strictObject({
      row,
      code: z.enum(problemCodes),
      value: z.string().exactOptional(),
      parent: row.exactOptional(),
      rows: z.array(row).exactOptional(),
      more: z.literal(true).exactOptional(),
    }),
  ),
});

export const tableImported = z.strictObject({ people: count });

export type ImportTableInput = z.infer<typeof importTableInput>;
export type TablePreview = z.infer<typeof tablePreview>;
export type TableImported = z.infer<typeof tableImported>;
