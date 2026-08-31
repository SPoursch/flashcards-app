"use strict";

/* ============================================================
   Flashcards — vanilla JS, no build step.
   State lives in one object; localStorage is touched only by
   loadState() and saveState().
   ============================================================ */

const STORAGE_KEY = "flashcards/v1";

/* ---------- persistence ---------- */

function emptyState() {
  // theme: null means "follow the browser's light/dark setting".
  return { version: 1, cards: [], session: null, theme: null };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();

    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.cards)) return emptyState();

    const cards = readCards(data.cards);

    return {
      version: 1,
      cards,
      session: readSession(data.session, cards),
      theme: readTheme(data.theme)
    };
  } catch (err) {
    // A corrupt value must never leave the user with a blank page.
    console.warn("Saved cards could not be read; starting with an empty deck.", err);
    return emptyState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Cards could not be saved in this browser.", err);
  }
}

function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// Keeps only entries that really are cards, and cleans up their counts. Used for
// both the saved data and imported files, so "a valid card" means one thing only.
function readCards(list) {
  if (!Array.isArray(list)) return [];

  const cards = [];
  for (const card of list) {
    if (!card || typeof card.id !== "string") continue;
    if (typeof card.front !== "string" || typeof card.back !== "string") continue;
    cards.push({
      id: card.id,
      front: card.front,
      back: card.back,
      correct: toCount(card.correct),
      wrong: toCount(card.wrong)
    });
  }
  return cards;
}

// Anything other than the two known choices means "follow the browser".
function readTheme(value) {
  return value === "light" || value === "dark" ? value : null;
}

// A saved session is only usable if its cards still exist.
function readSession(session, cards) {
  if (!session || !Array.isArray(session.order)) return null;

  const known = new Set(cards.map((card) => card.id));
  const order = session.order.filter((id) => typeof id === "string" && known.has(id));
  if (order.length === 0) return null;

  const index = Number.isFinite(session.index)
    ? Math.min(Math.max(Math.floor(session.index), 0), order.length)
    : 0;

  return {
    order,
    index,
    revealed: session.revealed === true && index < order.length,
    correct: toCount(session.correct),
    wrong: toCount(session.wrong)
  };
}

/* ---------- elements ---------- */

