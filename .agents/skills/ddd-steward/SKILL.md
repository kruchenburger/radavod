---
name: ddd-steward
description: The domain-design steward of Radavod. Use when planning a feature, when deciding where a rule, a table or a module lives, when reviewing a diff that touches src/ or web/, and when writing the DDD verdict of a pull request.
---

# DDD steward

The steward answers two questions about every change: which context owns this, and where does the rule live. `pnpm guard:ddd` checks imports and table names; the steward checks what a machine cannot.

## Contexts

| Context    | Owns                                         | Main rules                                                                                                                       | May import                                         |
| ---------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `kinship`  | Person, sex, names, parentage, union, branch | No cycle through blood or adoptive parentage, versions included. At most two main blood parents, any others are kept as versions | nothing                                            |
| `life`     | Events, participants, occupations, notes     | An event has a kind, a date, a place and participants with roles. Birth and death may have several versions, one of them main    | `kinship`, `places`                                |
| `places`   | Place, its names, historical affiliation     | A name and an affiliation have a period. Coordinates are optional                                                                | nothing                                            |
| `evidence` | Source and the citations of facts            | A fact is known by its identifier only. A relative's story is a source too                                                       | nothing                                            |
| `access`   | Member, role, invitation, passkey, session   | The last keeper cannot be lowered, revoked or deleted. An invitation works once                                                  | nothing                                            |
| `history`  | Edit journal, trash                          | An edit has an author, a time, a before and an after                                                                             | nothing                                            |
| `exchange` | GEDCOM import and export, the full copy      | Import shows what will change before it changes it                                                                               | `kinship`, `life`, `places`, `evidence`, `history` |

A union (who, with whom, of what kind) belongs to `kinship`. A wedding or a divorce, with its date and place, belongs to `life` and refers to the union.

`access` lives in its own Durable Object, so rolling the tree back never revives a revoked sign-in or role. Every other context lives in `FamilyTree`.

## Layers

```
src/kernel/                identifiers, Result with the common refusals, the write of a change, FuzzyDate, NameForm, certainty, language and script; nothing else
src/contexts/<name>/
  domain/                  rules; imports its own files and src/kernel only
  application/             use cases and ports; knows no adapters
  adapters/                SQLite, HTTP
  index.ts                 the only file importable from outside, never from inside
src/scenarios/             use cases that span contexts, through their index.ts
src/shared/                request and response schemas used by the Worker and the browser, the
                           schemas of the kernel, and rows as adapters keep them; imports no
                           context
src/worker/                Worker entry, routes, the two Durable Objects
web/                       the browser app; never reaches adapters
test/                      tests, outside src, so the guard needs no exceptions
```

## Rules

1. **One home per rule.** A rule lives in one aggregate, policy or service of its context. HTTP handlers, scenarios and the interface call it; they do not repeat it. The same check written in two places is a finding, and so is a rule written inside a route, a scenario or a component.
2. **Parity.** A form, route or scenario that does the same job as an existing one reuses the same service, hook or component, so validation, permission checks, focus, keyboard handling and error texts come along. A copy that re-implements them is a finding.
3. **One owner per table.** A table is named `<context>_<what>` and is read and written by that context alone. Other contexts ask through `index.ts`. Build no table name at run time.
4. **One transaction, one journal entry.** A scenario that touches several contexts runs in one transaction and writes one journal entry.
5. **Refuse only the impossible.** A cycle or a third main blood parent is refused. A strange but possible date is kept with a warning.
6. **The kernel does not grow by convenience.** A value goes there only when two contexts mean the same thing by it.
7. **No new exception.** Fix the design before the guard. A change to `.dependency-cruiser.cjs`, `guards/ddd/` or the table above names its reason in the pull request.

## Deciding where code goes

1. Name the fact or the rule in one sentence.
2. Find the context that owns the noun in that sentence. Two contexts means a scenario.
3. Put the rule in `domain/`, the order of steps in `application/`, the technology in `adapters/`.
4. If no context fits, stop and ask the maintainers. Do not create a context or a folder quietly.

## Verdict for a pull request

Put this under `DDD verdict` in the pull request. A change without domain logic says so in one line and names the contexts it prepares.

```
Contexts: <touched contexts>
Homes:
- <rule> -> <file>
Findings:
- <file>: <what is wrong> -> <target file or folder>
Verdict: <pass | fix first>
```

A finding names the file and the place the code must move to. No findings is a valid result.
