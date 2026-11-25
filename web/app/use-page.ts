import { useSyncExternalStore } from "react";

/** The page in units of the text, so a reader with large text gets the layout of a small screen. */
export type Page = { width: number; height: number };

let last: Page = { width: 0, height: 0 };

function read(): Page {
  const html = document.documentElement;
  const unit = (Number.parseFloat(getComputedStyle(html).fontSize) || 16) / 16;
  // A page that is not shown yet may have no width at all.
  const width = Math.max(240, Math.floor((html.clientWidth || window.innerWidth) / unit));
  const height = Math.floor(window.innerHeight / unit);
  if (last.width !== width || last.height !== height) last = { width, height };
  return last;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  // A scroll bar that comes or goes is not a resize of the window.
  const observer = new ResizeObserver(listener);
  observer.observe(document.documentElement);
  return () => {
    window.removeEventListener("resize", listener);
    observer.disconnect();
  };
}

export const usePage = (): Page => useSyncExternalStore(subscribe, read);

/** The breakpoints of docs/design.md. */
export const phone = 720;
export const spread = 1400;
