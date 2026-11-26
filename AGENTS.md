# Radavod

A private family tree site that a family runs on its own Cloudflare account. This guide is for coding agents and contributors.

## Stack

TypeScript in strict mode, pnpm, Hono on Cloudflare Workers, two SQLite Durable Objects, Vitest in the Workers runtime, oxlint, dependency-cruiser. The browser app in `web` is React and Mantine, built by Vite. Node 26 or newer runs the tools.

`src/worker` serves `/health`, `/config` and `/api/*`, and the app at the addresses of the example (`src/shared/sample-path.ts`). `FamilyTree` holds the tree, `FamilyAccess` holds members and sign-in. Every `/api/*` route answers 401 unless a session allows it.

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
pnpm guard:licenses
pnpm format
pnpm build                             # the browser app and the sample, into dist/client
pnpm test:e2e                          # the built app in a browser, over local workerd
pnpm bench                             # times of the tree layout
git config core.hooksPath .githooks    # checks every commit before a push
```

## Architecture

Seven bounded contexts in `src/contexts`. `.agents/skills/ddd-steward/SKILL.md` says what each one owns, which may import which, and how to write the DDD verdict. Read it before you change `src/` or `web/`.

`pnpm guard:ddd` fails on a forbidden import, an import dependency-cruiser cannot see, a module outside its place, a table without an owner, and a scan that missed a file. There are no exceptions. `guards/ddd/fixtures` holds one case per folder, most of them broken on purpose; do not fix them.

dependency-cruiser parses with swc, because TypeScript 7 has no compiler API.

## Dates and names

`src/kernel` holds the values every context means the same thing by. It imports nothing and knows no clock and no locale. `parseFuzzyDate` reads a whole text or nothing and says above itself what it does not read: a new way to write a date is a line in `test/kernel/fuzzy-date.test.ts`, with the texts it must not read. `foldName` compares names by the table above it: a new letter comes with a pair that must meet and a pair that must not.

## Storage

A scenario runs in `unitOfWork.run` (`src/scenarios/unit-of-work.ts`): one transaction, one journal entry, everything written at the end. Scenarios do not nest. The version of an aggregate is the number of the entry that changed it last, so it never comes back. Fields that follow from other aggregates (`children`, `unions`, `takesPart`) make no version and no patch; who is in a branch lies with the branch. An entry is found by its aggregates and by every person its patches name, but for those who went from one branch to another, who are found under the branches.

Each context has its tables and its adapter, which parses every row by a strict schema, `src/shared/rows.ts` reads and writes the rows, and `src/shared/values.ts` has the schemas of the kernel. A change of the tables is a new step in `src/worker/schema.ts`; a step that is out is never edited, and the tables and the rows of `test/storage/schema-1.ts` are frozen. A new field in the JSON of a row is read with a default and needs no step. `test/budgets.test.ts` counts rows over 5 000 invented people.

Scenarios take inputs by the strict schemas of `src/shared/scenarios.ts`. A fact of one source or a confirmed one needs a citation, and is a hypothesis again when its last citation goes: that rule lives in `src/scenarios/certainty.ts`, the certainty itself with the context of the fact. A fact of an event is made by `factOf` of `life`.

## Snapshot

`src/shared/snapshot.ts` makes the snapshot (`treeSnapshotSchema` of `src/shared/tree.ts`) from what was written in each aggregate: of the last version on the server, of a past one in the browser, of the invented family in the build. `FamilyTree` keeps it packed in `history_snapshot`, makes it again by an alarm after edits or when it is opened behind the tree, and an erasure throws it away. `changesSince` names what the snapshot shows of what changed after a version, or answers "reload" in another epoch and after an erasure.

## History

The journal is never thinned, and any version can be rebuilt from it: `src/shared/reverse.ts` takes patches back, for the server and the browser. Undo, a return to a version and starting over put authored values back through `putBack` of each context, which works out the mirrors and refuses the impossible. A checkpoint is for speed and may be thrown away. A person in the trash lies in `history_trash` with every link, and a restore runs the ordinary commands, so its preview is the restore itself, not kept.

An erasure is remembered in `FamilyAccess` first, then takes the person out of the tree, the trash and the whole journal in one transaction (`src/scenarios/erase.ts`). In the journal "erased" stands where others were tied to them, in values and in the paths that name a link by them; citations of their links go with them, and after an erasure only `access_erased` holds their identifier. A new table or text that can name a person must be covered by `test/storage/erase.test.ts`, which looks into every raw row of both objects.

## Table import

A keeper imports a family table from a spreadsheet saved as CSV (`/import`). `readTable` of `exchange` (`src/contexts/exchange/domain/table.ts`) says above itself which column means what, reads every row as far as it can and names each problem with its row. `src/scenarios/import-table.ts` writes the table through the commands of the contexts into a tree with nobody in it, the trash included, as one entry, and tells a parent that kinship refuses as a problem of its row instead of refusing the table; the same scenario run as a preview is what the keeper sees first. The session says by `can` whether the member may import. `test/exchange/family-table.csv` is an invented table in that format.

## Access

`src/contexts/access/domain/rights.ts` is the role table of the spec as data, and `can` is the only thing a route asks. The domain knows secrets by their hashes and time by the `now` it is given. Every change of access goes through `keepsAKeeper` in `accessOver`, so no order of operations leaves a set-up family without a keeper who can sign in. A reader may bind one device; an editor and a keeper sign in by passkey. A recovery link revokes the old credentials and sessions of its member at once. `FamilyAccess` keeps it in `access_*` tables (`src/contexts/access/adapters/sqlite-access.ts`) with steps of its own, checks the version a member saw, and cleans what is over by an alarm. The sign-in log keeps a country at most, never an address; tries are counted there too (sign-in and setup 10 in 15 minutes per address hash, invitations 50 a day per keeper). An erased person is untied from members and invitations when the ledger remembers them, and nobody is tied to them again; the name of a member is the account's own and goes when the member deletes it. A name the keeper wrote on a link is the link's until somebody joins by it, and then the member's own: an erasure takes it from the link only. Keys of tries are hashed again with a salt of the family, which lies in the same database: it keeps an address out of a glance at the rows, not out of a copy of them, and tries go within a day. The sign-in log is kept; a keeper reads the newest 500 entries.

Over HTTP, `src/worker/auth.ts` stands ahead of every `/api` route: a changing request must come with `Origin` equal to `ORIGIN`, only the routes that let somebody in are open without a session, and a route admits a role by `can` alone. The routes are in `src/worker/routes`, their requests and answers in `src/shared/access.ts`. Passkeys are checked by `@simplewebauthn/server`; a step of signing in is kept by the hash of its token for five minutes and answered once. The server makes every identifier and secret, keeps only their hashes, and gives the cookie `__Host-session`; the session moves on with each request, the cookie only when `GET /api/session` gives it again, so the app asks it whenever it opens. Tests sign in with a passkey made in code (`test/http/authenticator.ts`), no browser. The screens are in `web/access`: first run (`/setup`), an invitation or a recovery link (`/join#secret`), sign-in, the members and one's own account; `test/e2e/access.spec.ts` goes through them in Chromium with a virtual authenticator.

