# Design

How Radavod looks and behaves. The values live in `web/app/tokens.ts` and `web/app/theme.ts`; `test/web/tokens.test.ts` keeps the contrast. Words come from `docs/glossary.md` and the catalogs, so this file describes texts and does not set them.

## Idea

The site is set like a book about a family. A person is a line of type, not a card. Curly braces carry kinship, the ink of a surname carries the branch, and one dark line runs through the direct ancestors. Every branch has a page of its own, and all pages together are the map. Nothing decorates: a line on the screen always means something.

## Colors

Use the token, never the value. In styles a token is a variable: `paper` is `--paper`, `onAction` is `--on-action`.

| Token      | Light     | Dark      | For                                                                          |
| ---------- | --------- | --------- | ---------------------------------------------------------------------------- |
| `paper`    | `#faf8f1` | `#201b16` | The page                                                                     |
| `surface`  | `#f2eee3` | `#29231c` | The strip of the chosen person, a page of the map, the span of a life, menus |
| `hover`    | `#e9e4d6` | `#302c25` | Under the pointer                                                            |
| `ink`      | `#211d18` | `#ece5d8` | Text, the direct line, caps of the years strip                               |
| `muted`    | `#615a4e` | `#aca293` | Years, captions, references                                                  |
| `action`   | `#2c5a48` | `#9fcab2` | Buttons, links, the focus ring, the line of today                            |
| `onAction` | `#fdfcf8` | `#14231b` | Text on a filled button                                                      |
| `warning`  | `#8f3a20` | `#e8a98a` | Contradiction, unresolved, a refusal                                         |
| `rule`     | `#8a8172` | `#80776a` | Lines that mean something: kinship, a couple's join, the border of an input  |
| `edge`     | `#cdc5b5` | `#403a31` | Lines that only divide. Never the only sign of anything                      |
| `noBranch` | `#696156` | `#a0978a` | The surname of a person without a branch                                     |

Text is at least 4.5:1 on every background it stands on, meaningful lines at least 3:1. Light theme is the default. The dark theme is warm, never blue.

### Branch inks

Twelve inks, numbered the same way in both themes, so a branch keeps its number when the theme changes. In styles: `--branch-1` to `--branch-12`. Contrast is against `paper` and `surface`.

| No. | Light     | Paper | Surface | Dark      | Paper | Surface |
| --- | --------- | ----- | ------- | --------- | ----- | ------- |
| 1   | `#8f3f33` | 6.75  | 6.19    | `#ecaea3` | 9.07  | 8.25    |
| 2   | `#7f6247` | 5.28  | 4.84    | `#ae8663` | 5.20  | 4.73    |
| 3   | `#634b00` | 7.79  | 7.14    | `#ccad61` | 7.90  | 7.19    |
| 4   | `#885a00` | 5.63  | 5.16    | `#ba985b` | 6.29  | 5.72    |
| 5   | `#455d3e` | 6.84  | 6.27    | `#8ba981` | 6.58  | 5.99    |
| 6   | `#4a7361` | 5.05  | 4.63    | `#679782` | 5.14  | 4.68    |
| 7   | `#216761` | 6.22  | 5.70    | `#4eb0a6` | 6.57  | 5.98    |
| 8   | `#335266` | 7.78  | 7.13    | `#78c1ef` | 8.68  | 7.90    |
| 9   | `#3d69b0` | 5.14  | 4.71    | `#7fa9eb` | 7.14  | 6.49    |
| 10  | `#573e8b` | 8.01  | 7.34    | `#9a8cc4` | 5.63  | 5.12    |
| 11  | `#925494` | 5.04  | 4.62    | `#c993cb` | 6.93  | 6.30    |
| 12  | `#89417e` | 6.33  | 5.80    | `#dab3d2` | 9.24  | 8.41    |

Distance of the closest pair, OKLab times 100: 5.4 light and 5.7 dark for ordinary vision, 4.1 and 4.1 protan, 4.1 and 4.9 deutan, 3.8 and 4.3 tritan. No ink is closer than 19 to the text ink in the light theme and 11 in the dark one, so a surname in small type never passes for plain text.

