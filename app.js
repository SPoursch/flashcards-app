"use strict";

/* ============================================================
   Flashcards — vanilla JS, no build step.
   State lives in one object; localStorage is touched only by
   loadState() and saveState().
   ============================================================ */

const STORAGE_KEY = "flashcards/v1";

/* ---------- persistence ---------- */

function emptyState() {
  return { version: 1, cards: [], session: null };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();

    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.cards)) return emptyState();

    const cards = [];
    for (const card of data.cards) {
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

    return { version: 1, cards, session: readSession(data.session, cards) };
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
  deckView: document.getElementById("deck-view"),
  studyView: document.getElementById("study-view"),
  doneView: document.getElementById("done-view"),

  addForm: document.getElementById("add-form"),
  frontInput: document.getElementById("front-input"),
  backInput: document.getElementById("back-input"),
  formError: document.getElementById("form-error"),

  deckCount: document.getElementById("deck-count"),
  deckEmpty: document.getElementById("deck-empty"),
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
  const session = state.session;
  const finished = session !== null && session.index >= session.order.length;

  el.deckView.hidden = session !== null;
  el.studyView.hidden = session === null || finished;
  el.doneView.hidden = !finished;

  if (session === null) renderDeck();
  else if (finished) renderDone();
  else renderStudy();
}

function renderDeck() {
  const total = state.cards.length;

  el.deckCount.textContent = total === 0 ? "" : "(" + total + ")";
  el.deckEmpty.hidden = total > 0;
  el.studyBtn.disabled = total === 0;

  el.cardList.textContent = "";
  for (const card of state.cards) {
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
