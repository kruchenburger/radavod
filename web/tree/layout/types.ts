import type {
  Certainty,
  TreeParentage,
  TreePerson,
  TreeUnion,
} from "../../../src/shared/tree";

/** What a text looks like. The screen knows the fonts, the layout only asks how wide a text is. */
export type TextStyle =
  | "name"
  | "nameDirect"
  | "detail"
  | "reference"
  | "focusName"
  /** A chosen person with a double surname. */
  | "focusNameDouble"
  | "focusNameNarrow"
  | "focusDetail"
  | "head"
  | "closerName"
  | "closerNameDirect"
  | "closerReference"
  | "nearName"
  | "nearNameDirect"
  | "nearReference"
  | "nearDetail";

export type Measure = (text: string, style: TextStyle) => number;

/** The words of a card, written by the screen. Any of them may be empty. */
export type CardText = { given: string; surname: string; years: string; branch: string };

export type UnknownPlace =
  /** One place for both parents when neither is known. */
  | { of: "parent"; child: string; parentages: string[] }
  | { of: "partner"; partner: string; union: string };

/** An entry that names people who stand elsewhere instead of drawing them again. */
export type Reference = {
  /** Who they are to the people the reference stands with. */
  as: "parents" | "child" | "partner";
  people: string[];
  /** The page of the map they stand on. Null for the page of no branch and around a person. */
  page: string | null;
};

export type Wording = {
  person: (person: TreePerson) => CardText;
  unknown: (place: UnknownPlace) => string;
  reference: (reference: Reference) => { title: string; detail: string };
};

export type Part = "given" | "surname" | "years" | "branch" | "unknown" | "title" | "detail";

/** A piece of text, its box counted from the corner of its card. */
export type Line = {
  text: string;
  part: Part;
  style: TextStyle;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Box = { x: number; y: number; w: number; h: number };
export type Point = readonly [x: number, y: number];

/** Cards are known by keys: the key of a person never meets the key of an unknown place. */
export const personKey = (id: string): string => `p:${id}`;

export type Card = Box & {
  key: string;
  /** Null for an unknown place and for a reference. */
  person: string | null;
  /** On the direct line. */
  direct: boolean;
  unknown?: UnknownPlace;
  reference?: Reference;
};

type LinkBase = {
  /** Links of one family share a trunk. Only they may lie on one another. */
  family: string;
  certainty: Certainty;
  direct: boolean;
  /**
   * Pieces along one axis each; the screen rounds the corners. Empty when the cards of a union
   * stand together.
   */
  points: Point[];
};

export type ParentageLink = LinkBase & {
  type: "parentage";
  /** Keys of one parent, or of both when the line leaves the couple. */
  parents: string[];
  child: string;
  /** The reference that stands here for the parents, or for the child. */
  parentsAt?: string;
  childAt?: string;
  kind: TreeParentage["kind"];
  main: boolean;
  /** False when it does not decide where the child stands. */
  tree: boolean;
};

export type UnionLink = LinkBase & {
  type: "union";
  union: string;
  partners: [string, string];
  /** The reference that stands here for the second partner. */
  at?: string;
  kind: TreeUnion["kind"];
};

/** From a reference to the people it names. */
export type ReferenceLink = LinkBase & { type: "reference"; reference: string; to: string[] };

export type Link = ParentageLink | UnionLink | ReferenceLink;

export type Layout = {
  cards: Card[];
  links: Link[];
  width: number;
  height: number;
  /** Keys of cards as they are read, for the keyboard. */
  order: string[];
};