- These inks can be told apart side by side, not from memory. **The name of the branch stands with every person**, except inside that branch's own page of the map.
- On a surname, a branch name, a head of a page, a bar of the strip. Never as a background.
- New branches take the inks in the order 6, 1, 9, 3, 11, 7, 2, 5, 8, 10, 4, 12.
- From the thirteenth branch on the inks repeat and the head of the page gets a double rule (5 px, `double`). Pages side by side never share an ink.

## Type

Alegreya (variable, upright and italic) for names, headings, dates of events, quotations and references. Alegreya Sans (400 and 500) for the interface, years, captions. Both are served from the installation, cover Russian, Belarusian, Polish, Lithuanian and the old Russian spelling, and ship with their OFL-1.1 text. Figures are old-style, as the fonts have them.

| Role                          | Size, px     | Line height | Face                            |
| ----------------------------- | ------------ | ----------- | ------------------------------- |
| Name of the site, start page  | 72, phone 54 | 1.05        | Alegreya 700                    |
| Name on the person card       | 46, phone 32 | 1.1         | Alegreya 700                    |
| The chosen person in the tree | 37, phone 30 | 1.02        | Alegreya 700                    |
| ... with a double surname     | 30           | 1.02        | Alegreya 700                    |
| Head of a map page            | 17, 24, 30   | 1           | Alegreya 700: far, closer, near |
| Section heading               | 22           | 1.2         | Alegreya italic 400             |
| Event                         | 20           | 1.25        | Alegreya 600                    |
| Person in the tree            | 17           | 1.2         | Alegreya 400, direct line 700   |
| Person on the map             | 15.5, 19     | 19, 23 px   | Alegreya 400, direct line 700   |
| Text of the interface         | 16           | 1.45        | Alegreya Sans 400, stressed 500 |
| Years and branch under a name | 14 to 15     | 1.25        | Alegreya Sans 400, branch 500   |

Nothing a person must read is below 14 px. Headings of rows ("Parents", "Children") are italic, in `muted`, sentence case. No capitals for labels, no letter-spacing except the site name (-0.015em).

## Space and shape

Spacing steps: 4, 8, 12, 20, 32 px (`xs` to `xl`). Page margin 28 px on the desktop, 16 px on the phone. Corners are 3 px on controls and square everywhere else; only the round "+" is round. No shadows, no gradients. A target is at least 44 by 44 px on the phone and 24 px on the desktop.

Widths: the phone is below 720 px (`sm`), the spread needs 1400 px (`lg`). Between them the spread shows one half at a time, ancestors or descendants, with the strip of the chosen person.

## Screen frame

A single row: the name of the family in Alegreya italic, the two views as words underlined when current, then search, language and theme. On the phone the views take a second row. Under the tree a running foot lists the branches in their inks with the number of people; the branch of the chosen person is underlined; the foot opens the map.

## The tree around a person

```
 great-grand-    grand-       parents    | the strip |   children      grand-        great-
 parents         parents                 |           |                 children      grandchildren

 Given Surname  ╮
 1822–1891 br.  ├ Given Surname ╮        |           |  ╭ Given Surname ╶ Given Surname
 Given Surname  ╯               │        |           |  │ ⚭ Given Surname
                                ├ Given  |  Given    |  │
 Given Surname  ╮               │ Surname|  Surname  |──┼ Given Surname ╶╮
 Given Surname  ├ Given Surname ╯        ┿  years    |  │               ├ Given Surname
                ╯                        |  branch   |  ╎               ╰ Given Surname
                                         |  siblings |  ╰ Given Surname   (dashes: adopted)
                                         |  ⚭ spouse |
```

