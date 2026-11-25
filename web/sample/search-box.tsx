import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "../app/icons";
import { useLanguage } from "../app/language";
import { go } from "../app/router";
import { isPhone, usePage } from "../app/use-page";
import { type Found, searchOf } from "../tree/search";
import { useData } from "./data";
import { hrefOf, treePlace } from "./places";
import classes from "./search-box.module.css";

const most = 30;

/** A field on the desktop, a button that opens the field on the phone. */
export function SearchBox() {
  const { t } = useLanguage();
  const page = usePage();
  const [isOpen, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (!isPhone(page)) return <Field onDone={() => {}} />;
  return (
    <>
      <button
        ref={button}
        type="button"
        className={classes.button}
        aria-label={t("search.label")}
        aria-expanded={isOpen}
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
      </button>
      {isOpen && (
        <div className={classes.over}>
          <Field
            isAlone
            onDone={() => {
              setOpen(false);
              button.current?.focus();
            }}
          />
        </div>
      )}
    </>
  );
}

function Field({ isAlone = false, onDone }: { isAlone?: boolean; onDone: () => void }) {
  const { t } = useLanguage();
  const { snapshot } = useData();
  const search = useMemo(() => searchOf(snapshot), [snapshot]);
  const [query, setQuery] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const all = useMemo(() => search(query), [search, query]);
  const found = all.slice(0, most);
  const hasQuery = query.trim() !== "";
  const isShown = isOpen && hasQuery;
  const status = all.length === 0 ? t("search.none") : t("search.found", { count: all.length });

  useEffect(() => {
    if (isAlone) input.current?.focus();
  }, [isAlone]);
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const choose = (one: Found | undefined): void => {
    if (one === undefined) return;
    setQuery("");
    setOpen(false);
    go(hrefOf(treePlace(one.person.id)));
    onDone();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    // Enter ends a word that is still being put together.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      setQuery("");
      setOpen(false);
      if (isAlone) onDone();
    }
    if (event.key === "Enter" && isShown) choose(found[active]);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step === undefined || found.length === 0) return;
    event.preventDefault();
    setOpen(true);
    setActive((active + step + found.length) % found.length);
  };

  return (
    <div
      className={classes.field}
      data-alone={isAlone || undefined}
      role="search"
      onBlur={({ currentTarget, relatedTarget }) => {
        if (!currentTarget.contains(relatedTarget)) setOpen(false);
      }}
    >
      <SearchIcon />
      <input
        ref={input}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("search.label")}
        aria-label={t("search.label")}
        aria-autocomplete="list"
        aria-expanded={isShown && found.length > 0}
        aria-controls={id}
        aria-activedescendant={isShown && found.length > 0 ? `${id}-${active}` : undefined}
        value={query}
        onChange={({ target }) => {
          setQuery(target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {isAlone && (
        <button
          type="button"
          className={classes.button}
          aria-label={t("search.close")}
          onClick={onDone}
        >
          <CloseIcon />
        </button>
      )}
      <p role="status" className={classes.said}>
        {isShown && status}
      </p>
      <div className={classes.results} hidden={!isShown}>
        <p aria-hidden="true">{status}</p>
        <ul ref={list} id={id} role="listbox" aria-label={t("search.label")}>
          {found.map((one, i) => (
            <Option
              key={one.person.id}
              id={`${id}-${i}`}
              found={one}
              isActive={i === active}
              onChoose={() => choose(one)}
            />
          ))}
        </ul>
        {all.length > most && <p>{t("search.first", { number: most })}</p>}
      </div>
    </div>
  );
}

type OptionProps = { id: string; found: Found; isActive: boolean; onChoose: () => void };

function Option({ id, found: { person, form }, isActive, onChoose }: OptionProps) {
  const { words } = useData();
  const { given, surname } = words.fullName(person.name);
  const other = form === null ? null : words.fullName(form);
  return (
    <li
      id={id}
      role="option"
      aria-selected={isActive}
      className={classes.option}
      // The field keeps the focus, so a press is not lost to its blur.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
    >
      <span className={classes.name} data-unnamed={!words.isNamed(person) || undefined}>
        {given} <span style={{ color: words.ink(person.branch) }}>{surname}</span>
      </span>
      {other !== null && (
        <span
          className={classes.other}
          lang={form?.language === "other" ? undefined : form?.language}
          dir={form?.script === "Hebr" ? "rtl" : undefined}
        >
          {`${other.given} ${other.surname}`}
        </span>
      )}
      <span className={classes.detail}>
        {words.years(person)}{" "}
        <b style={{ color: words.ink(person.branch) }}>{words.branch(person.branch)}</b>
      </span>
    </li>
  );
}
