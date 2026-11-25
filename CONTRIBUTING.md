# Contributing

Radavod is at an early stage, so open an issue before you start a larger change. `AGENTS.md` describes the code, the rules and the commands, for people and for coding agents.

## Never a real family

This repository is public, and what was pushed once can't be taken back: a deleted file stays in the history and in other people's copies. Use invented people everywhere, also in tests, issues, pull requests and screenshots. `examples/` has a family of 300 for that.

## Setup

You need Git and Node 26 or newer.

```sh
npm install --global corepack@0.36.0
corepack enable pnpm
pnpm install
git config core.hooksPath .githooks
```

The last line turns on the check described below. Git never turns on a hook by itself.

## Before you push

The hook reads every commit you are about to push. It refuses the push if a commit holds

- what looks like a family's data: GEDCOM, a backup of an installation, a SQLite database, an archive, a file in `examples/` that is not listed;
- a secret, if you have [gitleaks](https://gitleaks.io) installed. Without it the hook tells you so and goes on.

CI runs the same checks, but after the push, when the data is already public.

If the hook refuses, nothing has been sent.

1. Read which file in which commit it means.
2. Take the file out of that commit. Deleting it in a new commit is not enough. Run `git rebase --interactive <commit>^`, mark the commit with `edit`, then run `git rm <file>`, `git commit --amend` and `git rebase --continue`.
3. If the file is an invented example, put it in `examples/` and list it in `guards/data/examples.json` with the rules it may break.
4. If the hook is wrong, open an issue that describes the file without its content. Don't skip the hook with `--no-verify`: CI refuses the same commits.

If a real family's data has been pushed already, don't open an issue. Report it as [SECURITY.md](SECURITY.md) says.

## Checks

Run what your change touches, for example `pnpm vitest run test/health.test.ts`. CI runs everything on every pull request: formatting, types, tests, the guards, the build, the site in a browser, secrets, known vulnerabilities and licences. `check` passes when all of them do.

`pnpm format` formats the code. To run the browser tests yourself:

```sh
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Pull requests

- Branch from `main` and write commits as [Conventional Commits](https://www.conventionalcommits.org).
- Write the test first.
- Fill in the template. `.agents/skills` explains the two verdicts.
- A new dependency that ships needs a licence from the list in `AGENTS.md`. A development tool under another licence goes to `guards/licences/exceptions.ts` with the reason.
- A text a person reads goes to both catalogs in `web/i18n`.

Your contribution is published under the [MIT license](LICENSE).
