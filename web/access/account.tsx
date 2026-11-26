import { Button } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SessionAnswer } from "../../src/shared/access";
import { useLanguage } from "../app/language";
import { go } from "../app/router";
import { call, canUsePasskeys, makePasskey, type Refusal, sessionQuery } from "./api";
import { LabelInput } from "./entry";
import { asRefusal } from "./errors";
import { SignedIn } from "./frame";
import { Confirm, CredentialLine, Problem, Section } from "./members";
import classes from "./members.module.css";

type Account = {
  member: { id: string; name: string; role: "reader" | "editor" | "keeper" };
  credentials: Parameters<typeof CredentialLine>[0]["credential"][];
};

const accountKey = ["account"];

/** One's own account: what one signs in with, more of it, the data of it, and leaving. */
export function Account() {
  return <SignedIn current="account">{(session) => <Own session={session} />}</SignedIn>;
}

function Own({ session }: { session: SessionAnswer }) {
  const { t } = useLanguage();
  const account = useQuery({
    queryKey: accountKey,
    queryFn: async () => {
      const answer = await call<Account>("GET", "/api/account");
      if (!answer.ok) throw answer.error;
      return answer.value;
    },
  });
  if (account.isPending) return <p role="status">{t("page.loading")}</p>;
  if (account.isError) return <Problem refusal={asRefusal(account.error)} />;
  const { member, credentials } = account.data;
  const live = credentials.filter(({ revokedAt }) => revokedAt === null);
  return (
    <>
      <h1 className={classes.title}>{t("account.title")}</h1>
      <p className={classes.who}>
        <span className={classes.name}>{member.name}</span>
        <span className={classes.meta}>{t(`role.${member.role}`)}</span>
      </p>
      <Section title={t("account.credentials")}>
        <ul className={classes.credentials}>
          {live.map((credential) => (
            <CredentialLine key={credential.id} credential={credential} />
          ))}
        </ul>
        {canUsePasskeys() && <AddPasskey />}
      </Section>
      <Section title={t("account.download")}>
        <p>{t("account.downloadAbout")}</p>
        <Button variant="outline" size="md" onClick={() => download(account.data)}>
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
        {state.isWorking ? t("passkey.working") : t("account.add")}
      </Button>
      {state.isDone && <p role="status">{t("account.added")}</p>}
      {state.refusal && <Problem refusal={state.refusal} />}
    </div>
  );
}

/** Signing out, and deleting the account: each with what it costs beside its button. */
function Leave({ session }: { session: SessionAnswer }) {
  const { t } = useLanguage();
  const client = useQueryClient();
  const [asked, setAsked] = useState<"out" | "delete" | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const isLinked = session.via === "device";
  const gone = () => {
    client.setQueryData(sessionQuery.queryKey, null);
    go("/", "replace");
  };
  const signOut = async () => {
    await call("POST", "/api/logout");
    gone();
  };
  const remove = async () => {
    const done = await call("DELETE", "/api/account");
    if (!done.ok) {
      setAsked(null);
      return setRefusal(done.error);
    }
    gone();
  };
  return (
    <>
      <Section title={t("account.signOut")}>
        {isLinked && <p>{t("account.signOutBrowserCost")}</p>}
        <Button variant="outline" size="md" onClick={() => void signOut()}>
          {t("account.signOut")}
        </Button>
      </Section>
      <Section title={t("account.delete")}>
        {asked !== "delete" && <p>{t("account.deleteCost")}</p>}
        {asked === "delete" ? (
          <Confirm
            cost={t("account.deleteCost")}
            action={t("account.deleteConfirm")}
            onConfirm={() => void remove()}
            onCancel={() => setAsked(null)}
          />
        ) : (
          <Button variant="outline" size="md" onClick={() => setAsked("delete")}>
            {t("account.delete")}
          </Button>
        )}
        {refusal !== null && <Problem refusal={refusal} />}
      </Section>
    </>
  );
}

/** The account as a file the member keeps: their name, role and passkeys, without any key. */
function download(account: Account): void {
  const file = new Blob([JSON.stringify(account, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "account.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
