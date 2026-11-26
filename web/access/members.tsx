import { Button, NativeSelect, TextInput } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import type { LinkAnswer, SessionAnswer } from "../../src/shared/access";
import { useLanguage } from "../app/language";
import { call, linkOf, type Refusal } from "./api";
import { asRefusal, textOf } from "./errors";
import { SignedIn } from "./frame";
import classes from "./members.module.css";

type Role = "reader" | "editor" | "keeper";
const roles: Role[] = ["reader", "editor", "keeper"];

type Credential = {
  id: string;
  kind: "passkey" | "device";
  label: string;
  lastUsedAt: number;
  revokedAt: number | null;
};

type Member = {
  id: string;
  name: string;
  role: Role;
  version?: number;
  revokedAt?: number | null;
  credentials?: Credential[];
};

type Invitation = {
  id: string;
  role: Role;
  kind: "join" | "recovery";
  member: string | null;
  expiresAt: number;
  spentAt: number | null;
};

type Roster = { members: Member[]; invitations?: Invitation[] };

type LogEntry = {
  at: number;
  kind: "sign-in" | "recovery";
  member: string;
  credential: string | null;
  by: string | null;
  country: string | null;
};

const rosterKey = ["roster"];

/** The members of the family: names for everybody, and for a keeper everything a keeper does. */
export function Members() {
  return <SignedIn current="members">{(session) => <Roster session={session} />}</SignedIn>;
}

