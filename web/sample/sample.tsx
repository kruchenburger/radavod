import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { TreeSample, TreeSnapshot } from "../../src/shared/tree";
import { useLanguage } from "../app/language";
import { Message } from "../app/message";
import { go } from "../app/router";
import { kinOf } from "../tree/layout/kin";
import { loadFonts } from "../tree/type";
import { wordsOf } from "../tree/words";
import { BranchesScreen } from "./branches-screen";
import { DataContext, sampleQuery, useData } from "./data";
import { Frame } from "./frame";
import { ListScreen } from "./list-screen";
import { PersonScreen } from "./person-screen";
import { hrefOf, type Place, treePlace } from "./places";
import { TreeScreen } from "./tree-screen";

/** The invented family: every screen of the tree, read only. */
export function Sample({ place }: { place: Place }) {
  const { t } = useLanguage();
  const { data, isError } = useQuery(sampleQuery);
  const areFontsReady = useFonts(data?.snapshot);
  if (isError || data === null) {
    const text = t(isError ? "health.unreachable" : "health.broken");
    const reload = { label: t("page.reload"), onClick: () => window.location.reload() };
    return (
      <Frame place={place} sample={null}>
        <Message text={text} action={reload} isProblem />
      </Frame>
    );
  }
  if (data === undefined || !areFontsReady) {
    return (
      <Frame place={place} sample={null}>
        <Message text={t("tree.loading")} />
      </Frame>
    );
  }
  return <Screens place={place} sample={data} />;
}

function Screens({ place, sample }: { place: Place; sample: TreeSample }) {
  const { t, locale } = useLanguage();
  const { snapshot, start } = sample;
  const words = useMemo(() => wordsOf(snapshot, locale), [snapshot, locale]);
  const data = useMemo(() => ({ snapshot, start, words }), [snapshot, start, words]);
  const person = "person" in place ? place.person : null;
  const one = person === null ? undefined : kinOf(snapshot).person(person);
  const isUnknown = person !== null && one === undefined;

  const title = one === undefined ? t(titles[place.screen]) : words.name(one);
  useEffect(() => {
    document.title = t("app.title", { page: title });
    return () => {
      document.title = t("app.name");
    };
  }, [t, title]);

  return (
    <DataContext value={data}>
      <Frame place={place} sample={sample}>
        {isUnknown ? (
          <Message
            text={t("person.unknown")}
            action={{ label: t("card.back"), onClick: () => go(hrefOf(treePlace(null))) }}
          />
        ) : (
          <Screen place={place} />
        )}
      </Frame>
    </DataContext>
  );
}

const titles = {
  tree: "view.around",
  branches: "view.branches",
  person: "person.unknown",
  list: "view.list",
} as const;

function Screen({ place }: { place: Place }) {
  const { start } = useData();
  switch (place.screen) {
    case "tree":
      return <TreeScreen place={{ ...place, person: place.person ?? start }} />;
    case "branches":
      return <BranchesScreen place={place} />;
    case "person":
      return <PersonScreen key={place.person} person={place.person} />;
    case "list":
      return <ListScreen key={place.person} person={place.person} />;
  }
}

/** Widths of names are measured, so the fonts come before the tree. */
function useFonts(snapshot: TreeSnapshot | undefined): boolean {
  const [isReady, setReady] = useState(false);
  useEffect(() => {
    if (snapshot === undefined) return undefined;
    let isGone = false;
    const letters = JSON.stringify([snapshot.people, snapshot.branches]);
    void loadFonts(letters).then(() => {
      if (!isGone) setReady(true);
    });
    return () => {
      isGone = true;
    };
  }, [snapshot]);
  return isReady;
}
