/** Something a command names is not there. */
export type Missing = { code: "missing"; id: string };
/** It is there already. */
export type Duplicate = { code: "duplicate" };

/** Something else names it, so many times. */
export type InUse = { code: "in-use"; count: number };

type Refusal<E> = { ok: false; error: E };

export const duplicate: Refusal<Duplicate> = { ok: false, error: { code: "duplicate" } };

export function inUse(count: number): Refusal<InUse> {
  return { ok: false, error: { code: "in-use", count } };
}

export function missing(id: string): Refusal<Missing> {
  return { ok: false, error: { code: "missing", id } };
}
