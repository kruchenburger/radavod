import { Button } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type AccountAnswer, accountAnswer, type SessionAnswer } from "../../src/shared/access";
import { useLanguage } from "../app/language";
import { go } from "../app/router";
import { call, canUsePasskeys, makePasskey, type Refusal, sessionQuery } from "./api";
import { isInApp, LabelInput, NoPasskeys } from "./entry";
import { asRefusal } from "./errors";
import { SignedIn } from "./frame";
import { Confirm, CredentialLine, Problem, Section, Title } from "./members";
import { read } from "./session";
import classes from "./members.module.css";

const accountKey = ["account"];

/** One's own account: what one signs in with, more of it, the data of it, and leaving. */
export function Account() {
  return <SignedIn current="account">{(session) => <Own session={session} />}</SignedIn>;
}

function Own({ session }: { session: SessionAnswer }) {
  const { t } = useLanguage();
  const account = useQuery({
    queryKey: accountKey,
    queryFn: () => read("/api/account", accountAnswer),
  });
  return (
    <>
      <Title>{t("account.title")}</Title>
      {account.isPending && <p role="status">{t("page.loading")}</p>}
      {account.isError && <Problem refusal={asRefusal(account.error)} />}
      {account.data !== undefined && <Details account={account.data} session={session} />}
    </>
  );
}

function Details({ account, session }: { account: AccountAnswer; session: SessionAnswer }) {
  const { t } = useLanguage();
  const { member, credentials, canAddPasskey } = account;
  const passkeys = credentials.filter(({ kind }) => kind === "passkey");
  return (
    <>
      <p className={classes.who}>
        <span className={classes.name}>{member.name}</span>
        <span className={classes.meta}>{t(`role.${member.role}`)}</span>
      </p>
      <Section title={t("account.credentials")}>
        <ul className={classes.credentials}>
          {credentials.map((credential) => (
            <CredentialLine
              key={credential.id}
              credential={credential}
              // Turning off one's last passkey locks one out: that is the cost to say.
              {...(credential.kind === "passkey" && passkeys.length === 1
                ? { cost: t("account.revokeLastCost") }
                : {})}
            />
          ))}
        </ul>
        {!canAddPasskey && <p className={classes.meta}>{t("account.addNeedsLink")}</p>}
        {canAddPasskey && (canUsePasskeys() && !isInApp() ? <AddPasskey /> : <NoPasskeys />)}
      </Section>
      <Section title={t("account.data")}>
        <p>{t("account.downloadAbout")}</p>
        <Button
          variant="outline"
          size="md"
          onClick={() => download(account, t("account.fileName"))}
        >
          {t("account.download")}
        </Button>
      </Section>
      <Leave session={session} />
    </>
  );
}

function AddPasskey() {
  const { t } = useLanguage();
  const client = useQueryClient();
  const [label, setLabel] = useState("");
  const [state, setState] = useState<{ isWorking?: boolean; isDone?: boolean; refusal?: Refusal }>(
    {},
  );
  const add = async () => {
    setState({ isWorking: true });
    const answer = await makePasskey(
      "/api/passkey/add/options",
      "/api/passkey/add/verify",
      {},
      label.trim(),
    );
    setState(answer.ok ? { isDone: true } : { refusal: answer.error });
    if (answer.ok) {
      setLabel("");
      await client.invalidateQueries({ queryKey: accountKey });
    }
  };
  return (
    <div className={classes.add}>
      <LabelInput value={label} onChange={setLabel} />
      <Button
        size="md"
        variant="outline"
        loading={state.isWorking === true}
        onClick={() => void add()}
      >
        {state.isWorking === true ? t("passkey.working") : t("account.add")}
      </Button>
      {state.isDone === true && <p role="status">{t("account.added")}</p>}
      {state.refusal !== undefined && <Problem refusal={state.refusal} />}
    </div>
  );
}

/** Signing out and deleting the account: each with what it costs beside its button, asked once more. */
function Leave({ session }: { session: SessionAnswer }) {
  const { t } = useLanguage();
  const client = useQueryClient();
  const [asked, setAsked] = useState<"out" | "delete" | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const isLinked = session.via === "device";
  /** Only once the server says so: a page that only looks signed out leaves the session behind. */
  const leave = async (method: "POST" | "DELETE", path: string) => {
    setAsked(null);
    const done = await call(method, path);
    // A session that is over already has left.
    if (!done.ok && done.error.code !== "unauthorized") return setRefusal(done.error);
    client.setQueryData(sessionQuery.queryKey, null);
    go("/", "replace");
  };
  return (
    <Section>
      <div className={classes.leave}>
        {asked === "out" ? (
          <Confirm
            cost={t("account.signOutBrowserCost")}
            action={t("account.signOut")}
            onConfirm={() => void leave("POST", "/api/logout")}
            onCancel={() => setAsked(null)}
          />
        ) : (
          <Button
            variant="outline"
            size="md"
            // A linked browser does not come back without a new link: that is asked once more.
            onClick={() => (isLinked ? setAsked("out") : void leave("POST", "/api/logout"))}
          >
            {t("account.signOut")}
          </Button>
        )}
        {asked === "delete" ? (
          <Confirm
            cost={t("account.deleteCost")}
            action={t("account.deleteConfirm")}
            onConfirm={() => void leave("DELETE", "/api/account")}
            onCancel={() => setAsked(null)}
          />
        ) : (
          <div>
            <p>{t("account.deleteCost")}</p>
            <Button variant="outline" size="md" onClick={() => setAsked("delete")}>
              {t("account.delete")}
            </Button>
          </div>
        )}
      </div>
      {refusal !== null && <Problem refusal={refusal} />}
    </Section>
  );
}

/** The account as a file the member keeps: their name, role and passkeys, without any key. */
function download(account: AccountAnswer, name: string): void {
  const file = new Blob([JSON.stringify(account, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  // Some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