const el = {
  themeBtn: document.getElementById("theme-btn"),

  deckView: document.getElementById("deck-view"),
  studyView: document.getElementById("study-view"),
  doneView: document.getElementById("done-view"),

  addForm: document.getElementById("add-form"),
  frontInput: document.getElementById("front-input"),
  backInput: document.getElementById("back-input"),
  formError: document.getElementById("form-error"),

  deckCount: document.getElementById("deck-count"),
  deckEmpty: document.getElementById("deck-empty"),
  searchInput: document.getElementById("search-input"),
  noMatches: document.getElementById("no-matches"),
  deckStats: document.getElementById("deck-stats"),
  statTotal: document.getElementById("stat-total"),
  statLearning: document.getElementById("stat-learning"),
  searchWrap: document.getElementById("search-wrap"),
  backupView: document.getElementById("backup-view"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  importFile: document.getElementById("import-file"),
  backupStatus: document.getElementById("backup-status"),

  picker: document.getElementById("picker"),
  pickerTitle: document.getElementById("picker-title"),
  pickerIntro: document.getElementById("picker-intro"),
  pickerModes: document.getElementById("picker-modes"),
  modeAll: document.getElementById("mode-all"),
  modeAllHint: document.getElementById("mode-all-hint"),
  modeSome: document.getElementById("mode-some"),
  modeSomeHint: document.getElementById("mode-some-hint"),
  pickerAllRow: document.getElementById("picker-all-row"),
  pickerSelectAll: document.getElementById("picker-select-all"),
  pickerList: document.getElementById("picker-list"),
  pickerSummary: document.getElementById("picker-summary"),
  pickerCancel: document.getElementById("picker-cancel"),
  pickerConfirm: document.getElementById("picker-confirm"),
  cardList: document.getElementById("card-list"),
  studyBtn: document.getElementById("study-btn"),

  exitBtn: document.getElementById("exit-btn"),
  position: document.getElementById("study-position"),
  progress: document.getElementById("progress"),
  progressFill: document.getElementById("progress-fill"),
  score: document.getElementById("study-score"),

  flashcard: document.getElementById("flashcard"),
  cardFront: document.getElementById("card-front"),
  cardBack: document.getElementById("card-back"),
  flipHint: document.getElementById("flip-hint"),

  revealBtn: document.getElementById("reveal-btn"),
  gradeActions: document.getElementById("grade-actions"),
  rightBtn: document.getElementById("right-btn"),
  wrongBtn: document.getElementById("wrong-btn"),

  doneScore: document.getElementById("done-score"),
  doneDetail: document.getElementById("done-detail"),
  restartBtn: document.getElementById("restart-btn"),
  doneBackBtn: document.getElementById("done-back-btn")
};

let state = loadState();

// What the user typed in the search box. This filters the list on screen only:
// it is not part of the saved data, so a reload always shows the whole deck.
let searchText = "";

function persist() {
  saveState(state);
  render();
}

/* ---------- actions ---------- */

function newId() {
  return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function addCard(front, back) {
  state.cards.push({ id: newId(), front, back, correct: 0, wrong: 0 });
  persist();
}

function deleteCard(id) {
  state.cards = state.cards.filter((card) => card.id !== id);

  // Keep a running session on the same card it was showing.
  const session = state.session;
  if (session) {
    const position = session.order.indexOf(id);
    if (position !== -1) {
      session.order.splice(position, 1);
      if (position < session.index) session.index -= 1;
      session.index = Math.min(session.index, session.order.length);
      if (session.index >= session.order.length) session.revealed = false;
    }
    if (session.order.length === 0) state.session = null;
  }

  persist();
}

function startSession() {
  if (state.cards.length === 0) return;
  state.session = {
    order: shuffle(state.cards.map((card) => card.id)),
    index: 0,
    revealed: false,
    correct: 0,
    wrong: 0
  };
  persist();
}

function endSession() {
  state.session = null;
  persist();
}

function setRevealed(revealed) {
  const session = state.session;
  if (!session || session.index >= session.order.length) return;
  session.revealed = revealed;
  persist();
}

function gradeCard(wasRight) {
  const session = state.session;
  if (!session || !session.revealed) return;

  const card = currentCard();
  if (card) {
    if (wasRight) card.correct += 1;
    else card.wrong += 1;
  }

  if (wasRight) session.correct += 1;
  else session.wrong += 1;

  session.index += 1;
  session.revealed = false;
  persist();
}

/* ---------- export / import ---------- */

const EXPORT_VERSION = 1;

function cardWord(count) {
  return count === 1 ? "card" : "cards";
}

// The file carries the chosen cards only. The light/dark choice and a half-finished
// study round belong to this browser, not to the deck, so they are left out.
function buildExportJson(cards) {
  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(), // a moment in time, not a day key
      cards
    },
    null,
    2
  );
}

function exportFileName() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  // Local date parts, so the name matches the day the user is actually having.
  return "flashcards-" + now.getFullYear() + "-" + month + "-" + day + ".json";
}

// Writes the given cards to a file. The picker decides which cards those are.
function downloadExport(cards) {
  if (cards.length === 0) return;

  const name = exportFileName();
  const blob = new Blob([buildExportJson(cards)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showBackupStatus(
    "Exported " + cards.length + " " + cardWord(cards.length) + " to " + name + ".",
    false
  );
}

// Checks a file's text without touching the app's data. Returns what it found so
// the caller decides whether to go ahead.
function readImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, message: "That file is not valid JSON, so nothing was changed." };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, message: "That file does not look like a Flashcards export." };
  }

  if (data.version !== EXPORT_VERSION) {
    const found = typeof data.version === "number" || typeof data.version === "string"
      ? String(data.version)
      : "missing";
    return {
      ok: false,
      message: "That file is version " + found + ", but this app reads version " +
        EXPORT_VERSION + ". Nothing was changed."
    };
  }

  if (!Array.isArray(data.cards)) {
    return { ok: false, message: "That file has no list of cards in it." };
  }

  const cards = readCards(data.cards);
  if (cards.length === 0) {
    return { ok: false, message: "No usable cards were found in that file." };
  }

  return { ok: true, cards, skipped: data.cards.length - cards.length };
}

// Replaces the whole deck. Only reachable through the "All cards" choice.
function applyReplaceAll(cards) {
  state.cards = cards.map(copyCard);
  state.session = null; // the old round's cards are gone, so it cannot continue
  clearSearchBox();
  persist();
}

