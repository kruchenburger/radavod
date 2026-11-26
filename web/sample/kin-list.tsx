import { type ReactNode, useId } from "react";
import type { Certainty, TreeParentage } from "../../src/shared/tree";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { CertaintyMark } from "../tree/certainty";
import { kinOf } from "../tree/layout/kin";
import { type Relatives, relativesOf } from "../tree/layout/relatives";
import { shareOneParent } from "../tree/siblings";
import { apart } from "./apart";
import { useData } from "./data";
import classes from "./kin-list.module.css";
import { hrefOf, type Place } from "./places";

type Tie = Pick<TreeParentage, "kind" | "main" | "certainty">;
type KinListProps = { person: string; hrefFor: (person: string) => Place };

/** Parents, siblings, unions and children, with everything the tree says about the ties. */
export function KinList({ person, hrefFor }: KinListProps) {
  const { t } = useLanguage();
  const { snapshot } = useData();
  const kin = relativesOf(snapshot, person);
  if (kin === null) return null;
  const { parents, siblings, unions, otherChildren } = kin;
  if (parents.length + siblings.length + unions.length + otherChildren.length === 0) {
    return <p className={classes.none}>{t("kin.none")}</p>;
  }
  // Another parent of the children is no partner in a union nobody told of.
  const told = unions.filter(({ union }) => union !== null);
  const children = [
    ...unions.filter(({ union }) => union === null).flatMap((one) => one.children),
    ...otherChildren,
  ];
  return (
    <div className={classes.kin}>
      <Group title={t("kin.parents")}>
        {parents.map(({ person: parent, ...tie }, i) => (
          <Entry key={i} person={parent} hrefFor={hrefFor} tie={tie} />
        ))}
      </Group>
      <Group title={t("kin.siblings")}>
        {siblings.map((sibling) => (
          <Entry
            key={sibling.person}
            person={sibling.person}
            hrefFor={hrefFor}
            notes={[
              ...(shareOneParent(kinOf(snapshot), person, sibling) ? [t("kin.oneParent")] : []),
              ...kindsOf(sibling.shared).map((kind) => t(`kinship.${kind}`)),
            ]}
          />
        ))}
      </Group>
      <Group title={t("kin.unions")}>
        {told.map((union) => (
          <UnionEntry key={union.union} union={union} hrefFor={hrefFor} />
        ))}
      </Group>
      <Group title={t("kin.children")}>
        {children.map(({ person: child, ...tie }) => (
          <Entry key={child} person={child} hrefFor={hrefFor} tie={tie} />
        ))}
      </Group>
    </div>
  );
}

const kindsOf = (shared: Relatives["siblings"][number]["shared"]) =>
  [...new Set(shared.flatMap(({ own, theirs }) => [own, theirs]))].flatMap((kind) =>
    kind === "blood" ? [] : [kind],
  );

function Group({ title, children }: { title: string; children: ReactNode[] }) {
  const id = useId();
  if (children.length === 0) return null;
  return (
    <section className={classes.group} aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

type UnionEntryProps = { union: Relatives["unions"][number]; hrefFor: KinListProps["hrefFor"] };

/** A partner with the children of the union under it. */
function UnionEntry({ union, hrefFor }: UnionEntryProps) {
  const { t } = useLanguage();
  const { partner, kind, certainty, children } = union;
  return (
    <Entry
      person={partner}
      hrefFor={hrefFor}
      notes={kind === null ? [] : [t(`union.${kind}`)]}
      certainty={certainty}
    >
      {children.length > 0 && (
        <>
          <h4>{t("kin.children")}</h4>
          <ul>
            {children.map(({ person: child, ...tie }) => (
              <Entry key={child} person={child} hrefFor={hrefFor} tie={tie} />
            ))}
          </ul>
        </>
      )}
    </Entry>
  );
}

type EntryProps = {
  /** Null for somebody nobody knows. */
  person: string | null;
  hrefFor: KinListProps["hrefFor"];
  tie?: Tie;
  notes?: string[];
  certainty?: Certainty | null;
  children?: ReactNode;
};

function Entry({ person, hrefFor, tie, notes = [], certainty = null, children }: EntryProps) {
  const { t } = useLanguage();
  const all = [
    ...notes,
    ...(tie === undefined || tie.kind === "blood" ? [] : [t(`kinship.${tie.kind}`)]),
    ...(tie?.main === false ? [t("kinship.version")] : []),
  ];
  const sure = certainty ?? tie?.certainty ?? null;
  return (
    <li>
      <PersonLine person={person} hrefFor={hrefFor} notes={all}>
        {sure !== null && <CertaintyMark of={sure} />}
      </PersonLine>
      {children}
    </li>
  );
}

type PersonLineProps = {
  person: string | null;
  hrefFor: KinListProps["hrefFor"];
  notes?: string[];
  /** Within the page of a branch its name does not stand with everybody. */
  without?: string | null;
  children?: ReactNode;
};

/** A name as a link, the years, the branch and what else there is to say. */
export function PersonLine({ person, hrefFor, notes = [], without, children }: PersonLineProps) {
  const { t } = useLanguage();
  const { snapshot, words } = useData();
  const one = person === null ? undefined : kinOf(snapshot).person(person);
  if (one === undefined) {
    return (
      <span className={classes.line}>
        <i className={classes.unknown}>{t("person.unnamed")}</i>
        <span className={classes.detail}>{notes.join(", ")}</span>
        {children}
      </span>
    );
  }
  const isBranchShown = without === undefined || one.branch === null || one.branch !== without;
  return (
    <span className={classes.line}>
      <Link
        href={hrefOf(hrefFor(one.id))}
        className={classes.name}
        data-unnamed={!words.isNamed(one) || undefined}
      >
        {words.name(one)}
      </Link>{" "}
      <span className={classes.detail}>
        {apart([
          words.years(one),
          notes.length > 0 && notes.join(", "),
          isBranchShown && (
            <b key="branch" className={classes.detail} style={{ color: words.ink(one.branch) }}>
              {words.branch(one.branch)}
            </b>
          ),
        ])}
      </span>{" "}
      {children}
    </span>
  );
}
