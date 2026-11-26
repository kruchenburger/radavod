// The focus of the views that stand around a person: the person in the centre, and the keys.
import { type KeyboardEvent, type RefObject, useRef } from "react";
import type { Arrow, Move } from "../tree/layout/keys";

/**
 * The keys work at once: the person in the centre takes the focus when the tree opens and after
 * every move, unless the visitor has put it somewhere else (the search, a link of the page).
 */
export function holdCentre(): void {
  const active = document.activeElement;
  const isFree =
    active === null ||
    active === document.body ||
    (active instanceof HTMLElement && active.closest("[data-press]") !== null);
  if (!isFree) return;
  const centre = document.querySelector<HTMLElement>("[data-focus] > [data-press]");
  if (centre === null || centre === active) return;
  // No mark until a key is pressed, and none after a press of the mouse.
  centre.focus({ preventScroll: true, focusVisible: isByKeys });
}

/** Whether the visitor last used the keys, not the mouse or a finger. */
let isByKeys = false;
window.addEventListener("keydown", () => (isByKeys = true), { capture: true });
window.addEventListener("pointerdown", () => (isByKeys = false), { capture: true });

/** The keys that walk a drawing of people. */
export const arrows: Partial<Record<string, Arrow>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * The arrows walk the cards of a drawing under `root`: the focus moves to the card `move` names and
 * the view follows it. `move` hears which card the walk came from.
 */
export function useArrowKeys(
  move: Move,
  root: RefObject<HTMLElement | null>,
): (event: KeyboardEvent) => void {
  const cameFrom = useRef<string | null>(null);
  return (event) => {
    const arrow = arrows[event.key];
    const key = (event.target as HTMLElement).dataset["press"];
    if (arrow === undefined || key === undefined) return;
    const next = move(key, arrow, cameFrom.current);
    if (next === null) return;
    event.preventDefault();
    cameFrom.current = key;
    const card = root.current?.querySelector<HTMLElement>(`[data-press="${CSS.escape(next)}"]`);
    card?.focus();
    card?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
}