// Brings in the chosen cards: one with a matching id replaces that card, and
// anything else is added. Nothing the user already had is deleted.
function applyMerge(cards) {
  let replaced = 0;
  let added = 0;

  for (const incoming of cards) {
    const at = state.cards.findIndex((card) => card.id === incoming.id);
    if (at === -1) {
      state.cards.push(copyCard(incoming));
      added++;
    } else {
      state.cards[at] = copyCard(incoming);
      replaced++;
    }
  }

  state.session = null; // a replaced card may have changed under a running round
  clearSearchBox();
  persist();
  return { replaced, added };
}

function copyCard(card) {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    correct: card.correct,
    wrong: card.wrong
  };
}

function clearSearchBox() {
  searchText = "";
  el.searchInput.value = "";
}

// Reads and checks a file, then opens the picker. Nothing is changed here: the
// user still chooses what to bring in. Resolves so the tests can follow along.
function importFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => {
      const failed = { ok: false, message: "That file could not be read." };
      showBackupStatus(failed.message, true);
      resolve(failed);
    };

    reader.onload = () => {
      const found = readImport(String(reader.result));

      if (!found.ok) {
        showBackupStatus(found.message, true);
        resolve(found);
        return;
      }

      openImportPicker(found, file.name);
      resolve({ ok: true, opened: true, cards: found.cards, skipped: found.skipped });
    };

    reader.readAsText(file);
  });
}

/* ---------- card picker (used by both export and import) ---------- */

// View state only, never saved: an open dialog has nothing to do with the deck.
// { kind: "export" | "import", cards, selected: Set of ids, replaceAll, fileName, skipped }
let picker = null;

function openExportPicker() {
  if (state.cards.length === 0) return;

  picker = {
    kind: "export",
    cards: state.cards.map(copyCard),
    selected: new Set(state.cards.map((card) => card.id)),
    replaceAll: false,
    fileName: "",
    skipped: 0
  };

  renderPicker();
  el.picker.showModal();
}

function openImportPicker(found, fileName) {
  picker = {
    kind: "import",
    cards: found.cards,
    // Everything ticked, but as a merge: safe by default, nothing deleted.
    selected: new Set(found.cards.map((card) => card.id)),
    replaceAll: false,
    fileName: fileName || "that file",
    skipped: found.skipped
  };

  renderPicker();
  el.picker.showModal();
}

function closePicker() {
  picker = null;
  if (el.picker.open) el.picker.close();
}

// A closed dialog means there is no picker, whatever route closed it. Checked on
// every render so the two can never drift apart.
function syncPickerWithDialog() {
  if (picker && !el.picker.open) picker = null;
}

function togglePickerCard(id, wanted) {
  if (!picker) return;
  if (wanted) picker.selected.add(id);
  else picker.selected.delete(id);
  renderPicker();
}

function setPickerAll(wanted) {
  if (!picker) return;
  picker.selected = wanted ? new Set(picker.cards.map((card) => card.id)) : new Set();
  renderPicker();
}

function setPickerReplaceAll(wanted) {
  if (!picker) return;
  picker.replaceAll = wanted === true;
  renderPicker();
}

// The cards ticked right now, in the order they appear in the picker.
function pickerChosen() {
  if (!picker) return [];
  return picker.cards.filter((card) => picker.selected.has(card.id));
}

function confirmPicker() {
  if (!picker) return;

  if (picker.kind === "export") {
    const chosen = pickerChosen();
    if (chosen.length === 0) return;
    closePicker();
    downloadExport(chosen);
    render();
    return;
  }

  // Import.
  if (picker.replaceAll) {
    const all = picker.cards;
    const had = state.cards.length;
    const skipped = picker.skipped;
    closePicker();
    applyReplaceAll(all);
    showBackupStatus(
      "Replaced " + had + " " + cardWord(had) + " with " + all.length + " " +
        cardWord(all.length) + " from the file." + skippedNote(skipped),
      false
    );
    return;
  }

  const chosen = pickerChosen();
  if (chosen.length === 0) return;
  const skipped = picker.skipped;
  closePicker();

  const done = applyMerge(chosen);
  const parts = [];
  if (done.replaced > 0) parts.push("replaced " + done.replaced + " " + cardWord(done.replaced));
  if (done.added > 0) parts.push("added " + done.added + " new " + cardWord(done.added));
  showBackupStatus(
    "Imported " + chosen.length + " " + cardWord(chosen.length) + ": " +
      parts.join(" and ") + "." + skippedNote(skipped),
    false
  );
}

