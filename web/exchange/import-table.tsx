import { Button } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useId, useState } from "react";
import { LONGEST_TEXT } from "../../src/contexts/exchange";
import type { SessionAnswer } from "../../src/shared/access";
import { tableImported, type TablePreview, tablePreview } from "../../src/shared/exchange";
import { useLanguage } from "../app/language";
import { call, type Refusal } from "../access/api";
import { SignedIn } from "../access/frame";
import { Problem, Section, Title } from "../access/members";
import members from "../access/members.module.css";
import classes from "./import-table.module.css";

type State =
  | { step: "choose"; refusal?: Refusal }
  | { step: "reading" }
  | { step: "seen"; text: string; preview: TablePreview; isAdding?: boolean; refusal?: Refusal }
  | { step: "done"; people: number };

/** A keeper reads a family table into a tree without people: first what it will add, then adds it. */
export function ImportTable() {
  return <SignedIn current="import">{(session) => <Importing session={session} />}</SignedIn>;
}

function Importing({ session }: { session: SessionAnswer }) {
  const { t } = useLanguage();
  const [state, setState] = useState<State>({ step: "choose" });
  if (!session.mayImport) {
    return (
      <>
        <Title>{t("import.title")}</Title>
        <Problem refusal={{ code: "forbidden" }} />
      </>
    );
  }
  return (
    <>
      <Title>{t("import.title")}</Title>
      {state.step === "choose" && <Choose refusal={state.refusal} onState={setState} />}
      {state.step === "reading" && <p role="status">{t("import.reading")}</p>}
      {state.step === "seen" && <Seen state={state} onState={setState} />}
      {state.step === "done" && (
        <p role="status" className={classes.done}>
          {t("import.done", { count: state.people })}
        </p>
      )}
    </>
  );
}

function Choose({
  refusal,
  onState,
}: {
  refusal: Refusal | undefined;
  onState: (state: State) => void;
}) {
  const { t } = useLanguage();
  const id = useId();
  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    onState({ step: "reading" });
    const text = await textOf(file);
    if (typeof text !== "string") return onState({ step: "choose", refusal: text });
    const answer = await call("POST", "/api/import/table/preview", { text });
    if (!answer.ok) return onState({ step: "choose", refusal: answer.error });
    onState({ step: "seen", text, preview: tablePreview.parse(answer.value) });
  };
  return (
    <>
      <p className={classes.about}>{t("import.about")}</p>
      <div className={classes.file}>
        <label htmlFor={id}>{t("import.file")}</label>
        <input
          id={id}
          type="file"
          accept=".csv,text/csv"
          aria-describedby={refusal === undefined ? undefined : `${id}-problem`}
          onChange={(event) => void read(event)}
        />
      </div>
      {refusal !== undefined && (
        <div id={`${id}-problem`}>
          <Problem refusal={refusal} />
        </div>
      )}
    </>
  );
}

/** The text of a file, or why it is no table: a spreadsheet saves CSV in UTF-8 when asked to. */
async function textOf(file: File): Promise<string | Refusal> {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    // The server says so too; a file this long is not sent at all.
    return text.length > LONGEST_TEXT ? { code: "too-large" } : text;
  } catch {
    return { code: "not-utf8" };
  }
}

function Seen({
  state,
  onState,
}: {
  state: Extract<State, { step: "seen" }>;
  onState: (state: State) => void;
}) {
  const { t } = useLanguage();
  const client = useQueryClient();
  const { preview, text } = state;
  const add = async () => {
    onState({ step: "seen", text, preview, isAdding: true });
    const answer = await call("POST", "/api/import/table", { text });
    if (!answer.ok) return onState({ ...state, isAdding: false, refusal: answer.error });
    onState({ step: "done", people: tableImported.parse(answer.value).people });
    await client.invalidateQueries();
  };
  const counts = [
    t("import.people", { count: preview.people.length }),
    t("import.unions", { count: preview.unions }),
    t("import.parents", { count: preview.parents }),
    t("import.births", { count: preview.births }),
    t("import.deaths", { count: preview.deaths }),
    t("import.sources", { count: preview.sources }),
  ];
  const hasLeft = preview.left.statuses + preview.left.notes > 0;
  return (
    <>
      <Section title={t("import.added")}>
        <ul className={classes.counts}>
          {counts.map((count) => (
            <li key={count}>{count}</li>
          ))}
        </ul>
        {hasLeft && <p className={members.meta}>{t("import.skipped")}</p>}
        <details className={classes.everyone}>
          <summary>{t("import.everyone")}</summary>
          <ul className={members.list}>
            {preview.people.map((one) => (
              <li key={one.row} className={members.row}>
                <span className={members.meta}>{t("import.line", { row: one.row })}</span>
                <span className={members.name}>
                  {[one.surname, one.maiden ?? "", one.given, one.patronymic]
                    .filter((part) => part !== "")
                    .join(" ")}
                </span>
                <span className={members.meta}>
                  {one.died === null ? (one.born ?? "") : `${one.born ?? ""} – ${one.died}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </Section>
      <Section title={t("import.check")}>
        {preview.problems.length === 0 ? (
          <p>{t("import.clean")}</p>
        ) : (
          <ul className={classes.problems}>
            {preview.problems.map((problem, i) => (
              <li key={`${problem.row} ${problem.code} ${i}`}>
                {t(`problem.${problem.code}`, {
                  row: problem.row,
                  value: problem.value ?? "",
                  parent: problem.parent ?? "",
                  rows: [...(problem.rows ?? []), ...(problem.more ? ["…"] : [])].join(", "),
                })}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section>
        <div className={classes.confirm}>
          <p>{t("import.confirmNote")}</p>
          <div className={members.buttons}>
            <Button size="md" loading={state.isAdding === true} onClick={() => void add()}>
              {t("import.confirm")}
            </Button>
            <Button
              size="md"
              variant="outline"
              disabled={state.isAdding === true}
              onClick={() => onState({ step: "choose" })}
            >
              {t("import.another")}
            </Button>
          </div>
          {state.refusal !== undefined && <Problem refusal={state.refusal} />}
        </div>
      </Section>
    </>
  );
}
