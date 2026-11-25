// Run through guards/ddd (`pnpm guard:ddd`), which also fails when a module escapes the scan.

/** Which contexts each context may import. */
const contexts = require("./guards/ddd/contexts.json");

const rule = (name, comment, from, to) => ({ name, comment, severity: "error", from, to });
const anyOf = (names) => `(?:${names.join("|")})`;

module.exports = {
  forbidden: [
    rule(
      "only-index-is-public",
      "Outside its own folder a context is importable only through index.ts.",
      { path: "^src/contexts/([^/]+)/" },
      { path: "^src/contexts/[^/]+/(?!index[.]ts$)", pathNot: "^src/contexts/$1/" },
    ),
    rule(
      "only-index-is-public",
      "Outside its own folder a context is importable only through index.ts.",
      { pathNot: "^src/contexts/" },
      { path: "^src/contexts/[^/]+/(?!index[.]ts$)" },
    ),
    ...Object.entries(contexts).map(([context, allowed]) =>
      rule(
        "context-direction",
        `${context} may import ${allowed.join(", ") || "no other context"}.`,
        { path: `^src/contexts/${context}/` },
        { path: "^src/contexts/", pathNot: `^src/contexts/${anyOf([context, ...allowed])}/` },
      ),
    ),
    rule(
      "domain-is-pure",
      "domain imports only its own files and src/kernel.",
      { path: "^src/contexts/([^/]+)/domain/" },
      { pathNot: ["^src/contexts/$1/domain/", "^src/kernel/"] },
    ),
    rule(
      "application-knows-no-adapters",
      "application declares ports; adapters implement them.",
      { path: "^src/contexts/[^/]+/application/" },
      { path: "^src/contexts/[^/]+/adapters/" },
    ),
    rule(
      "kernel-is-a-leaf",
      "The shared kernel imports nothing but itself.",
      { path: "^src/kernel/" },
      { pathNot: "^src/kernel/" },
    ),
    rule(
      "index-is-for-outsiders",
      "Inside a context, import the file itself: index.ts also leads to the adapters.",
      { path: "^src/contexts/([^/]+)/" },
      { path: "^src/contexts/$1/index.ts$" },
    ),
    rule(
      "inner-knows-no-outer",
      "Contexts do not know who calls them.",
      { path: "^src/contexts/" },
      { path: "^src/(?:scenarios|worker)/" },
    ),
    rule(
      "inner-knows-no-outer",
      "Contexts may import shared schemas, so shared schemas may not lead to another context.",
      { path: "^src/shared/" },
      { path: "^src/(?:contexts|scenarios|worker)/" },
    ),
    rule(
      "inner-knows-no-outer",
      "Scenarios do not know who calls them.",
      { path: "^src/scenarios/" },
      { path: "^src/worker/" },
    ),
    rule(
      "server-knows-no-web",
      "Nothing in src imports the browser app.",
      { path: "^src/" },
      { path: "^web/" },
    ),
    rule(
      "web-knows-no-server",
      "The browser app talks to the Worker over HTTP.",
      { path: "^web/" },
      { path: "^src/(?:scenarios|worker)/" },
    ),
    rule(
      "web-reaches-no-adapters",
      "Adapters never end up in the browser bundle, not even through index.ts.",
      { path: "^web/" },
      { path: "^src/contexts/[^/]+/adapters/", reachable: true },
    ),
    rule(
      "stays-in-src-and-web",
      "No rule judges a module outside src and web, so nothing there may be imported.",
      { path: "^(?:src|web)/" },
      {
        pathNot: ["^(?:src|web)/", "(?:^|/)node_modules/"],
        dependencyTypesNot: ["core"],
        couldNotResolve: false,
      },
    ),
    rule(
      "every-import-resolves",
      "A rule cannot judge an import it cannot resolve.",
      {},
      { couldNotResolve: true },
    ),
  ],
  options: {
    // TypeScript 7 has no compiler API, so dependency-cruiser cannot parse with it.
    parser: "swc",
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    builtInModules: { add: ["cloudflare:workers"] },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["workerd", "browser", "import", "types", "default"],
    },
  },
};
