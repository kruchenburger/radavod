import { z } from "zod";
import type { MemberId } from "../../../kernel/id";
import { type Migration as Step, migrateBy } from "../../../shared/migrate";

type Migration = Step<SqlStorage>;
import { BadWrite, CorruptRow, jsonOf } from "../../../shared/rows";
import { memberIdSchema, personIdSchema } from "../../../shared/values";
import type { AccessStore } from "../application/ports";
import type { Credential } from "../domain/credential";
import type { Invitation } from "../domain/invitation";
import type { Limit } from "../domain/limits";
import type { LogEntry } from "../domain/log";
import type { Change, Member, SetupCode } from "../domain/member";
import type { Session } from "../domain/session";

/** The steps every database of the access of a family goes through. */
export const accessSteps: Migration[] = [
  {
    number: 1,
    up(sql) {
      // The ledger of erasures made its table before there were steps.
      sql.exec("CREATE TABLE IF NOT EXISTS access_erased (id TEXT PRIMARY KEY) WITHOUT ROWID");
      sql.exec(`CREATE TABLE access_member (
        id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
      ) WITHOUT ROWID`);
      sql.exec(`CREATE TABLE access_invitation (
        id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, data TEXT NOT NULL
      ) WITHOUT ROWID`);
      sql.exec(`CREATE TABLE access_credential (
        id TEXT PRIMARY KEY, member TEXT NOT NULL, data TEXT NOT NULL
      ) WITHOUT ROWID`);
      sql.exec(`CREATE TABLE access_session (
        hash TEXT PRIMARY KEY, member TEXT NOT NULL, expires_at INTEGER NOT NULL, data TEXT NOT NULL
      ) WITHOUT ROWID`);
      sql.exec(
        "CREATE TABLE access_setup (hash TEXT PRIMARY KEY, used_at INTEGER NOT NULL) WITHOUT ROWID",
      );
      sql.exec(`CREATE TABLE access_log (
        number INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, data TEXT NOT NULL
      )`);
      // Keys of tries are kept hashed with a salt of this family: an address never lies here.
      sql.exec(
        "CREATE TABLE access_salt (id INTEGER PRIMARY KEY CHECK (id = 1), salt TEXT NOT NULL)",
      );
      sql.exec("INSERT INTO access_salt (id, salt) VALUES (1, ?)", crypto.randomUUID());
      sql.exec(`CREATE TABLE access_attempt (
        number INTEGER PRIMARY KEY AUTOINCREMENT, limit_of TEXT NOT NULL, key TEXT NOT NULL,
        at INTEGER NOT NULL
      )`);
    },
  },
];

/** Brings the database of the access of a family to the last step. */
export function migrateAccess(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
  steps: readonly Migration[] = accessSteps,
): void {
  migrateBy(storage, steps, {
    create: "CREATE TABLE IF NOT EXISTS access_schema (number INTEGER PRIMARY KEY)",
    last: "SELECT max(number) AS last FROM access_schema",
    record: "INSERT INTO access_schema (number) VALUES (?)",
  });
}

const roleSchema = z.enum(["reader", "editor", "keeper"]);
const time = z.int().nonnegative();
const text = z.string().min(1);

const memberSchema = z.strictObject({
  name: z.string(),
  role: roleSchema,
  person: personIdSchema.nullable(),
  createdAt: time,
  revokedAt: time.nullable(),
}) satisfies z.ZodType<Omit<Member, "id" | "version">>;

const invitationSchema = z.strictObject({
  id: text,
  hash: text,
  role: roleSchema,
  person: personIdSchema.nullable(),
  by: memberIdSchema,
  expiresAt: time,
  spentAt: time.nullable(),
  kind: z.enum(["join", "recovery"]),
  member: memberIdSchema.nullable(),
}) satisfies z.ZodType<Invitation>;

const credentialSchema = z.strictObject({
  id: text,
  member: memberIdSchema,
  kind: z.enum(["passkey", "device"]),
  publicKey: z.string().exactOptional(),
  counter: z.int().nonnegative().exactOptional(),
  createdAt: time,
  lastUsedAt: time,
  revokedAt: time.nullable(),
  label: z.string(),
}) satisfies z.ZodType<Credential>;

const sessionSchema = z.strictObject({
  hash: text,
  member: memberIdSchema,
  credential: text,
  expiresAt: time,
}) satisfies z.ZodType<Session>;

