import { z } from "zod";

/** What /config tells anybody, before a sign-in. */
export const configSchema = z.object({
  /** Whether the invented family may be opened here. */
  sample: z.boolean(),
});

export type Config = z.infer<typeof configSchema>;
