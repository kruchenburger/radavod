import { Button, TextInput, Title } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import type { InvitationAnswer, SessionAnswer } from "../../src/shared/access";
import { useArrival } from "../app/arrival";
import { Halves } from "../app/halves";
import { useLanguage } from "../app/language";
import { go } from "../app/router";
import {
  type Answer,
  call,
  canUsePasskeys,
  makePasskey,
  type Refusal,
  secretOfLink,
  sessionQuery,
  signInWithPasskey,
} from "./api";
import classes from "./entry.module.css";
import { asRefusal, textOf } from "./errors";

/** Where a member goes once signed in. */
const home = "/family";

/** First run: the code of the installation, the name of the family and of its first keeper. */
export function Setup() {
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const [family, setFamily] = useState("");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const signed = useSignedIn();
  return (
    <Halves family={family.trim() || null}>
      <Heading>{t("setup.title")}</Heading>
      <p className={classes.about}>{t("setup.about")}</p>
      <Form
        submit={t("passkey.create")}
        onSubmit={() =>
          makePasskey<SessionAnswer>(
            "/api/setup/options",
            "/api/setup/verify",
            { code, family: family.trim(), name: name.trim() },
            label.trim(),
          )
        }
        onDone={signed}
        isReady={code !== "" && family.trim() !== "" && name.trim() !== ""}
      >
        <TextInput
          label={t("setup.code")}
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <TextInput
          label={t("setup.family")}
          description={t("setup.familyHint")}
          value={family}
          onChange={(event) => setFamily(event.currentTarget.value)}
          maxLength={200}
          required
        />
        <NameInput value={name} onChange={setName} />
        <LabelInput value={label} onChange={setLabel} />
      </Form>
      <p className={classes.note}>{t("passkey.about")}</p>
    </Halves>
  );
}

/** A link from a keeper: who it is for, a passkey, or for a reader this browser. */
export function Join() {
  const { t } = useLanguage();
  const [secret] = useState(() => secretOfLink(window.location.hash));
  const invitation = useQuery({
    queryKey: ["invitation", secret],
    enabled: secret !== null,
    retry: false,
    queryFn: async () => {
      const answer = await call<InvitationAnswer>("POST", "/api/invitation", { secret });
      if (!answer.ok) throw answer.error;
      return answer.value;
    },
  });
  if (secret === null) return <Notice text={t("join.empty")} />;
  if (invitation.isPending) return <Notice text={t("join.checking")} isWaiting />;
  if (invitation.isError) return <Notice text={textOf(t, asRefusal(invitation.error))} />;
  return <Invitation secret={secret} invitation={invitation.data} />;
}

function Invitation({ secret, invitation }: { secret: string; invitation: InvitationAnswer }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [passkeyLabel, setPasskeyLabel] = useState("");
  const signed = useSignedIn();
  const isNew = invitation.kind === "join";
  const hasPasskeys = canUsePasskeys();
  const canBind = invitation.role === "reader";
  return (
    <Halves family={invitation.family}>
      <Heading>
        {isNew && invitation.family !== null
          ? t("join.family", { family: invitation.family })
          : (invitation.family ?? t("app.name"))}
      </Heading>
      <p className={classes.about}>
        {isNew ? t(`join.as.${invitation.role}`) : t("join.recovery")}
      </p>
      {isNew && <p className={classes.note}>{t(`role.${invitation.role}.about`)}</p>}
      {hasPasskeys ? (
        <Form
          submit={t("passkey.create")}
          onSubmit={() =>
            makePasskey<SessionAnswer>(
              "/api/passkey/register/options",
              "/api/passkey/register/verify",
              isNew ? { secret, name: name.trim() } : { secret },
              passkeyLabel.trim(),
            )
          }
          onDone={signed}
          isReady={!isNew || name.trim() !== ""}
        >
          {isNew && <NameInput value={name} onChange={setName} />}
          <LabelInput value={passkeyLabel} onChange={setPasskeyLabel} />
        </Form>
      ) : (
        <NoPasskeys />
      )}
      {hasPasskeys && <p className={classes.note}>{t("passkey.about")}</p>}
      {canBind && (
        <section className={classes.other}>
          <p>{t("join.device")}</p>
          <Form
            submit={t("join.bind")}
            variant="outline"
            onSubmit={() =>
              call<SessionAnswer>("POST", "/api/device/bind", {
                secret,
                label: label.trim(),
                ...(isNew ? { name: name.trim() } : {}),
              })
            }
            onDone={signed}
            isReady={!isNew || name.trim() !== ""}
          >
            {!hasPasskeys && isNew && <NameInput value={name} onChange={setName} />}
            <TextInput
              label={t("join.deviceLabel")}
              description={t("join.deviceHint")}
              value={label}
              onChange={(event) => setLabel(event.currentTarget.value)}
              maxLength={100}
            />
          </Form>
        </section>
      )}
    </Halves>
  );
}

