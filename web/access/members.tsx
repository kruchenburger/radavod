import { Button, NativeSelect, TextInput } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
  type AccountAnswer,
  type LinkAnswer,
  logAnswer,
  roleSchema,
  type RosterAnswer,
  rosterAnswer,
} from "../../src/shared/access";
import { useArrival } from "../app/arrival";
import { useLanguage } from "../app/language";
import { call, linkOf, type Refusal } from "./api";
import { read } from "./session";
import { asRefusal, textOf } from "./errors";
import { SignedIn } from "./frame";
import classes from "./members.module.css";

type Role = (typeof roleSchema.options)[number];
type Member = RosterAnswer["members"][number];
type Invitation = NonNullable<RosterAnswer["invitations"]>[number];
export type Credential = AccountAnswer["credentials"][number];

const rosterKey = ["roster"];

/** The members of the family: names for everybody, and for a keeper everything a keeper does. */
export function Members() {
  return <SignedIn current="members">{(session) => <Roster member={session.member} />}</SignedIn>;
}

function Roster({ member: you }: { member: string }) {
  const { t } = useLanguage();
  const roster = useQuery({
    queryKey: rosterKey,
    queryFn: () => read("/api/members", rosterAnswer),
  });
  return (
    <>
      <Title>{t("members.title")}</Title>
      {roster.isPending && <p role="status">{t("page.loading")}</p>}
      {roster.isError && <Problem refusal={asRefusal(roster.error)} />}
      {roster.data !== undefined && <Lists roster={roster.data} you={you} />}
    </>
  );
}

function Lists({ roster, you }: { roster: RosterAnswer; you: string }) {
  const { members, invitations } = roster;
  // Only a keeper is sent the invitations: what the server sends says what may be done.
  const isKeeper = invitations !== undefined;
  const nameOf = (id: string | null) => members.find((one) => one.id === id)?.name ?? "";
  return (
    <>
      <ul className={classes.members}>
        {members.map((member) => (
          <MemberLine
            key={member.id}
            member={member}
            isYou={member.id === you}
            isKeeper={isKeeper}
          />
        ))}
      </ul>
      {isKeeper && (
        <>
          <Invite />
          <Invitations invitations={invitations} nameOf={nameOf} />
          <Log nameOf={nameOf} />
        </>
      )}
    </>
  );
}

function MemberLine({
  member,
  isYou,
  isKeeper,
}: {
  member: Member;
  isYou: boolean;
  isKeeper: boolean;
}) {
  const { t } = useLanguage();
  const isRevoked = (member.revokedAt ?? null) !== null;
  return (
    <li className={classes.member}>
      <p className={classes.who}>
        <span className={classes.name}>{member.name}</span>
        <span className={classes.meta}>
          {t(`role.${member.role}`)}
          {isYou && ` · ${t("members.you")}`}
          {isRevoked && ` · ${t("members.revoked")}`}
        </span>
      </p>
      {isKeeper && !isRevoked && (
        <>
          <ul className={classes.credentials}>
            {(member.credentials ?? []).map((credential) => (
              <CredentialLine key={credential.id} credential={credential} />
            ))}
          </ul>
          <MemberActions member={member} />
        </>
      )}
    </li>
  );
}

/** A passkey or a linked browser, the day it was last used, and a way to turn it off at its cost. */
export function CredentialLine({ credential, cost }: { credential: Credential; cost?: string }) {
  const { t, locale } = useLanguage();
  const client = useQueryClient();
  const [isAsked, setAsked] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const isPasskey = credential.kind === "passkey";
  const isNamed = credential.label.trim() !== "";
  const { label } = credential;
  let title = t(isPasskey ? "members.passkeyUnnamed" : "members.browserUnnamed");
  let gone = t(isPasskey ? "members.passkeyUnnamedRevoked" : "members.browserUnnamedRevoked");
  if (isNamed) {
    title = t(isPasskey ? "members.passkey" : "members.browser", { label });
    gone = t(isPasskey ? "members.passkeyRevoked" : "members.browserRevoked", { label });
  }
  const turnOff = async () => {
    setAsked(false);
    const answer = await call(
      "POST",
      `/api/credentials/${encodeURIComponent(credential.id)}/revoke`,
    );
    if (!answer.ok) return setRefusal(answer.error);
    setDone(gone);
    // The session itself may have gone with it: everything is asked again.
    await client.invalidateQueries();
  };
  return (
    <li className={classes.credential}>
      <span className={classes.label}>
        {title}
        <span className={classes.meta}>
          {" · "}
          {t("members.lastUsed", { date: dateOf(locale, credential.lastUsedAt) })}
        </span>
      </span>
      {!isAsked && (
        <Button variant="outline" size="xs" onClick={() => setAsked(true)}>
          {t("members.revokeCredential")}
        </Button>
      )}
      {isAsked && (
        <Confirm
          cost={cost ?? t(isPasskey ? "members.revokePasskeyCost" : "members.revokeBrowserCost")}
          action={t("members.revokeCredential")}
          onConfirm={() => void turnOff()}
          onCancel={() => setAsked(false)}
        />
      )}
      {done !== null && <p role="status">{done}</p>}
      {refusal !== null && <Problem refusal={refusal} />}
    </li>
  );
}

