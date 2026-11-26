import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useSyncExternalStore } from "react";

/** The address is the state of the screen: what is in it survives back, forward, reload and a link. */
export type Address = { path: string; search: string };

const changed = "radavod:address";

let last: Address = { path: "/", search: "" };

function read(): Address {
  const { pathname: path, search } = window.location;
  if (last.path !== path || last.search !== search) last = { path, search };
  return last;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(changed, listener);
  };
}

/** Whether the last step was one back or forward, when the browser puts the page where it was. */
let isReturn = false;
window.addEventListener("popstate", () => {
  isReturn = true;
});

export const cameBack = (): boolean => isReturn;

export const useAddress = (): Address => useSyncExternalStore(subscribe, read);

/** Goes to another place of the app. The same address twice is one step of the history. */
export function go(href: string, how: "push" | "replace" = "push"): void {
  const { pathname, search } = window.location;
  if (href === pathname + search) return;
  isReturn = false;
  if (how === "push")
    window.history.pushState({ step: stepOf(window.history.state) + 1 }, "", href);
  else window.history.replaceState(window.history.state, "", href);
  window.dispatchEvent(new Event(changed));
}

/**
 * How many steps inside the app lie behind this entry of the history. An entry the app did not
 * make, the first of a visit or one that came from another site, has none.
 */
function stepOf(state: unknown): number {
  const step = typeof state === "object" && state !== null ? Reflect.get(state, "step") : 0;
  return typeof step === "number" && Number.isInteger(step) && step > 0 ? step : 0;
}

/** One step back, never out of the site. Says whether there was a step to take. */
export function goBack(): boolean {
  if (stepOf(window.history.state) === 0) return false;
  window.history.back();
  return true;
}

/** Backspace is one step back, while nobody is typing. */
export function onBackKey(event: KeyboardEvent): void {
  if (event.key !== "Backspace" || event.defaultPrevented || event.isComposing) return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
  if (isTyping(event.target)) return;
  if (goBack()) event.preventDefault();
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
    null;

/** The one place that listens for the key, whatever the screen. */
export function useBackKey(): void {
  useEffect(() => {
    window.addEventListener("keydown", onBackKey);
    return () => window.removeEventListener("keydown", onBackKey);
  }, []);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  ref?: React.Ref<HTMLAnchorElement>;
};

/** A real link, so a new tab, copying the address and a screen reader work as anywhere. */
export function Link({ onClick, href, ...rest }: LinkProps) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !isPlain(event)) return;
        event.preventDefault();
        go(href);
      }}
    />
  );
}

const isPlain = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
