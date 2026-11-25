import type { Exception } from "./guard.ts";

/** Development tools under other licenses. Nothing here ships, so each one says why it is here. */
export const exceptions: Exception[] = [
  {
    name: "@axe-core/playwright",
    licenses: ["MPL-2.0"],
    reason: "accessibility checks of the end-to-end tests",
  },
  {
    name: "axe-core",
    licenses: ["MPL-2.0"],
    reason: "the rules behind @axe-core/playwright",
  },
  {
    name: "lightningcss*",
    licenses: ["MPL-2.0"],
    reason: "Vite minifies styles with it; its own code does not end up in them",
  },
  {
    name: "@img/sharp-*",
    licenses: ["LGPL-3.0-or-later"],
    reason: "libvips, which the local Workers runtime brings along for images",
  },
  {
    name: "graceful-fs",
    licenses: ["BlueOak-1.0.0"],
    reason: "dependency-cruiser resolves imports with it",
  },
  {
    name: "lru-cache",
    licenses: ["BlueOak-1.0.0"],
    reason: "a cache inside the test browser jsdom",
  },
];
