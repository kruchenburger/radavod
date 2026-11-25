import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo } from "react";
import { readPlace } from "../sample/places";
import { configQuery } from "./config";
import { useLanguage } from "./language";
import { Message } from "./message";
import classes from "./pages.module.css";
import { go } from "./router";

// Most people open the start page only.
const Sample = lazy(async () => ({ default: (await import("../sample/sample")).Sample }));

type PagesProps = { path: string; search: string };

/** Every page but the start page. The example is a page only where the installation allows it. */
export function Pages({ path, search }: PagesProps) {
  const { t } = useLanguage();
  const { data, isError } = useQuery(configQuery);
  const place = useMemo(() => readPlace(path, search), [path, search]);
  const waiting = (
    <main className={classes.page}>
      <Message text={t("tree.loading")} />
    </main>
  );
  if (place !== null && isError) {
    const reload = { label: t("page.reload"), onClick: () => window.location.reload() };
    return (
      <main className={classes.page}>
        <Message text={t("health.unreachable")} action={reload} isProblem />
      </main>
    );
  }
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
    <Suspense fallback={waiting}>
      <Sample place={place} />
    </Suspense>
  );
}
