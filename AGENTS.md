# Radavod

A private family tree site that a family runs on its own Cloudflare account. This guide is for coding agents and contributors.

## Stack

TypeScript in strict mode, pnpm, Hono on Cloudflare Workers, two SQLite Durable Objects, Vitest in the Workers runtime, oxlint, dependency-cruiser. The browser app in `web` is React and Mantine, built by Vite. Node 26 or newer runs the tools.

`src/worker` serves `/health` and `/api/*`. `FamilyTree` holds the tree, `FamilyAccess` holds members and sign-in. Every `/api/*` route answers 401 unless a session allows it.

## Commands

```sh
npm install --global corepack@0.36.0   # Node 26 ships without it
corepack enable pnpm
pnpm install
pnpm vitest run test/health.test.ts    # one file
pnpm test
pnpm typecheck
pnpm lint
pnpm guard:ddd
pnpm guard:data
pnpm examples                          # writes examples/family.json
pnpm guard:copy
pnpm build                             # the browser app, into dist/client
```

## Architecture

Seven bounded contexts in `src/contexts`. `.agents/skills/ddd-steward/SKILL.md` says what each one owns, which may import which, and how to write the DDD verdict. Read it before you change `src/` or `web/`.

`pnpm guard:ddd` fails on a forbidden import, an import dependency-cruiser cannot see, a module outside its place, a table without an owner, and a scan that missed a file. There are no exceptions. `guards/ddd/fixtures` holds one case per folder, most of them broken on purpose; do not fix them.

dependency-cruiser parses with swc, because TypeScript 7 has no compiler API.

## Texts

Every text a person reads is in `web/i18n/ru.ts` and `web/i18n/en.ts`, reached through `t`. Words come from `docs/glossary.md`, wording from `.agents/skills/copy-steward/SKILL.md`. Read both before you add or change a text. Errors and API answers carry codes, not sentences.

`pnpm guard:copy` fails on text outside the catalogs, on keys, parameters and plural forms that do not match, on banned phrases and on a file it cannot read. There are no exceptions. A folder in `guards/copy/fixtures/bad` is laid over `clean` and breaks one rule on purpose.

## Look

`docs/design.md` is the design: read it before you build or change a screen. Colors and fonts come from `web/app/tokens.ts`; a color or a font name typed into a style is a mistake. A new color needs its place in `test/web/tokens.test.ts` and in the tables of `docs/design.md`, which a test compares with the tokens.

## Example family

`examples/` holds an invented family of 300. `generateFamily(seed, size)` makes it and `examples/family.json` is its output for seed 1; a test compares them, so change the generator and run `pnpm examples`. Every invented name is in `examples/names.ts`. The app never imports `examples/`, and its types are not the domain model.

## Data guard

`pnpm guard:data` reads every tracked or staged file and fails on GEDCOM (by name or content), the backup marker in quotes, SQLite and archives, whatever the file is called. It fails when it scans nothing or cannot read a file, so submodules and Git LFS do not work here. A file in `examples/` must be listed in `guards/data/examples.json`, with the rules it may break.

The guard has no other exception. Its broken examples are built by `guards/data/fixtures.ts` in temporary repositories and are never files here. Code that needs the backup marker spells it in backticks; code, tests and docs that need GEDCOM build it from separate levels and tags, as the fixtures do, or keep it in a listed example. What the guard cannot see is listed above `check` in `guards/data/guard.ts`.

## Settings

| Variable       | Meaning                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_VERSION`  | Version shown by `/health`, `dev` by default                                                                                                                                             |
| `JURISDICTION` | Where the Durable Objects live: `eu` (default) or `none`. Any other value is refused. Choose before the first run: another value opens new, empty objects and leaves the old data behind |

Local workerd has no jurisdictions, so tests run with `none`.

`wrangler.jsonc` holds no account, domain or route. An installation keeps its deployment settings outside this repository.

## Rules

- English in code, comments, commits and the changelog.
- Test first. Tests live in `test/`, guard and example tests next to what they test.
- A real family's data never enters the repository. Examples use invented people.
- Dependencies that ship must be MIT, ISC, BSD or Apache-2.0. Fonts, and only fonts, may also be OFL-1.1; the build puts their licence texts into `dist/client/licences`. Development tools may bring other licenses, for example lightningcss (MPL-2.0) and sharp's libvips (LGPL-3.0).
- pnpm runs no install script of a dependency (`pnpm-workspace.yaml`).
- Workflows pin actions by full commit SHA, read only, and use no secrets on pull requests.
- Conventional Commits with the work item, as in `feat: add unions (RAD-12)`.
