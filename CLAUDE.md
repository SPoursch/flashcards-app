# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A flashcard app that runs entirely in the browser with no server and no dependencies.
You create cards with a question on the front and an answer on the back, then study a
deck one card at a time: read the question, flip the card, and mark whether you got it
right. Cards and progress are saved in the browser, so they are still there after a
reload.

## Technology stack

- **HTML** — one page, `index.html`.
- **CSS** — hand-written, `styles.css`. No preprocessor, no utility framework.
- **JavaScript** — plain (vanilla) JS, `app.js`. No framework, no libraries.
- **localStorage** — the only place data is stored. There is no database and no backend.
- **No build step** — the files that are edited are the files the browser loads.

## Commands

There is no package manager, no build, no lint, and no test suite in this project.

- **Run:** open `index.html` directly in a browser (`file://` — no local server needed).
- **Verify a change:** reload the page; use DevTools -> Application -> Local Storage to
  inspect or clear saved cards.
- **Deploy:** push the folder to GitHub and enable GitHub Pages. Because there is no
  build step, the deployed site is exactly these files — nothing to compile first.

Do not add `package.json`, a bundler, or a task runner. If a change seems to require one,
stop and ask rather than introducing it.

## Prohibition

No frameworks or libraries — no React, Vue, Svelte, Angular, jQuery, or any other. No CDN
`<script>` tags and no npm packages. Everything is hand-written vanilla JavaScript.

## Conventions

1. **Three separate files.** `index.html`, `styles.css`, `app.js`. No inline `<style>` or
   `<script>` blocks, and no inline handlers (`onclick="..."`) in the HTML — attach every
   listener from `app.js`.

2. **Each card is an individual item.** One card = one object in the `cards` array,
   addressed by its own stable `id`. Deleting or editing one card must never disturb
   another's data.

3. **All persistence goes through two functions.** `app.js` exposes `loadState()` and
   `saveState(state)`; these are the only places `localStorage` is touched. Everything
   else changes the in-memory state object and then calls `saveState()`.

4. **Render from state, not from the DOM.** The state object is the single source of
   truth. Change it, save it, then re-render. Never read a card's text or flipped/answered
   status back out of an element to decide what is true.

## Storage shape

Single key: `flashcards/v1`, holding one JSON object.

```js
{
  version: 1,
  cards: [
    {
      id: "c_1756180800000",   // stable, generated once at creation
      front: "Capital of France?",
      back: "Paris",
      correct: 0,              // times answered right
      wrong: 0                 // times answered wrong
    }
  ],
  session: null,               // or the study round in progress:
                               // { order: [id, ...], index, revealed, correct, wrong }
  theme: null                  // null = follow the browser, or "light" / "dark"
}
```

Saving the `session` is what lets a reload drop the user back on the same card with
the same score. Saving `theme` is what makes the light/dark choice stick.

The search box is the one piece of state that is deliberately *not* saved: it filters
the list on screen only, so a reload always shows the whole deck rather than a
mysteriously filtered one. It lives in the `searchText` variable in `app.js`.

## Export file shape

Export writes a JSON file named `flashcards-YYYY-MM-DD.json` (local date parts, per the
date rule below) holding the cards and nothing else:

```js
{
  version: 1,
  exportedAt: "2026-08-31T12:00:00.000Z",  // a moment in time, not a day key
  cards: [ /* same card objects as above */ ]
}
```

The light/dark choice and any half-finished study round are left out on purpose: they
describe this browser, not the deck.

Anything questionable is refused before the data is touched: non-JSON text, a `version`
that is not 1, a missing `cards` array, or a file whose entries are all unusable.
Individual malformed entries inside an otherwise good file are skipped and reported.
`readCards()` is shared with `loadState()` so "a valid card" is defined once.

## The card picker

Both Export and Import go through one `<dialog id="picker">`, driven by the `picker`
variable in `app.js`. Like `searchText` it is view state and is never saved — a dialog
that happens to be open has nothing to do with the stored deck.

- **Export** ticks every card by default and writes only the ticked ones.
- **Import** offers two choices. *All cards* replaces the whole deck (`applyReplaceAll`)
  and is the only path that deletes anything. *Choose cards* (the default) merges the
  ticked cards by `id` (`applyMerge`): a card replaces the one it matches and is otherwise
  added, so nothing the user already had is lost. Each row says which of the two it will
  do, so the destructive option is never the silent one.

Reading a file never changes the deck: `importFromFile()` validates and then opens the
picker, and only `confirmPicker()` writes.

## Derived numbers

Nothing is stored that can be worked out from the cards themselves. The deck stats are
counted at render time from `correct` and `wrong`: a card is **learned** once
`correct > wrong`, and every other card — including a new one with no answers yet — is
still being learned. If that rule ever changes, change `isLearned()` in `app.js` and the
note shown under the stats together, so the screen never explains a rule it is not using.

`loadState()` must tolerate a missing key, malformed JSON, and an unknown `version`, and
fall back to a valid empty state rather than throwing. A broken localStorage value must
never leave the user with a blank page.

## Two constraints that follow from "no build step"

- **Use `<script defer src="app.js"></script>`, not `type="module"`.** Opened over
  `file://`, ES module imports are blocked by CORS and the app will silently fail to
  start. All code therefore lives in one classic script.
- **Use relative paths only** (`styles.css`, not `/styles.css`). A leading slash breaks
  on GitHub Pages, where the site is served from a subfolder.

## Rendering note

Card text is typed by the user, so insert it with `textContent`, never `innerHTML`. A
question containing `<` or `&` then renders literally instead of breaking the card.