## Texts

Every text a person reads is in `web/i18n/ru.ts` and `web/i18n/en.ts`, reached through `t`. Words come from `docs/glossary.md`, wording from `.agents/skills/copy-steward/SKILL.md`. Read both before you add or change a text. Errors and API answers carry codes, not sentences.

`pnpm guard:copy` fails on text outside the catalogs, on keys, parameters and plural forms that do not match, on banned phrases and on a file it cannot read. There are no exceptions. A folder in `guards/copy/fixtures/bad` is laid over `clean` and breaks one rule on purpose.

## Look

`docs/design.md` is the design: read it before you build or change a screen. Colors and fonts come from `web/app/tokens.ts`; a color or a font name typed into a style is a mistake. A new color needs its place in `test/web/tokens.test.ts` and in the tables of `docs/design.md`, which a test compares with the tokens.

## Example family

`examples/` holds an invented family of 300. `generateFamily(seed, size)` makes it and `examples/family.json` is its output for seed 1; a test compares them, so change the generator and run `pnpm examples`. Every invented name is in `examples/names.ts`. The app never imports `examples/`, and its types are not the domain model.

`examples/snapshot.ts` turns the family into what a tree keeps, and the snapshot is made of it by the code of a real tree. `pnpm build` writes it with the person to begin with (`examples/start.ts`) and the owner of the direct line to `dist/client/sample/tree.json`, and the app fetches it from there.

