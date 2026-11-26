import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo } from "react";
import { readPlace } from "../sample/places";
import { Boundary } from "./boundary";
import { configQuery } from "./config";
import { useLanguage } from "./language";
import { Message } from "./message";
import classes from "./pages.module.css";
import { go } from "./router";

// Most people open the start page only.
const Sample = lazy(async () => ({ default: (await import("../sample/sample")).Sample }));
const Access = lazy(async () => ({ default: (await import("../access/screens")).AccessScreen }));

/** The addresses of signing in and of the members; kept here, so the start page loads none of it. */
const accessPaths = new Set(["/setup", "/join", "/sign-in", "/family", "/account"]);

type PagesProps = { path: string; search: string };

/** Every page but the start page. The example is a page only where the installation allows it. */
export function Pages({ path, search }: PagesProps) {
  const { t } = useLanguage();
  const { data, isError } = useQuery(configQuery);
  const place = useMemo(() => readPlace(path, search), [path, search]);
  if (accessPaths.has(path)) {
    return (
      <Boundary fallback={<Failed />}>
        <Suspense fallback={<Waiting />}>
          <Access path={path as never} />
        </Suspense>
      </Boundary>
    );
  }
  const waiting = (
    <main className={classes.page}>
      <Message text={t("tree.loading")} />
    </main>
  );
  const problem = (text: string) => (
    <main className={classes.page}>
      <Message
        text={text}
        action={{ label: t("page.reload"), onClick: () => window.location.reload() }}
        isProblem
      />
    </main>
  );
  if (place !== null && isError) return problem(t("health.unreachable"));
  if (place !== null && data === null) return problem(t("health.broken"));
  if (place !== null && data === undefined) return waiting;
  if (place === null || data?.sample !== true) {
    return (
      <main className={classes.page}>
        <Message
          text={t("page.unknown")}
          action={{ label: t("page.start"), onClick: () => go("/") }}
        />
      </main>
    );
  }
  return (
    <Boundary fallback={problem(t("page.failed"))}>
      <Suspense fallback={waiting}>
        <Sample place={place} />
      </Suspense>
    </Boundary>
  );
}

function Waiting() {
  const { t } = useLanguage();
  return (
    <main className={classes.page}>
      <Message text={t("page.loading")} />
    </main>
  );
}

function Failed() {
  const { t } = useLanguage();
  return (
    <main className={classes.page}>
      <Message
        text={t("page.failed")}
        action={{ label: t("page.reload"), onClick: () => window.location.reload() }}
        isProblem
      />
    </main>
  );
}
