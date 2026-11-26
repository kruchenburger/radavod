import type { AccessStore, Change, Limit, LogEntry } from "../../src/contexts/access";
import type { MemberId } from "../../src/kernel/id";

type Saved<Kind extends string> = NonNullable<Extract<Change[number], { kind: Kind }>["after"]>;

/** The access of a family in memory, as a database holds it: copies, changed only by `save`. */
export class MemoryAccess implements AccessStore {
  readonly rows = {
    member: new Map<string, Saved<"member">>(),
    invitation: new Map<string, Saved<"invitation">>(),
    credential: new Map<string, Saved<"credential">>(),
    session: new Map<string, Saved<"session">>(),
    setup: new Map<string, Saved<"setup">>(),
    challenge: new Map<string, Saved<"challenge">>(),
    family: new Map<string, Saved<"family">>(),
  };
  saves = 0;

  member(id: MemberId) {
    return copy(this.rows.member.get(id));
  }

  members() {
    return byKey([...this.rows.member.values()].map((one) => structuredClone(one)));
  }

  invitation(id: string) {
    return copy(this.rows.invitation.get(id));
  }

  invitationByHash(hash: string) {
    return copy([...this.rows.invitation.values()].find((one) => one.hash === hash));
  }

  recoveriesOf(member: MemberId) {
    return byKey(
      [...this.rows.invitation.values()]
        .filter((one) => one.kind === "recovery" && one.member === member && one.spentAt === null)
        .map((one) => structuredClone(one)),
    );
  }

  readonly erased = new Set<string>();

  challenge(hash: string) {
    return copy(this.rows.challenge.get(hash));
  }

  family() {
    return copy(this.rows.family.get("family"));
  }

  isErased(person: string) {
    return this.erased.has(person);
  }

  salt() {
    return "salt";
  }

  isCodeUsed(hash: string) {
    return this.rows.setup.has(hash);
  }

  invitations() {
    return byKey([...this.rows.invitation.values()].map((one) => structuredClone(one)));
  }

  readonly tries: { limit: string; key: string; at: number }[] = [];
  readonly entries: LogEntry[] = [];

  triesOf(limit: Limit, key: string, since: number) {
    return this.tries
      .filter((one) => one.limit === limit && one.key === key && one.at > since)
      .map(({ at }) => at);
  }

  tried(limit: Limit, key: string, at: number) {
    this.tries.push({ limit, key, at });
  }

  log(entry: LogEntry) {
    this.entries.unshift(structuredClone(entry));
  }

  logged() {
    return structuredClone(this.entries);
  }

  clean(now: number, triesBefore: number) {
    for (const [hash, one] of this.rows.session)
      if (one.expiresAt <= now) this.rows.session.delete(hash);
    for (const [id, one] of this.rows.invitation) {
      if (one.expiresAt <= now) this.rows.invitation.delete(id);
    }
    this.tries.splice(0, this.tries.length, ...this.tries.filter(({ at }) => at > triesBefore));
  }

  isWaiting() {
    return this.rows.session.size + this.rows.invitation.size + this.tries.length > 0;
  }

  credential(id: string) {
    return copy(this.rows.credential.get(id));
  }

  credentialsOf(member: MemberId) {
    return byKey(
      [...this.rows.credential.values()]
        .filter((one) => one.member === member)
        .map((one) => structuredClone(one)),
    );
  }

  session(hash: string) {
    return copy(this.rows.session.get(hash));
  }

  sessionsOf(member: MemberId) {
    return byKey(
      [...this.rows.session.values()]
        .filter((one) => one.member === member)
        .map((one) => structuredClone(one)),
    );
  }

  save(change: Change): void {
    this.saves++;
    for (const { kind, id, after } of change) {
      const rows = this.rows[kind] as Map<string, unknown>;
      if (after === null) rows.delete(id);
      else rows.set(id, structuredClone(after));
    }
  }
}

/** In the order of their keys, as the database gives them. */
function byKey<T extends { id?: string; hash?: string }>(list: T[]): T[] {
  const key = (one: T) => one.id ?? one.hash ?? "";
  return list.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

function copy<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}
