import type { Person } from "../domain/person";

export type People = { find(id: string): Person | undefined };