function Roster({ session }: { session: SessionAnswer }) {
  const { t } = useLanguage();
  const roster = useQuery({
    queryKey: rosterKey,
    queryFn: async () => {
      const answer = await call<Roster>("GET", "/api/members");
      if (!answer.ok) throw answer.error;
      return answer.value;
    },
  });
  if (roster.isPending) return <p role="status">{t("page.loading")}</p>;
  if (roster.isError) return <Problem refusal={asRefusal(roster.error)} />;
  const isKeeper = session.role === "keeper";
  const { members, invitations = [] } = roster.data;
  const nameOf = (id: string | null) => members.find((one) => one.id === id)?.name ?? "";
  return (
    <>
      <h1 className={classes.title}>{t("members.title")}</h1>
      <ul className={classes.members}>
        {members.map((member) => (
          <MemberLine
            key={member.id}
            member={member}
            isYou={member.id === session.member}
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
  const live = (member.credentials ?? []).filter(({ revokedAt }) => revokedAt === null);
  return (
    <li className={classes.member}>
      <p className={classes.who}>
        <span className={classes.name}>{member.name}</span>
        <span className={classes.meta}>
          {[
            t(`role.${member.role}`),
            ...(isYou ? [t("members.you")] : []),
            ...(isRevoked ? [t("members.revoked")] : []),
          ].join(" · ")}
        </span>
      </p>
      {isKeeper && !isRevoked && (
        <>
          <ul className={classes.credentials}>
            {live.map((credential) => (
              <CredentialLine key={credential.id} credential={credential} />
            ))}
          </ul>
          <MemberActions member={member} />
        </>
      )}
    </li>
  );
}

/** A passkey or a bound browser, with the day it was last used and a way to turn it off. */
export function CredentialLine({ credential }: { credential: Credential }) {
  const { t, locale } = useLanguage();
  const client = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [isAsked, setAsked] = useState(false);
  const isPasskey = credential.kind === "passkey";
  const named = credential.label.trim() !== "";
  let title = t(isPasskey ? "members.passkeyUnnamed" : "members.browserUnnamed");
  if (named) {
    title = t(isPasskey ? "members.passkey" : "members.browser", { label: credential.label });
  }
  const [done, setDone] = useState<string | null>(null);
  const turnOff = async () => {
    setAsked(false);
    const done = await call("POST", `/api/credentials/${encodeURIComponent(credential.id)}/revoke`);
    if (!done.ok) return setRefusal(done.error);
    setDone(
      t(isPasskey ? "members.passkeyRevoked" : "members.browserRevoked", {
        label: credential.label || title,
      }),
    );
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
      <Button variant="outline" size="xs" onClick={() => setAsked(true)}>
        {t("members.revokeCredential")}
      </Button>
      {isAsked && (
        <Confirm
          cost={t("members.revokeCredentialCost")}
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
  const roleId = useId();
  const [role, setRole] = useState<Role>(member.role);
  const [asked, setAsked] = useState<"revoke" | "recovery" | null>(null);
  const [link, setLink] = useState<LinkAnswer | null>(null);
  const [state, setState] = useState<{ done?: string; refusal?: Refusal }>({});
  const version = member.version ?? 0;
  const after = async (answer: { ok: boolean; error?: Refusal }, done: string) => {
    setAsked(null);
    if (!answer.ok) return setState({ refusal: answer.error ?? { code: "unknown" } });
    setState({ done });
    await client.invalidateQueries({ queryKey: rosterKey });
  };
  return (
    <div className={classes.actions}>
      <div className={classes.role}>
        <NativeSelect
          id={roleId}
          label={t("role.label")}
          value={role}
          onChange={(event) => setRole(event.currentTarget.value as Role)}
          data={roles.map((one) => ({ value: one, label: t(`role.${one}`) }))}
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
      <div className={classes.buttons}>
        <Button variant="outline" size="md" onClick={() => setAsked("recovery")}>
          {t("members.recovery")}
        </Button>
        <Button variant="outline" size="md" onClick={() => setAsked("revoke")}>
          {t("members.revoke")}
        </Button>
      </div>
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
      {state.done && <p role="status">{state.done}</p>}
      {state.refusal && <Problem refusal={state.refusal} />}
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
        <Button size="md" variant="outline" onClick={onCancel}>
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
          data={roles.map((one) => ({ value: one, label: t(`role.${one}`) }))}
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

/** A link shown once, to copy and send. */
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
        onClick={() => void navigator.clipboard.writeText(href).then(() => setCopied(true))}
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
  const [isWithdrawn, setWithdrawn] = useState(false);
  const withdraw = async (id: string) => {
    const done = await call("DELETE", `/api/members/invitations/${encodeURIComponent(id)}`);
    if (!done.ok) return setRefusal(done.error);
    setWithdrawn(true);
    await client.invalidateQueries({ queryKey: rosterKey });
  };
  const sorted = invitations.toSorted((a, b) => b.expiresAt - a.expiresAt);
  return (
    <Section title={t("invite.pending")}>
      {sorted.length === 0 ? (
        <p className={classes.meta}>{t("invite.none")}</p>
      ) : (
        <ul className={classes.list}>
          {sorted.map((one) => {
            const role = t(`role.${one.role}`);
            let text = t("invite.until", { role, date: dateOf(locale, one.expiresAt) });
            if (one.kind === "recovery") {
              text = t("invite.recoveryFor", {
                name: nameOf(one.member),
                date: dateOf(locale, one.expiresAt),
              });
            }
            if (one.spentAt !== null) {
              text = t("invite.spent", { role, date: dateOf(locale, one.spentAt) });
            }
            return (
              <li key={one.id} className={classes.row}>
                <span>{text}</span>
                {one.spentAt === null && (
                  <Button variant="outline" size="xs" onClick={() => void withdraw(one.id)}>
                    {t("invite.withdraw")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {isWithdrawn && <p role="status">{t("invite.withdrawn")}</p>}
      {refusal !== null && <Problem refusal={refusal} />}
    </Section>
  );
}

function Log({ nameOf }: { nameOf: (id: string | null) => string }) {
  const { t, locale } = useLanguage();
  const log = useQuery({
    queryKey: ["log"],
    queryFn: async () => {
      const answer = await call<{ log: LogEntry[] }>("GET", "/api/members/log");
      if (!answer.ok) throw answer.error;
      return answer.value.log;
    },
  });
  const countries = new Intl.DisplayNames([locale], { type: "region" });
  return (
    <Section title={t("log.title")}>
      {log.isError && <Problem refusal={asRefusal(log.error)} />}
      {log.data?.length === 0 && <p className={classes.meta}>{t("log.none")}</p>}
      {log.data !== undefined && log.data.length > 0 && (
        <ul className={classes.list}>
          {log.data.map((entry, i) => (
            <li key={`${entry.at} ${i}`} className={classes.row}>
              <span className={classes.meta}>{dateOf(locale, entry.at)}</span>
              <span>
                {nameOf(entry.member)}
                {", "}
                {t(entry.kind === "sign-in" ? "log.signIn" : "log.recovery")}
                {entry.by !== null && `, ${t("log.by", { name: nameOf(entry.by) })}`}
                {", "}
                {entry.country === null
                  ? t("log.noCountry")
                  : (countries.of(entry.country) ?? entry.country)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={classes.section}>
      <h2 className={classes.heading}>{title}</h2>
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