function cancelPicker() {
  if (!picker) return;

  const kind = picker.kind;
  closePicker();
  showBackupStatus(
    kind === "import" ? "Import cancelled — nothing was changed." : "Export cancelled.",
    false
  );
}

function skippedNote(skipped) {
  if (!skipped) return "";
  return " " + skipped + " unusable " +
    (skipped === 1 ? "entry was" : "entries were") + " skipped.";
}

/* ---------- stats ---------- */

// A card is learned once it has more right answers than wrong ones. Everything
// else is still being learned, including a brand new card with no answers yet.
function isLearned(card) {
  return card.correct > card.wrong;
}

function learningCount() {
  return state.cards.filter((card) => !isLearned(card)).length;
}

/* ---------- search ---------- */

function setSearch(text) {
  searchText = text;
  render();
}

// An empty or blank box means "no filter at all".
function searchTerm() {
  return searchText.trim().toLowerCase();
}

function matchingCards() {
  const term = searchTerm();
  if (term === "") return state.cards;
  return state.cards.filter(
    (card) =>
      card.front.toLowerCase().indexOf(term) !== -1 ||
      card.back.toLowerCase().indexOf(term) !== -1
  );
}

/* ---------- light / dark mode ---------- */

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

// What the page actually looks like right now: the user's pick, or the browser's.
function activeTheme() {
  return state.theme !== null ? state.theme : (darkQuery.matches ? "dark" : "light");
}

function toggleTheme() {
  state.theme = activeTheme() === "dark" ? "light" : "dark";
  persist();
}

function currentCard() {
  const session = state.session;
  if (!session || session.index >= session.order.length) return null;
  return state.cards.find((card) => card.id === session.order[session.index]) || null;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}

/* ---------- rendering ---------- */

function render() {
  syncPickerWithDialog();
  renderTheme();
  renderStats();

  const session = state.session;
  const finished = session !== null && session.index >= session.order.length;

  el.deckView.hidden = session !== null;
  el.studyView.hidden = session === null || finished;
  el.doneView.hidden = !finished;

  // Search and backup belong to the deck screen, so they step aside while studying.
  el.searchWrap.hidden = session !== null;
  el.backupView.hidden = session !== null;

  if (session === null) renderDeck();
  else if (finished) renderDone();
  else renderStudy();

  // Keep an open picker in step with the deck it is talking about.
  if (picker) renderPicker();
}

function renderTheme() {
  // No attribute at all while the browser's setting is being followed.
  if (state.theme === null) document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", state.theme);

  // The button is labelled with the mode it switches to.
  const next = activeTheme() === "dark" ? "light" : "dark";
  el.themeBtn.textContent = next === "dark" ? "🌙 Dark mode" : "☀️ Light mode";
  el.themeBtn.setAttribute("aria-label", "Switch to " + next + " mode");
}