/** What a keeper does with a member: a role, a recovery link, revoking sign-in. Each says its cost. */
function MemberActions({ member }: { member: Member }) {
  const { t } = useLanguage();
  const client = useQueryClient();
  const [role, setRole] = useState<Role>(member.role);
  const [asked, setAsked] = useState<"revoke" | "recovery" | null>(null);
  const [link, setLink] = useState<LinkAnswer | null>(null);
  const [state, setState] = useState<{ done?: string; refusal?: Refusal }>({});
  const version = member.version ?? 0;
  const after = async (answer: { ok: boolean; error?: Refusal }, done: string) => {
    setAsked(null);
    if (!answer.ok) return setState({ refusal: answer.error ?? { code: "unknown" } });
    setState(done === "" ? {} : { done });
    await client.invalidateQueries({ queryKey: rosterKey });
  };
  return (
    <div className={classes.actions}>
      <div className={classes.role}>
        <NativeSelect
          label={t("role.label")}
          value={role}
          onChange={(event) => setRole(event.currentTarget.value as Role)}
          data={roleSchema.options.map((one) => ({ value: one, label: t(`role.${one}`) }))}
        />
        <Button
          variant="outline"
          size="md"
          disabled={role === member.role}
          onClick={() =>
            void call("POST", `/api/members/${member.id}/role`, { role, version }).then((answer) =>
              after(
                answer,
                t("members.roleChanged", { name: member.name, role: t(`role.${role}`) }),
              ),
            )
          }
        >
          {t("members.changeRole")}
        </Button>
      </div>
      {asked === null && (
        <div className={classes.buttons}>
          <Button variant="outline" size="md" onClick={() => setAsked("recovery")}>
            {t("members.recovery")}
          </Button>
          <Button variant="outline" size="md" onClick={() => setAsked("revoke")}>
            {t("members.revoke")}
          </Button>
        </div>
      )}
      {asked === "recovery" && (
        <Confirm
          cost={t("members.recoveryCost")}
          action={t("members.recovery")}
          onConfirm={() =>
            void call<LinkAnswer>("POST", `/api/members/${member.id}/recovery`).then(
              async (answer) => {
                if (answer.ok) setLink(answer.value);
                await after(answer, "");
              },
            )
          }
          onCancel={() => setAsked(null)}
        />
      )}
      {asked === "revoke" && (
        <Confirm
          cost={t("members.revokeCost", { name: member.name })}
          action={t("members.revoke")}
          onConfirm={() =>
            void call("POST", `/api/members/${member.id}/revoke`, { version }).then((answer) =>
              after(answer, t("members.revokedDone", { name: member.name })),
            )
          }
          onCancel={() => setAsked(null)}
        />
      )}
      {link !== null && <GivenLink link={link} text={t("invite.sendRecovery")} />}
      {state.done !== undefined && <p role="status">{state.done}</p>}
      {state.refusal !== undefined && <Problem refusal={state.refusal} />}
    </div>
  );
}

/** A destructive step: its cost beside the button that takes it, and a way back. */
export function Confirm({
  cost,
  action,
  onConfirm,
  onCancel,
}: {
  cost: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={classes.confirm} role="group" aria-label={action}>
      <p>{cost}</p>
      <div className={classes.buttons}>
        <Button size="md" onClick={onConfirm}>
          {action}
        </Button>
        {/* The keys start at the way back: two presses of Enter must not erase anything. */}
        <Button size="md" variant="outline" onClick={onCancel} autoFocus>
          {t("account.cancel")}
        </Button>
      </div>
    </div>
  );
}

function Invite() {
  const { t } = useLanguage();
  const client = useQueryClient();
  const [role, setRole] = useState<Role>("reader");
  const [link, setLink] = useState<LinkAnswer | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const create = async () => {
    setRefusal(null);
    const answer = await call<LinkAnswer>("POST", "/api/members/invitations", {
      role,
      person: null,
    });
    if (!answer.ok) return setRefusal(answer.error);
    setLink(answer.value);
    await client.invalidateQueries({ queryKey: rosterKey });
  };
  return (
    <Section title={t("invite.title")}>
      <div className={classes.role}>
        <NativeSelect
          label={t("role.label")}
          value={role}
          onChange={(event) => setRole(event.currentTarget.value as Role)}
          data={roleSchema.options.map((one) => ({ value: one, label: t(`role.${one}`) }))}
        />
        <Button size="md" onClick={() => void create()}>
          {t("invite.create")}
        </Button>
      </div>
      {link !== null && <GivenLink link={link} text={t("invite.send")} />}
      {refusal !== null && <Problem refusal={refusal} />}
    </Section>
  );
}

