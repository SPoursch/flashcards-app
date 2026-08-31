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
  ]
}
```

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
