/** Random operations on the members of a family, and what holds after each. */
import fc from "fast-check";
import { expect } from "vitest";
import type { Access } from "../../src/contexts/access";
import type { MemberId } from "../../src/kernel/id";
import { idOf } from "../storage/tree";

const names = ["ann", "bob", "eve", "dan"] as const;
const member = (name: string): MemberId => idOf("member", name);
const anyone = fc.constantFrom(...names);
const role = fc.constantFrom("reader" as const, "editor" as const, "keeper" as const);
const kind = fc.constantFrom("passkey" as const, "device" as const);
const day = 86_400_000;

export const someStep = fc.oneof(
  fc.record({ do: fc.constant("invite" as const), by: anyone, who: anyone, role }),
  fc.record({ do: fc.constant("recover" as const), by: anyone, who: anyone }),
  fc.record({ do: fc.constant("redeem" as const), who: anyone, kind, n: fc.nat(3) }),
  fc.record({ do: fc.constant("role" as const), by: anyone, who: anyone, role }),
  fc.record({ do: fc.constant("revoke" as const), by: anyone, who: anyone }),
  fc.record({ do: fc.constant("delete" as const), who: anyone }),
  fc.record({ do: fc.constant("unbind" as const), by: anyone, who: anyone, n: fc.nat(3) }),
  fc.record({ do: fc.constant("add" as const), who: anyone, kind, n: fc.nat(3) }),
  fc.record({ do: fc.constant("setup" as const), who: anyone, code: fc.nat(2) }),
  fc.record({ do: fc.constant("unvite" as const), by: anyone, who: anyone, n: fc.nat(5) }),
  fc.record({ do: fc.constant("sign" as const), who: anyone, n: fc.nat(3) }),
  fc.record({ do: fc.constant("wait" as const), days: fc.integer({ min: 0, max: 20 }) }),
);
export type Step = typeof someStep extends fc.Arbitrary<infer T> ? T : never;

export function take(access: Access, step: Step, now: number, n: number): void {
  const credential = (who: string, kind: "passkey" | "device", k: number) => ({
    id: `${who}-${kind}-${k}-${n}`,
    kind,
    label: "",
  });
  switch (step.do) {
    case "invite":
      access.invite(member(step.by), {
        id: `i-${step.who}-${n % 6}`,
        hash: `h-${step.who}-${n}`,
        role: step.role,
        person: null,
        now,
      });
      return;
    case "recover":
      access.recover(member(step.by), {
        id: `r-${step.who}-${n}`,
        hash: `r-${step.who}-${n}`,
        member: member(step.who),
        now,
      });
      return;
    case "redeem": {
      // The last link given to somebody: an invitation or a recovery.
      for (let k = n; k >= 0; k--) {
        const hash = `r-${step.who}-${k}`;
        const done = access.redeem({
          hash,
          now,
          credential: credential(step.who, step.kind, step.n),
        });
        if (done.ok) break;
      }
      for (let k = n; k >= 0; k--) {
        const done = access.redeem({
          hash: `h-${step.who}-${k}`,
          now,
          member: { id: member(step.who), name: step.who },
          credential: credential(step.who, step.kind, step.n),
        });
        if (done.ok) break;
      }
      return;
    }
    case "role":
      access.changeRole(member(step.by), member(step.who), step.role, now);
      return;
    case "revoke":
      access.revoke(member(step.by), member(step.who), now);
      return;
    case "delete":
      access.deleteAccount(member(step.who));
      return;
    case "unbind": {
      const [one] = access.credentialsOf(member(step.who)).slice(step.n);
      if (one !== undefined) access.revokeCredential(member(step.by), one.id, now);
      return;
    }
    case "add":
      access.addCredential(member(step.who), credential(step.who, step.kind, step.n), now);
      return;
    case "setup":
      access.setUp({
        member: { id: member(step.who), name: step.who },
        credential: credential(step.who, "passkey", 0),
        now,
        code: `code ${step.code}`,
      });
      return;
    case "unvite":
      access.revokeInvitation(member(step.by), `i-${step.who}-${step.n}`);
      return;
    case "sign": {
      const [one] = access.credentialsOf(member(step.who)).slice(step.n);
      if (one !== undefined) access.signIn({ hash: `s-${n}`, credential: one.id, now });
      return;
    }
    case "wait":
      return;
  }
}

/** Keepers who can sign in. */
export function keepers(access: Access): number {
  return access
    .members()
    .filter(({ role, revokedAt }) => role === "keeper" && revokedAt === null)
    .filter(({ id }) => access.credentialsOf(id).some(({ revokedAt }) => revokedAt === null))
    .length;
}

/** Takes the steps, and checks after each what must always hold. */
export function walk(access: Access, steps: readonly Step[]): void {
  let now = 1_800_000_000_000;
  let wasSetUp = false;
  for (const [n, step] of steps.entries()) {
    if (step.do === "wait") now += step.days * day;
    take(access, step, now, n);
    wasSetUp ||= access.isSetUp();
    if (wasSetUp) expect(keepers(access), JSON.stringify(step)).toBeGreaterThan(0);
    // Every live session is of a live member.
    for (let k = 0; k <= n; k++) {
      const signed = access.session(`s-${k}`, now);
      if (signed === null) continue;
      expect(access.member(signed.member)?.revokedAt).toBeNull();
    }
    // A member never has two live devices, and only a reader has one.
    for (const one of access.members()) {
      const devices = access
        .credentialsOf(one.id)
        .filter(({ kind: found, revokedAt }) => found === "device" && revokedAt === null);
      expect(devices.length).toBeLessThanOrEqual(one.role === "reader" ? 1 : 0);
    }
  }
}
