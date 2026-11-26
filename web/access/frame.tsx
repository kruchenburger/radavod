import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import type { SessionAnswer } from "../../src/shared/access";
import { useLanguage } from "../app/language";
import { Message } from "../app/message";
import { go, Link } from "../app/router";
import { LanguageChoice, ThemeButton } from "../app/controls";
import { sessionQuery } from "./session";
import classes from "./members.module.css";

type FrameProps = {
  current: "members" | "account";
  children: (session: SessionAnswer) => ReactNode;
};

/** The pages of a signed-in member: the family by its name, members, the account, signing out. */
export function SignedIn({ current, children }: FrameProps) {
  const { t } = useLanguage();
  const session = useQuery(sessionQuery);
  const isOut = session.data === null;
  useEffect(() => {
    if (isOut) go("/sign-in", "replace");
  }, [isOut]);
  if (session.isError) {
    return (
      <main className={classes.lone}>
        <Message
          text={t("health.unreachable")}
          action={{ label: t("page.reload"), onClick: () => window.location.reload() }}
          isProblem
        />
      </main>
    );
  }
  if (!session.data) {
    return (
      <main className={classes.lone}>
        <Message text={t("page.loading")} />
      </main>
    );
  }
  return (
    <div className={classes.frame}>
      <header className={classes.top}>
        <Link className={classes.brand} href="/family">
          {session.data.family ?? t("app.name")}
        </Link>
        <nav className={classes.views} aria-label={t("nav.pages")}>
          <Link href="/family" aria-current={current === "members" ? "page" : undefined}>
            {t("nav.members")}
          </Link>
          <Link href="/account" aria-current={current === "account" ? "page" : undefined}>
            {t("nav.account")}
          </Link>
        </nav>
        <div className={classes.tools}>
          <LanguageChoice />
          <ThemeButton />
        </div>
      </header>
      <main className={classes.page}>{children(session.data)}</main>
    </div>
  );
}
