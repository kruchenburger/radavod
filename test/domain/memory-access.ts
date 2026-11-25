import type { AccessStore, Change } from "../../src/contexts/access";
import type { MemberId } from "../../src/kernel/id";

type Saved<Kind extends string> = NonNullable<Extract<Change[number], { kind: Kind }>["after"]>;

/** The access of a family in memory, as a database holds it: copies, changed only by `save`. */
export class MemoryAccess implements AccessStore {
  readonly rows = {
    member: new Map<string, Saved<"member">>(),
    invitation: new Map<string, Saved<"invitation">>(),
    credential: new Map<string, Saved<"credential">>(),
    session: new Map<string, Saved<"session">>(),
  };
  saves = 0;

  member(id: MemberId) {
    return copy(this.rows.member.get(id));
  }

  members() {
    return [...this.rows.member.values()].map((one) => structuredClone(one));
  }

  invitation(id: string) {
    return copy(this.rows.invitation.get(id));
  }

  invitationByHash(hash: string) {
    return copy([...this.rows.invitation.values()].find((one) => one.hash === hash));
  }

  credential(id: string) {
    return copy(this.rows.credential.get(id));
  }

  credentialsOf(member: MemberId) {
    return [...this.rows.credential.values()]
      .filter((one) => one.member === member)
      .map((one) => structuredClone(one));
  }

  session(hash: string) {
    return copy(this.rows.session.get(hash));
  }

  sessionsOf(member: MemberId) {
    return [...this.rows.session.values()]
      .filter((one) => one.member === member)
      .map((one) => structuredClone(one));
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

function copy<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}
