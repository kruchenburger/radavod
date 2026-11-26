# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A Worker with two Durable Objects, one for the tree and one for sign-in, and `/health`, which reports both.
- A start page in Russian and English, in a light and a dark theme.
- The look of the site, described in `docs/design.md`.
- An invented family of 300 for tests and screenshots.
- The layout of the tree: around a person, as a list for a phone, and the map of all branches.
- The tree of the invented family, read only: around a person, all branches, the card of a person, the same people as a list, and a search by any spelling of a name. An installation opens it with `SAMPLE`.
- Dates as families, archives and GEDCOM write them, in Russian, Belarusian, Polish and English, and names compared across spellings. The search uses the names, no screen the dates yet.
- The rules of kinship: parents, unions, branches and the order of children. No screen uses them yet.
- Places with names and affiliations by period, sources and citations, events with versions of a birth and a death, and warnings about odd dates. No screen uses them yet.
- The database of the tree: every edit in one transaction with one entry of the journal, and steps that bring an older database up to date.
- The history of versions: undoing an edit, looking at any past state and returning to it, starting over, the trash, and erasing a person for ever. No screen uses them yet.
- Adding a relative, editing a person, citing a fact and saying how well it is known, giving a branch, and the snapshot of the tree with what changed since a version. No screen uses them yet; the example is made by the same code.
- The rules of access: roles and what each may do, invitations, recovery links, passkeys, a bound device for a reader, sliding sessions, and a keeper who can always sign in. They are kept in the object of sign-in with a sign-in log and limits of tries; nothing serves them over HTTP yet.
- Signing in over HTTP: setting a family up with a code, invitations and recovery links, passkeys, a bound device for a reader, sessions in a cookie, and the routes of members, each admitting the roles of the table. No screen uses them yet.
- The screens of signing in: the first run, an invitation with a passkey or a linked browser, a recovery link, sign-in, the members of the family with invitations and the sign-in log, and one's own account.
- The import of a family table: a keeper chooses a CSV file, sees everybody it adds, the unions, parents, births, deaths and sources, and every problem with its row, then adds it all to a tree without people as one entry of the edit history.
- Guards for the architecture, the texts, licenses and a real family's data. The last one reads every commit of a pull request and, with the hook turned on, every commit before a push.
- Checks on every pull request: browser tests, accessibility, secrets and known vulnerabilities.

### Changed

- The language is chosen with RU and EN, the same in either language. A first visit takes the first language of the browser that the site speaks; Belarusian and Ukrainian get Russian, anything else English. The theme follows the browser too until the visitor picks one.
- The view around a person is called the pedigree.
- A middle dot separates the years, a note and the branch under a name, so a date written in words no longer runs into the text after it.
- The list of everybody is now the branches page by page: every branch an outline of its families in plain lists, the pages side by side in the order the direct line goes through them, and the direct line drawn between them. On a phone a page fills the screen.
- All branches are one wide canvas: every branch a page, side by side, the generations in rows across all of them, the direct line drawn between them. It opens on a person with names as large as in the tree, and a strip of the whole family over it shows where the window is and moves it. The map with its three levels is gone, and so is its wait: the canvas is laid out at once. Its old addresses open the canvas on the same person.
- All branches have a second way: the fan of ancestors of a person or a couple, every branch a spoke of its colour. It opens on the couple where the branches meet; the centre can be chosen above it, and the pedigree leads to the fan of its person. The keys walk it, and a phone shows a quarter.

### Fixed

- The site has an icon, and `/favicon.ico` no longer returns 404.
- A union whose partners stand apart no longer draws a line that runs into the braces between them; each partner names the other instead. The invented family no longer marries anybody to a parent of a partner.
- The arrow keys work as soon as the tree opens: the person in the centre takes the focus.
