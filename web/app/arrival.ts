import { type RefObject, useEffect, useRef } from "react";

let isFirst = true;

/**
 * A new screen begins at its heading, for the eye and for a screen reader. Not at the first load,
 * when the browser decides. A screen that scrolls to a place of its own says where to begin.
 */
export function useArrival<T extends HTMLElement>(
  find?: () => HTMLElement | null,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const begin = useRef(find);
  useEffect(() => {
    if (!isFirst) {
      if (begin.current === undefined) window.scrollTo(0, 0);
      const element = begin.current === undefined ? ref.current : begin.current();
      element?.focus({ preventScroll: true });
    }
    isFirst = false;
  }, []);
  return ref;
}
