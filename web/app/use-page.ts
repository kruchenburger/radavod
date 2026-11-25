import { useSyncExternalStore } from "react";

/** The page in units of the text, so a reader with large text gets the layout of a small screen. */
export type Page = {
  /** Without the bar of the scroll: what there is room for. */
  width: number;
  height: number;
  /** With it, as the styles count: which layout it is. */
  outer: number;
};

let last: Page = { width: 0, height: 0, outer: 0 };

function read(): Page {
  const html = document.documentElement;
  const unit = (Number.parseFloat(getComputedStyle(html).fontSize) || 16) / 16;
  // A page that is not shown yet may have no width at all.
  const width = Math.max(240, Math.floor((html.clientWidth || window.innerWidth) / unit));
  const height = Math.floor(window.innerHeight / unit);
  const outer = Math.floor(window.innerWidth / unit);
  if (last.width !== width || last.height !== height || last.outer !== outer) {
    last = { width, height, outer };
  }
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
export const isPhone = ({ outer }: Page): boolean => outer < 720;
export const isSpread = ({ outer }: Page): boolean => outer >= 1400;
