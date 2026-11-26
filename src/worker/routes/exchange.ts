import type { Hono } from "hono";
import { jsonOf } from "../../shared/rows";
import { type ImportTableInput, importTableInput, type TableImported } from "../../shared/exchange";
import { allow, type Api, type ApiContext, badRequest, refused } from "../auth";
import { FAMILY_ID, stubFor } from "../stub";

/**
 * A request is read no further than this: a table of the most rows and characters the import takes
 * is far smaller, even in the bytes of UTF-8 and quoted in JSON.
 */
const MOST_BYTES = 8_000_000;

/** Import into the tree. A keeper does it: the rights call it exchange. */
export function exchangeRoutes(app: Hono<Api>): void {
  // What a table would add, with every problem of it. Nothing is written.
  app.post("/api/import/table/preview", allow("exchange"), async (c) => {
    const input = await tableOf(c);
    if (input === "too-large") return refused(c, { code: input });
    if (input === null) return badRequest(c);
    const preview = await treeOf(c).previewTable(input.text);
    return preview.ok ? c.json(preview.value) : refused(c, preview.error);
  });

  app.post("/api/import/table", allow("exchange"), async (c) => {
    const input = await tableOf(c);
    if (input === "too-large") return refused(c, { code: input });
    if (input === null) return badRequest(c);
    const done = await treeOf(c).importTable(input.text, c.get("signed").member, Date.now());
    if (!done.ok) return refused(c, done.error);
    const answer: TableImported = { people: done.value.people.length };
    return c.json(answer, 201);
  });
}

/** The body by its schema, read in parts and given up at the limit, whatever its length says. */
async function tableOf(c: ApiContext): Promise<ImportTableInput | "too-large" | null> {
  if (Number(c.req.header("content-length") ?? 0) > MOST_BYTES) return "too-large";
  const reader = c.req.raw.body?.getReader();
  if (reader === undefined) return null;
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > MOST_BYTES) {
      await reader.cancel();
      return "too-large";
    }
    parts.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  const parsed = importTableInput.safeParse(jsonOf(new TextDecoder().decode(bytes)));
  return parsed.success ? parsed.data : null;
}

function treeOf(c: ApiContext) {
  return stubFor(c.env.TREE, FAMILY_ID, c.env);
}
