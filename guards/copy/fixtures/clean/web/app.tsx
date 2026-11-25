import { useState, type ReactNode } from "react";
import "./main.css";

type Role = "keeper" | "reader";
const ROLES: Role[] = ["keeper", "reader"];
const messages = { conflict: "error.conflict" } as const;

type Props = { person: { name: string; year: string; note: string }; code: "conflict" };

export function App({ person, code }: Props) {
  const { t, locale } = useT();
  const [tab, setTab] = useState("main list");
  if (person.name === "") throw new Error("person-without-name");
  console.error("the tree did not load", person);
  document.title = `${person.name} | ${t("app.name")}`;
  return (
    <main className="page wide" aria-labelledby="name note" style={{ fontFamily: "Roboto Slab, serif" }}>
      <h1 id="name" title={person.name} lang={locale}>
        {t("person.born", { name: person.name, year: person.year })}
      </h1>
      {tab === "main list" ? <p id="note">{person.note}</p> : null} / {t("people.count", { count: 2 })}&nbsp;·
      <input
        type="text"
        aria-label={t("person.add")}
        placeholder={t("app.name")}
        onFocus={() => setTab("all")}
      />
      <path d="M0 0 L10 10 Z" />
      <Tabs
        classNames={{ label: "tab-label" }}
        label={person.year.padStart(4, "0")}
        size="md"
        data={ROLES.map((role) => ({ value: role, label: t(`role.${role}`) }))}
      />
      <Empty>{t(messages[code])}</Empty>
    </main>
  );
}

/** None of this is a text of the interface. */
export function Codes({ url, role }: { url: string; role: Role }) {
  const [code, setCode] = useState("conflict");
  return (
    <>
      <p>{url.replace("https://", "")}</p>
      <Tabs label={role} size="sm" classNames={{}} data={[{ value: "Living", label: t("ru", "role.reader") }]} />
      <Empty error={code} options={["blood", "adoption"]} title="role.keeper" ff="Roboto Slab">
        {String(death.cause)}
      </Empty>
      <button onClick={() => setCode("other")}>{t(locale, "person.born", { name: role, year: "" })}</button>
    </>
  );
}

export function download() {
  const name = "tree.ged";
  notifications.hide("import-progress");
  store.notify("changed");
  worker.postMessage({ message: "start", sort: { title: "asc" }, text: "var(--ink)" });
  writable.write("0 HEAD");
  new FontFace("Roboto Slab Variable", name);
  return new Intl.DateTimeFormat("D MMMM YYYY");
}

export const Card = ({ name }: { name: string }) => <p>{name}</p>;
type Living = "Living person";
declare const death: { cause: string };
declare const locale: "ru" | "en";
declare const notifications: any, store: any, worker: any, writable: any;
declare function t(locale: string, key: string, params?: object): string;
declare function useT(): { t: (key: string, params?: object) => string; locale: string };
declare function Tabs(props: { label: string; size: string; classNames: object; data: object[] }): ReactNode;
declare function Empty(props: { children: ReactNode } & Record<string, unknown>): ReactNode;
