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
- Guards for the architecture, the texts, licenses and a real family's data. The last one reads every commit of a pull request and, with the hook turned on, every commit before a push.
- Checks on every pull request: browser tests, accessibility, secrets and known vulnerabilities.