- Columns: an entry is 152 px wide, a gap of 34 px holds the brace; the strip is 236 px on `surface`, full height.
- An entry is the given name in `ink` and the surname in its branch ink, then years and the branch. A spouse is a second entry under the first with ⚭ before it.
- Couples stand on the left of a brace, their child at its tip. On the right the tip is at the couple and every child has an arm.
- Lines: `rule` 1.1 px; adoption and guardianship 1.8 px dashed 5 4; the direct line `ink` 2.6 px, and the names on it are 700. The arm to a child on the line is dark, its neighbours stay thin. If the centre is not on the direct line, there is no dark line on the screen.
- Brace: `web/app/brace.ts`, corners of 11 px, less when the arms are short.
- **Pressing a name** puts the person in the centre, pressing the centre opens the card. The "+" beside the chosen person adds a parent, a spouse or a child.
- **Unknown parent**: a place in italic `muted` with a "+". If both are unknown, one place for the two.
- **Repeated ancestor**: the couple is set once, at the first place. At the second a reference says that these are the same parents and gives their given names, and a line runs along the left margin to the couple. On the phone the line runs along the right margin.
- **Several unions**: all spouses stand in the strip, in order of time. Up to two, every union is open. From three on one is open, the rest show the children as one line each with the number of descendants. Every union has a vertical lane of its own, 6 px apart, so children are never ambiguous.
- **Siblings** are a word with a number in the strip. Unfolded, the older ones stand above the person and the younger below, joined by a thin line; spouses and children of siblings stay folded.
- **Long names**: columns never widen. A name breaks between given name and surname, a double surname after the hyphen; the entry grows down.
- **No name**: the words for it in italic. **No years**: the words for it in place of the years. A year that is not known is "?", an approximate one has "about", "before" or "after" before it. Living people have no second year.
- Children stand in order of birth; without a year, last.

### Phone

The same entries as an indented outline, ancestors above and descendants below. One step of indent is 19 px. The years and the branch stand at the right end of the line and drop to a second line when they do not fit. The page opens with the chosen person in the middle. The map opens as a sheet over the tree.

```
      ┌ Given Surname          1822–1891  Branch
      ├ Given Surname          1828–1899  Branch
    ┌ Given Surname            1851–1918  Branch
  ┌ Given Surname              1880–1949  Branch
  ├ Given Surname              1884–1961  Branch
  Given Surname   (the chosen person, on surface, "+")
  ⚭ Given Surname              1904–1943  Branch
  ├ Given Surname              1931–2004  Branch
  │ ⚭ Given Surname            1934–2011  Branch
  │ └ Given Surname            1961–      Branch
```

## The map of all branches

One page per branch: `surface`, a head with the name of the branch in its ink and the number of people, a 2 px rule in the same ink under the head. Five pages in a row for ten branches, eight for twenty-four; on the phone two and three.

```
 Branch 20                       Branch 23
 ═══════════════════════════     ═══════════════════════════
        │Given Surname                  │Given Surname
        │⚭ Given Surname                │⚭ Given Surname
     ╭───────┴───────╮           ╔══════════╪═══ gutter ════
  ╶Given Surname │Given Surname  ║   │Given Surname
  ╶Given Surname │⚭ Given Surname║   ╚⚭ Given Surname
  Given, see Branch ═════════════╝
```

- Rows are generations, aligned inside a page. A couple is two lines joined by a thin vertical. Brothers and sisters without a union and children stand as a column; the order of birth stays. This keeps the far view between 2:1 and 2.5:1 for ten and twenty-four branches.
- A person is shown once, on the page of the couple: the husband's branch, or the branch the couple was given. In the birth family stands a reference in italic: the given name and the branch to look in. On the other page a couple whose parents are elsewhere has the same kind of reference above it.
- **Between pages only the direct line is drawn.** It leaves through the gap under its row, runs in the gutters, and enters through the gap above the row of the child. It never crosses a person. Lines in one gutter keep 6 to 8 px apart.
- Far: every person is a bar as long as the name, in the branch ink, `noBranch` at half strength, a reference is a hollow bar. Names of the pages do not shrink with the drawing. Closer: names. Near: names, years, and the branch when it differs from the page.
- The chosen person is set in `paper` on `ink`.
- Pressing a page in the far view moves closer to it. The place on the map is in the address.