// Counts the whole deck, so the search filter never changes these numbers.
// Called on every render, which is what keeps them current after a card is
// added, deleted, or graded.
function renderPicker() {
  if (!picker) return;

  const isImport = picker.kind === "import";
  const total = picker.cards.length;
  const chosen = pickerChosen().length;
  const have = state.cards.length;

  el.pickerTitle.textContent = isImport ? "Import cards" : "Export cards";

  el.pickerIntro.textContent = isImport
    ? "Found " + total + " " + cardWord(total) + " in " + picker.fileName +
      ". Nothing changes until you choose."
    : "Tick the cards you want to save to a file.";

  // Only an import offers the whole-deck option; export has no deck to replace.
  el.pickerModes.hidden = !isImport;
  if (isImport) {
    el.modeAll.checked = picker.replaceAll;
    el.modeSome.checked = !picker.replaceAll;
    el.modeAllHint.textContent =
      "Replace my whole deck with all " + total + " " + cardWord(total) +
      " from the file. My " + have + " " + cardWord(have) + " will be deleted.";
    el.modeSomeHint.textContent =
      "Bring in just the cards I tick below. A card replaces the one it matches, " +
      "or is added as new. Nothing else is deleted.";
  }

  // In "All cards" mode the per-card list is not in play.
  const listActive = !(isImport && picker.replaceAll);
  el.pickerAllRow.hidden = !listActive;
  el.pickerList.classList.toggle("is-disabled", !listActive);
  el.pickerSelectAll.checked = chosen === total && total > 0;
  el.pickerSelectAll.indeterminate = chosen > 0 && chosen < total;

  el.pickerList.textContent = "";
  for (const card of picker.cards) {
    el.pickerList.append(buildPickerItem(card, isImport, listActive));
  }

  if (isImport && picker.replaceAll) {
    el.pickerSummary.textContent =
      "All " + total + " " + cardWord(total) + " will replace your " + have + " " + cardWord(have) + ".";
  } else if (isImport) {
    const replacing = picker.cards.filter(
      (card) => picker.selected.has(card.id) && state.cards.some((mine) => mine.id === card.id)
    ).length;
    el.pickerSummary.textContent =
      chosen + " of " + total + " ticked — " + replacing + " " + cardWord(replacing) +
      " replaced, " + (chosen - replacing) + " added as new.";
  } else {
    el.pickerSummary.textContent = chosen + " of " + total + " " + cardWord(total) + " ticked.";
  }

  const action = isImport && picker.replaceAll ? total : chosen;
  el.pickerConfirm.textContent = isImport
    ? "Import " + action + " " + cardWord(action)
    : "Export " + action + " " + cardWord(action);
  el.pickerConfirm.disabled = action === 0;
}

function buildPickerItem(card, isImport, listActive) {
  const item = document.createElement("li");
  item.className = "picker-item";

  const label = document.createElement("label");
  label.className = "picker-check";

  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = picker.selected.has(card.id);
  box.disabled = !listActive;
  box.addEventListener("change", () => togglePickerCard(card.id, box.checked));

  const text = document.createElement("span");

  const front = document.createElement("span");
  front.className = "picker-card-front";
  front.textContent = card.front;

  const back = document.createElement("span");
  back.className = "picker-card-back";
  back.textContent = card.back;

  text.append(front, document.createElement("br"), back);

  // On an import, say plainly what each card would do to the deck.
  if (isImport) {
    const match = state.cards.find((mine) => mine.id === card.id);
    const tag = document.createElement("span");
    tag.className = "picker-tag " + (match ? "is-replace" : "is-new");
    tag.textContent = match ? "Replaces: " + match.front : "New card";
    text.append(document.createElement("br"), tag);
  }

  label.append(box, text);
  item.append(label);
  return item;
}

function showBackupStatus(message, isError) {
  el.backupStatus.textContent = message;
  el.backupStatus.classList.toggle("is-error", isError === true);
  el.backupStatus.hidden = false;
}

function renderStats() {
  const total = state.cards.length;

  el.statTotal.textContent = String(total);
  el.statLearning.textContent = String(learningCount());
  el.deckStats.hidden = total === 0;
}

function renderDeck() {
  const total = state.cards.length;
  const shown = matchingCards();
  const filtering = searchTerm() !== "";

  if (total === 0) el.deckCount.textContent = "";
  else if (filtering) el.deckCount.textContent = "(" + shown.length + " of " + total + ")";
  else el.deckCount.textContent = "(" + total + ")";

  // Two different empty messages: nothing saved yet, or nothing matches.
  el.deckEmpty.hidden = total > 0;
  el.noMatches.hidden = !(total > 0 && shown.length === 0);
  el.noMatches.textContent = 'No cards match "' + searchText.trim() + '".';

  // Studying always covers the whole deck; the search only filters this list.
  el.studyBtn.disabled = total === 0;
  el.exportBtn.disabled = total === 0;

  el.cardList.textContent = "";
  for (const card of shown) {
    el.cardList.append(buildCardItem(card));
  }
}

function buildCardItem(card) {
  const item = document.createElement("li");
  item.className = "card-item";

  const text = document.createElement("div");
  text.className = "card-text";

  const front = document.createElement("p");
  front.className = "card-front";
  front.textContent = card.front;

  const back = document.createElement("p");
  back.className = "card-back";
  back.textContent = card.back;

  text.append(front, back);

  if (card.correct > 0 || card.wrong > 0) {
    const stats = document.createElement("p");
    stats.className = "card-stats";
    stats.append(
      tally("tally-right", "✓ " + card.correct + " right"),
      document.createTextNode("  ·  "),
      tally("tally-wrong", "✗ " + card.wrong + " wrong")
    );
    text.append(stats);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-btn";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", "Delete card: " + card.front);
  remove.addEventListener("click", () => {
    if (confirm("Delete this card?\n\n" + card.front)) deleteCard(card.id);
  });

  item.append(text, remove);
  return item;
}

