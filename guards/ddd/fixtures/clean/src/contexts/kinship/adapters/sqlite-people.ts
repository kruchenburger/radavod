import { person } from "../domain/person";
import type { People } from "../application/people";

export const migration = `CREATE TABLE IF NOT EXISTS kinship_person (id TEXT PRIMARY KEY, data TEXT NOT NULL)`;
export const select = "SELECT data FROM kinship_person WHERE id = ?";
export const sqlitePeople: People = { find: (id) => person(id) };