## Tree

`src/shared/tree.ts` is the snapshot of the tree that the server sends. `web/tree/layout` turns it into places: `around` and `aroundNarrow` for the view around a person, `branchMap` for the map, following `docs/design.md`. These are pure functions with no DOM, no clock and no texts; they judge nothing and draw what the snapshot says. `web/tree/map-layouter.ts` runs the map in a worker.

`web/sample` holds the screens of the example and `web/sample/places.ts` their addresses: a place, a person and a zoom are in the address, and nothing a person would lose with a link is kept elsewhere. `web/tree/type.ts` measures names in the fonts of the page; lengths of the layout go to styles through `rem`, so the tree grows with the text. `web/tree/map/view.ts` is the math of the map, `paint.ts` its canvas, `map-view.tsx` the links over it.

`test/e2e/frames.spec.ts` prints the frame times of panning the map and fails on none of them.

A layout is tested by `test/web/layout/geometry.ts`, not by snapshots of coordinates: nothing overlaps, no line enters a card, everybody stands once, every link is there. A new rule of drawing becomes a check there and a planted defect in `geometry.test.ts`. A family that is hard to draw goes to `cases.ts`.

## Data guard

`pnpm guard:data` reads every tracked or staged file, with `--commits <range>` every file of every commit, and fails on GEDCOM (by name or content), the backup marker in quotes, SQLite and archives, whatever the file is called. It fails when it scans nothing or cannot read a file, so submodules and Git LFS do not work here. A file in `examples/` must be listed in `guards/data/examples.json`, with the rules it may break.

The guard has no other exception. Its broken examples are built by `guards/data/fixtures.ts` in temporary repositories and are never files here. Code that needs the backup marker spells it in backticks; code, tests and docs that need GEDCOM build it from separate levels and tags, as the fixtures do, or keep it in a listed example. What the guard cannot see is listed above `check` in `guards/data/guard.ts`.

## CI

`check` in `.github/workflows/ci.yml` is the job to require on `main`: it passes only if every other job ran and passed. `guards/ci` keeps it so, and refuses an unpinned action, a write permission it does not list, a secret and an expression inside `run`.

`.githooks/pre-push` runs `guards/push`: the data guard and gitleaks over the commits about to leave the machine.

## Settings

| Variable       | Meaning                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_VERSION`  | Version shown by `/health`, `dev` by default                                                                                                                                             |
| `JURISDICTION` | Where the Durable Objects live: `eu` (default) or `none`. Any other value is refused. Choose before the first run: another value opens new, empty objects and leaves the old data behind |
| `RP_ID`        | The domain passkeys are bound to. Without it and `ORIGIN` nobody signs in                                                                                                                |
| `ORIGIN`       | The address of the site exactly as a browser sends it in `Origin`, as `https://` and the domain                                                                                          |
| `SETUP_CODE`   | A secret, never a variable: lets the first keeper in, and one more keeper each time it is new. Without it setting up is closed                                                           |
| `SAMPLE`       | `on` opens the invented family to anybody, under `/sample`. Anything else is off, and so is the default                                                                                  |

Local workerd has no jurisdictions, so tests run with `none`.

`wrangler.jsonc` holds no account, domain or route. An installation keeps its deployment settings outside this repository.

## Rules

- English in code, comments, commits and the changelog.
- Test first. Tests live in `test/`, guard and example tests next to what they test.
- A real family's data never enters the repository. Examples use invented people.
- Dependencies that ship must be MIT, ISC, BSD, Apache-2.0, 0BSD or CC0-1.0. Fonts, and only fonts, may also be OFL-1.1; the build puts their license texts into `dist/client/licences`. A development tool under another license is listed in `guards/licenses/exceptions.ts`. `src` and `web` import no development dependency.
- pnpm runs no install script of a dependency (`pnpm-workspace.yaml`).
- Workflows pin actions by full commit SHA, read only, and use no secrets.
- Conventional Commits with the work item, as in `feat: add unions (RAD-12)`.
