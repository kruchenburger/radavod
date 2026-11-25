/** Something a command names is not there: an aggregate, a parentage or a name. */
export type Missing = { code: "missing"; id: string };
/** It is there already. */
export type Duplicate = { code: "duplicate" };

type Refusal<E> = { ok: false; error: E };

export const duplicate: Refusal<Duplicate> = { ok: false, error: { code: "duplicate" } };

export function missing(id: string): Refusal<Missing> {
  return { ok: false, error: { code: "missing", id } };
}