const logSchema = z.strictObject({
  at: time,
  kind: z.enum(["sign-in", "recovery"]),
  member: memberIdSchema,
  credential: text.nullable(),
  by: memberIdSchema.nullable(),
  // A country, never an address.
  country: z
    .string()
    .regex(/^[A-Z]{2}$/u)
    .nullable(),
}) satisfies z.ZodType<LogEntry>;

/** The newest entries of the log a keeper reads. */
const logShown = 500;

type Row = { data: string };

export function sqliteAccess(sql: SqlStorage): AccessStore {
  const parsed = <T>(schema: z.ZodType<T>, key: string, data: unknown): T => {
    const value = schema.safeParse(jsonOf(data));
    if (!value.success) throw new CorruptRow(key);
    return value.data;
  };
  const written = <T>(schema: z.ZodType<T>, key: string, value: unknown): string => {
    const data = JSON.stringify(value);
    if (!schema.safeParse(jsonOf(data)).success) throw new BadWrite(key);
    return data;
  };
  const rows = <T extends Row>(query: string, ...bindings: unknown[]) =>
    sql.exec<T>(query, ...bindings).toArray();

  const memberOf = ({ id, version, data }: Row & { id: string; version: number }): Member => {
    const key = `member/${id}`;
    const checked = memberIdSchema.safeParse(id);
    if (!checked.success || !time.safeParse(version).success) throw new CorruptRow(key);
    return { ...parsed(memberSchema, key, data), id: checked.data, version };
  };
  const invitationOf = ({ id, data }: Row & { id: string }) =>
    parsed(invitationSchema, `invitation/${id}`, data);
  const credentialOf = ({ id, data }: Row & { id: string }) =>
    parsed(credentialSchema, `credential/${id}`, data);
  // A session is known by its hash, which is no secret but is not shown either.
  const sessionOf = ({ data }: Row) => parsed(sessionSchema, "session", data);

  const invitations = () =>
    rows<Row & { id: string }>("SELECT id, data FROM access_invitation ORDER BY id").map(
      invitationOf,
    );

  return {
    member(id) {
      const [row] = rows<Row & { id: string; version: number }>(
        "SELECT id, version, data FROM access_member WHERE id = ?",
        id,
      );
      return row === undefined ? null : memberOf(row);
    },
    members: () =>
      rows<Row & { id: string; version: number }>(
        "SELECT id, version, data FROM access_member ORDER BY id",
      ).map(memberOf),
    invitation(id) {
      const [row] = rows<Row & { id: string }>(
        "SELECT id, data FROM access_invitation WHERE id = ?",
        id,
      );
      return row === undefined ? null : invitationOf(row);
    },
    invitationByHash(hash) {
      const [row] = rows<Row & { id: string }>(
        "SELECT id, data FROM access_invitation WHERE hash = ?",
        hash,
      );
      return row === undefined ? null : invitationOf(row);
    },
    invitations,
    recoveriesOf: (member) =>
      invitations().filter(
        (one) => one.kind === "recovery" && one.member === member && one.spentAt === null,
      ),
    isCodeUsed: (hash) =>
      sql.exec("SELECT 1 FROM access_setup WHERE hash = ?", hash).toArray().length > 0,
    isErased: (person) =>
      sql.exec("SELECT 1 FROM access_erased WHERE id = ?", person).toArray().length > 0,
    credential(id) {
      const [row] = rows<Row & { id: string }>(
        "SELECT id, data FROM access_credential WHERE id = ?",
        id,
      );
      return row === undefined ? null : credentialOf(row);
    },
    credentialsOf: (member) =>
      rows<Row & { id: string }>(
        "SELECT id, data FROM access_credential WHERE member = ? ORDER BY id",
        member,
      ).map(credentialOf),
    session(hash) {
      const [row] = rows<Row>("SELECT data FROM access_session WHERE hash = ?", hash);
      return row === undefined ? null : sessionOf(row);
    },
    sessionsOf: (member) =>
      rows<Row>("SELECT data FROM access_session WHERE member = ? ORDER BY hash", member).map(
        sessionOf,
      ),
    save(change: Change) {
      for (const write of change) {
        switch (write.kind) {
          case "member":
            saveMember(write.id, write.after);
            break;
          case "invitation": {
            const { id, after } = write;
            if (after === null) sql.exec("DELETE FROM access_invitation WHERE id = ?", id);
            else {
              const data = written(invitationSchema, `invitation/${id}`, after);
              sql.exec(
                `INSERT INTO access_invitation (id, hash, expires_at, data) VALUES (?, ?, ?, ?)
                  ON CONFLICT (id) DO UPDATE SET hash = excluded.hash,
                  expires_at = excluded.expires_at, data = excluded.data`,
                id,
                after.hash,
                after.expiresAt,
                data,
              );
            }
            break;
          }
          case "credential": {
            const { id, after } = write;
            if (after === null) sql.exec("DELETE FROM access_credential WHERE id = ?", id);
            else {
              const data = written(credentialSchema, `credential/${id}`, after);
              sql.exec(
                `INSERT INTO access_credential (id, member, data) VALUES (?, ?, ?)
                  ON CONFLICT (id) DO UPDATE SET member = excluded.member, data = excluded.data`,
                id,
                after.member,
                data,
              );
            }
            break;
          }
          case "session": {
            const { id, after } = write;
            if (after === null) sql.exec("DELETE FROM access_session WHERE hash = ?", id);
            else {
              const data = written(sessionSchema, "session", after);
              sql.exec(
                `INSERT INTO access_session (hash, member, expires_at, data) VALUES (?, ?, ?, ?)
                  ON CONFLICT (hash) DO UPDATE SET member = excluded.member,
                  expires_at = excluded.expires_at, data = excluded.data`,
                id,
                after.member,
                after.expiresAt,
                data,
              );
            }
            break;
          }
          case "setup":
            saveSetup(write.id, write.after);
            break;
        }
      }
    },
    triesOf: (limit, key, since) =>
      sql
        .exec<{ at: number }>(
          "SELECT at FROM access_attempt WHERE limit_of = ? AND key = ? AND at > ?",
          limit,
          key,
          since,
        )
        .toArray()
        .map(({ at }) => at),
    salt: () => sql.exec<{ salt: string }>("SELECT salt FROM access_salt").one().salt,
    tried(limit: Limit, key: string, at: number) {
      sql.exec("INSERT INTO access_attempt (limit_of, key, at) VALUES (?, ?, ?)", limit, key, at);
    },
    log(entry) {
      const data = written(logSchema, "log", entry);
      sql.exec("INSERT INTO access_log (at, data) VALUES (?, ?)", entry.at, data);
    },
    logged: () =>
      rows<Row>("SELECT data FROM access_log ORDER BY at DESC, number DESC LIMIT ?", logShown).map(
        ({ data }) => parsed(logSchema, "log", data),
      ),
    clean(now, triesBefore) {
      sql.exec("DELETE FROM access_session WHERE expires_at <= ?", now);
      sql.exec("DELETE FROM access_invitation WHERE expires_at <= ?", now);
      sql.exec("DELETE FROM access_attempt WHERE at <= ?", triesBefore);
    },
    isWaiting: () =>
      sql
        .exec<{ waiting: number }>(
          `SELECT EXISTS (SELECT 1 FROM access_session) OR EXISTS (SELECT 1 FROM access_invitation)
            OR EXISTS (SELECT 1 FROM access_attempt) AS waiting`,
        )
        .one().waiting === 1,
  };

  /** A member counts its own versions: each write is one more. */
  function saveMember(id: MemberId, after: Member | null): void {
    if (after === null) {
      sql.exec("DELETE FROM access_member WHERE id = ?", id);
      return;
    }
    const { id: _id, version: _version, ...value } = after;
    const data = written(memberSchema, `member/${id}`, value);
    sql.exec(
      `INSERT INTO access_member (id, version, data) VALUES (?, 1, ?)
        ON CONFLICT (id) DO UPDATE SET version = version + 1, data = excluded.data`,
      id,
      data,
    );
  }

  function saveSetup(hash: string, after: SetupCode | null): void {
    if (after === null) sql.exec("DELETE FROM access_setup WHERE hash = ?", hash);
    else {
      sql.exec(
        "INSERT INTO access_setup (hash, used_at) VALUES (?, ?) ON CONFLICT (hash) DO NOTHING",
        hash,
        after.usedAt,
      );
    }
  }
}