/** A messenger's own browser cannot make a passkey: the link goes to a real one, whole. */
function NoPasskeys() {
  const { t } = useLanguage();
  const [isCopied, setCopied] = useState(false);
  return (
    <div className={classes.form}>
      <p role="alert" className={classes.problem}>
        {t(isInApp() ? "passkey.inApp" : "passkey.noBrowser")}
      </p>
      <Button
        size="md"
        onClick={() =>
          void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))
        }
      >
        {t("link.copy")}
      </Button>
      {isCopied && <p role="status">{t("link.copied")}</p>}
    </div>
  );
}

export function SignIn() {
  const { t } = useLanguage();
  const signed = useSignedIn();
  return (
    <Halves>
      <Heading>{t("signIn.title")}</Heading>
      <p className={classes.about}>{t("signIn.about")}</p>
      {canUsePasskeys() ? (
        <Form submit={t("signIn.button")} onSubmit={signInWithPasskey} onDone={signed} isReady />
      ) : (
        <p role="alert" className={classes.problem}>
          {t(isInApp() ? "passkey.inApp" : "passkey.noBrowser")}
        </p>
      )}
      <p className={classes.note}>{t("signIn.lost")}</p>
      <p className={classes.note}>{t("signIn.none")}</p>
    </Halves>
  );
}

/** Once a member is in: the session is known, and the family opens. */
function useSignedIn() {
  const client = useQueryClient();
  return (session: SessionAnswer) => {
    client.setQueryData(sessionQuery.queryKey, session);
    go(home, "replace");
  };
}

type FormProps<T> = {
  submit: string;
  onSubmit: () => Promise<Answer<T>>;
  onDone: (value: T) => void;
  isReady: boolean;
  variant?: "filled" | "outline";
  children?: ReactNode;
};

/** Fields and one button. While the phone makes the key, the button says so; a refusal stays. */
function Form<T>({
  submit,
  onSubmit,
  onDone,
  isReady,
  variant = "filled",
  children,
}: FormProps<T>) {
  const { t } = useLanguage();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [isWorking, setWorking] = useState(false);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!isReady || isWorking) return;
    setWorking(true);
    setRefusal(null);
    const answer = await onSubmit();
    setWorking(false);
    if (answer.ok) onDone(answer.value);
    else setRefusal(answer.error);
  };
  return (
    <form className={classes.form} onSubmit={(event) => void send(event)} noValidate>
      {children}
      <Button type="submit" size="md" variant={variant} disabled={!isReady} loading={isWorking}>
        {isWorking ? t("passkey.working") : submit}
      </Button>
      {refusal !== null && (
        <p role="alert" className={classes.problem}>
          {textOf(t, refusal)}
        </p>
      )}
    </form>
  );
}

function NameInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage();
  const [isTouched, setTouched] = useState(false);
  return (
    <TextInput
      label={t("field.name")}
      description={t("field.nameHint")}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onBlur={() => setTouched(true)}
      error={isTouched && value.trim() === "" ? t("field.nameRequired") : undefined}
      autoComplete="name"
      maxLength={200}
      required
    />
  );
}

/** What the member calls the phone or computer the passkey is on. It may stay empty. */
export function LabelInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <TextInput
      label={t("passkey.label")}
      description={t("passkey.labelHint")}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      maxLength={100}
    />
  );
}

/** Messengers open links in a browser of their own, which often cannot make passkeys. */
function isInApp(): boolean {
  return /Telegram|WhatsApp|Instagram|FBAN|FBAV|Line\/|Viber|VKClient|MicroMessenger/u.test(
    navigator.userAgent,
  );
}

function Heading({ children }: { children: ReactNode }) {
  const heading = useArrival<HTMLHeadingElement>();
  return (
    <Title ref={heading} tabIndex={-1} className={classes.title}>
      {children}
    </Title>
  );
}

/** A page with nothing to do yet but read: a link being checked, or why it does not work. */
function Notice({ text, isWaiting = false }: { text: string; isWaiting?: boolean }) {
  const { t } = useLanguage();
  return (
    <Halves>
      <Heading>{t("app.name")}</Heading>
      <p
        role={isWaiting ? "status" : "alert"}
        className={isWaiting ? classes.about : classes.problem}
      >
        {text}
      </p>
    </Halves>
  );
}
