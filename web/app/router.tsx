import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from "react";

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
  if (how === "push") window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
  window.dispatchEvent(new Event(changed));
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