/** A link shown once, in a field to copy, and a button that copies it where the browser lets it. */
function GivenLink({ link, text }: { link: LinkAnswer; text: string }) {
  const { t } = useLanguage();
  const [isCopied, setCopied] = useState(false);
  const href = linkOf(link.secret);
  return (
    <div className={classes.link}>
      <p>{text}</p>
      <TextInput
        label={t("invite.link")}
        value={href}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button
        variant="outline"
        size="md"
        onClick={() =>
          void navigator.clipboard.writeText(href).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {t("link.copy")}
      </Button>
      {isCopied && <p role="status">{t("link.copied")}</p>}
    </div>
  );
}

function Invitations({
  invitations,
  nameOf,
}: {
  invitations: Invitation[];
  nameOf: (id: string | null) => string;
}) {
  const { t, locale } = useLanguage();
  const client = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const withdraw = async ({ id, kind }: Invitation) => {
    const answer = await call("DELETE", `/api/members/invitations/${encodeURIComponent(id)}`);
    if (!answer.ok) return setRefusal(answer.error);
    setDone(t(kind === "recovery" ? "invite.recoveryWithdrawn" : "invite.withdrawn"));
    await client.invalidateQueries({ queryKey: rosterKey });
  };
  const sorted = invitations.toSorted((a, b) => b.expiresAt - a.expiresAt);
  return (
    <Section title={t("invite.pending")}>
      {sorted.length === 0 ? (
        <p className={classes.meta}>{t("invite.none")}</p>
      ) : (
        <ul className={classes.list}>
          {sorted.map((one) => (
            <li key={one.id} className={classes.row}>
              <span>{invitationText(one, nameOf, t, locale)}</span>
              {one.spentAt === null && (
                <Button variant="outline" size="xs" onClick={() => void withdraw(one)}>
                  {t("invite.withdraw")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {done !== null && <p role="status">{done}</p>}
      {refusal !== null && <Problem refusal={refusal} />}
    </Section>
  );
}

function invitationText(
  one: Invitation,
  nameOf: (id: string | null) => string,
  t: ReturnType<typeof useLanguage>["t"],
  locale: string,
): string {
  const role = t(`role.${one.role}`);
  const name = nameOf(one.member);
  if (one.kind === "recovery") {
    return one.spentAt === null
      ? t("invite.recoveryFor", { name, date: dateOf(locale, one.expiresAt) })
      : t("invite.recoverySpent", { name, date: dateOf(locale, one.spentAt) });
  }
  return one.spentAt === null
    ? t("invite.until", { role, date: dateOf(locale, one.expiresAt) })
    : t("invite.spent", { role, date: dateOf(locale, one.spentAt) });
}

function Log({ nameOf }: { nameOf: (id: string | null) => string }) {
  const { t, locale } = useLanguage();
  const log = useQuery({
    queryKey: ["log"],
    queryFn: async () => (await read("/api/members/log", logAnswer)).log,
  });
  const countries = new Intl.DisplayNames([locale], { type: "region" });
  return (
    <Section title={t("log.title")}>
      {log.isError && <Problem refusal={asRefusal(log.error)} />}
      {log.data?.length === 0 && <p className={classes.meta}>{t("log.none")}</p>}
      {log.data !== undefined && log.data.length > 0 && (
        <ul className={classes.list}>
          {log.data.map((entry, i) => {
            const country =
              entry.country === null
                ? t("log.noCountry")
                : (countries.of(entry.country) ?? entry.country);
            const name = nameOf(entry.member);
            return (
              <li key={`${entry.at} ${i}`} className={classes.row}>
                <span className={classes.meta}>{dateOf(locale, entry.at)}</span>
                <span>
                  {entry.kind === "sign-in"
                    ? t("log.signIn", { name, country })
                    : t("log.recovery", { name, by: nameOf(entry.by) })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** The heading of a page of a member: where the keys go when the page opens. */
export function Title({ children }: { children: ReactNode }) {
  const heading = useArrival<HTMLHeadingElement>();
  return (
    <h1 ref={heading} tabIndex={-1} className={classes.title}>
      {children}
    </h1>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className={classes.section}>
      {title !== undefined && <h2 className={classes.heading}>{title}</h2>}
      {children}
    </section>
  );
}

export function Problem({ refusal }: { refusal: Refusal }) {
  const { t } = useLanguage();
  return (
    <p role="alert" className={classes.problem}>
      {textOf(t, refusal)}
    </p>
  );
}

export function dateOf(locale: string, at: number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(at);
}
