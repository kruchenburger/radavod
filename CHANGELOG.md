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
- The rules of access: roles and what each may do, invitations, recovery links, passkeys, a bound device for a reader, sliding sessions, and a keeper who can always sign in. Nothing stores or serves them yet.
- Guards for the architecture, the texts, licenses and a real family's data. The last one reads every commit of a pull request and, with the hook turned on, every commit before a push.
- Checks on every pull request: browser tests, accessibility, secrets and known vulnerabilities.
