import { z } from "zod";

const part = z.enum(["ok", "error"]);

/** What /health answers, with 200 when everything is up and 503 when a part is down. */
export const healthSchema = z.object({
  status: part,
  version: z.string(),
  tree: part,
  access: part,
});

export type Health = z.infer<typeof healthSchema>;