function tally(className, label) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = label;
  return span;
}

function renderStudy() {
  const session = state.session;
  const card = currentCard();
  if (!card) return;

  const total = session.order.length;
  const answered = session.index;

  el.position.textContent = "Card " + (answered + 1) + " of " + total;

  el.progressFill.style.width = (answered / total) * 100 + "%";
  el.progress.setAttribute("aria-valuenow", String(answered));
  el.progress.setAttribute("aria-valuemax", String(total));
  el.progress.setAttribute("aria-valuetext", answered + " of " + total + " cards answered");

  el.score.textContent = "";
  el.score.append(
    tally("tally-right", session.correct + " right"),
    document.createTextNode("  ·  "),
    tally("tally-wrong", session.wrong + " wrong"),
    document.createTextNode("  ·  " + (total - answered) + " left")
  );

  el.cardFront.textContent = card.front;
  el.cardBack.textContent = card.back;

  el.flashcard.classList.toggle("is-flipped", session.revealed);
  el.flashcard.setAttribute("aria-pressed", String(session.revealed));
  el.flipHint.textContent = session.revealed
    ? "Click the card to see the question again."
    : "Click the card to flip it.";

  el.revealBtn.hidden = session.revealed;
  el.gradeActions.hidden = !session.revealed;
}

function renderDone() {
  const session = state.session;
  const answered = session.correct + session.wrong;
  const percent = answered === 0 ? 0 : Math.round((session.correct / answered) * 100);

  el.doneScore.textContent = session.correct + " / " + answered + " correct";
  el.doneDetail.textContent =
    answered === 0
      ? "No cards were answered this round."
      : "That is " + percent + "% right this round.";
}

/* ---------- events ---------- */

el.addForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const front = el.frontInput.value.trim();
  const back = el.backInput.value.trim();

  if (front === "" || back === "") {
    el.formError.textContent = "Please fill in both the question and the answer.";
    el.formError.hidden = false;
    (front === "" ? el.frontInput : el.backInput).focus();
    return;
  }

  el.formError.hidden = true;
  addCard(front, back);

  el.addForm.reset();
  el.frontInput.focus();
});

el.searchInput.addEventListener("input", (event) => setSearch(event.target.value));

el.exportBtn.addEventListener("click", openExportPicker);

el.pickerConfirm.addEventListener("click", confirmPicker);
el.pickerCancel.addEventListener("click", cancelPicker);
el.pickerSelectAll.addEventListener("change", () => setPickerAll(el.pickerSelectAll.checked));
el.modeAll.addEventListener("change", () => setPickerReplaceAll(true));
el.modeSome.addEventListener("change", () => setPickerReplaceAll(false));

// Esc fires "cancel" first, then "close". Either one counts as cancelling, and
// whichever arrives first does the work.
el.picker.addEventListener("cancel", () => {
  if (picker) cancelPicker();
});

el.picker.addEventListener("close", () => {
  if (picker) cancelPicker();
});

// The file input stays hidden; the visible button opens the file picker for it.
el.importBtn.addEventListener("click", () => el.importFile.click());

el.importFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  event.target.value = ""; // so choosing the same file again still fires a change
  if (file) importFromFile(file);
});

el.themeBtn.addEventListener("click", toggleTheme);

// While no choice has been made, follow the browser if it changes mid-session.
darkQuery.addEventListener("change", () => {
  if (state.theme === null) render();
});

el.studyBtn.addEventListener("click", startSession);
el.exitBtn.addEventListener("click", endSession);
el.restartBtn.addEventListener("click", startSession);
el.doneBackBtn.addEventListener("click", endSession);

el.flashcard.addEventListener("click", () => {
  if (state.session) setRevealed(!state.session.revealed);
});

el.revealBtn.addEventListener("click", () => setRevealed(true));
el.rightBtn.addEventListener("click", () => gradeCard(true));
el.wrongBtn.addEventListener("click", () => gradeCard(false));

render();
