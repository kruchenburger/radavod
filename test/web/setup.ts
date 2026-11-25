import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has neither; Mantine needs both.
window.matchMedia = (query) =>
  ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Node has a localStorage of its own, which vitest would keep.
const { jsdom } = globalThis as unknown as { jsdom: { window: Window } };
Object.defineProperty(globalThis, "localStorage", {
  value: jsdom.window.localStorage,
  configurable: true,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