### Keyboard and reading aloud

The drawing is one group with a name, a description of the keys under it, and real links inside: pages in the far view, people in the others.

| Key         | Far                           | Closer and near                                                                    |
| ----------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| Left, right | Page before, after            | Along brothers, sisters and their spouses; the row stays while one walks it        |
| Up          | Page above                    | A parent                                                                           |
| Down        | Page below                    | Back to the child one came from, else the child on the direct line, else the first |
| Enter       | Closer, centred on the branch | Opens the person                                                                   |
| Esc         |                               | One step out                                                                       |

Focus moves the view with it. Beside the tree and the map a link opens **the same people as a list**: parents, siblings, unions and children of the chosen person, then every branch by generation, in plain headings and lists. The list is complete, so a screen reader never needs the drawing.

## The person card

From top to bottom: back to the tree, the name with the surname in its ink, years, name at birth, branch, the direct line; the actions on the right. Then the strip of years over the full width. Then three columns: life (date, event, place), sources in the margin beside their event, names and siblings. Below 1400 px the side column goes under the life. On the phone everything is one column, the source under its event with a 2 px rule on the left.

**Certainty** has a shape and a word, never colour alone: confirmed is a full disc, one source a half disc, hypothesis a dashed ring, contradiction two facing halves, unresolved a ring with a bar. Contradiction and unresolved are in `warning`, with the margin rule in the same colour.

### The strip of years

The person first, 9 px high, with the span of the life as `surface` down through all rows; then parents, unions and children, 4.5 px high, in branch inks, names above the bars. Years of the events are dots on the person's bar.

| What is known        | How it is drawn                                            |
| -------------------- | ---------------------------------------------------------- |
| A year               | The bar ends with a cap in `ink`                           |
| About a year         | Three years of dashes before the bar, no cap               |
| Two sources disagree | Dashes between the two years, no cap, "?" after the year   |
| One end unknown      | The bar stops at the last known event with "?", no cap     |
| Living               | The bar runs to the line of today, no cap                  |
| Nothing              | No bar, the words for it at the start of the person's life |
| Before the scale     | An arrow on the edge                                       |

Under the strip a legend explains the cap, the dashes and the "?". Adoption is a dot on the child's bar.

## Other screens

- **Start, sign-in, invitation**: two halves. Left, on `surface`, the blank pedigree: lines without names, braces, the direct line. Right, the words and one filled button. Nothing about the family is shown before a sign-in except what the invitation itself says.
- **Empty family**: the blank pedigree without a fill, then two ways: the first person (a name, or the mark that it is unknown) and a file.
- **Example**: where the installation allows it, the start page opens an invented family. A row above the header carries the mark in an outlined label, one sentence and a link to leave. The row is on every screen of the example; in the sheet of the map on the phone the mark stands beside the heading.

## States

- Focus: 2 px `action` outline, 2 px away, 3 px on the map. Never removed, never clipped.
- Hover: `hover` under a control, an underline for a name.
- Filled button for the one main action of a screen, outlined for the rest. Disabled is `muted` text and a sentence that says why.
- Loading keeps the last picture and says so in words. An error stands where the content would be, with the reason and the way out.
- Choice among a few words (language, theme, zoom): words on a line, the chosen one 500 with a 2 px underline.

## Motion

- Changing the centre moves the names to their new places in 240 ms, `ease-out`, by `transform` only; new lines fade in over 120 ms after that. A new press interrupts the movement from where it is.
- Zooming with a button takes 200 ms. Dragging and pinching follow the finger and do not fire a press.
- Nothing moves on its own: no entrance, no loop, no parallax.
- With `prefers-reduced-motion` everything changes at once.

## Forbidden

- Coats of arms, parchment, vignettes, fake ageing, ornament, portraits made up for people without a photograph.
- Cards with borders or shadows around people, coloured fills for branches, colour as the only sign of anything.
- A line over a person, a person twice on one screen, a guessed year drawn as a known one.
- Fonts, pictures or scripts from another site.
- Text in an image or a drawing that the catalogs do not know.
