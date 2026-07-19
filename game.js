/*
 * Set — game rules.
 *
 * Ported from the 2006 Java version (Set/set/Deck.java, SetFrame.java).
 * Pure logic, no DOM: this file is the part that survives if the app is
 * later wrapped natively, so it deliberately knows nothing about rendering.
 */

export const COLORS = ['red', 'green', 'purple'];
export const FILLS  = ['solid', 'striped', 'open'];
export const SHAPES = ['diamond', 'squiggle', 'oval'];
export const COUNTS = [1, 2, 3];

export const BOARD_COLS = 3;
export const START_ROWS = 4;   // 3x4 = 12 cards, as the original dealt
export const MAX_ROWS   = 7;   // room to keep adding 3 when there is no set
export const SET_SCORE  = 3;   // the original awarded score += 3

/** All 81 unique cards. */
export function buildDeck() {
  const deck = [];
  for (const color of COLORS)
    for (const fill of FILLS)
      for (const shape of SHAPES)
        for (const count of COUNTS)
          deck.push({ id: `${color}-${fill}-${shape}-${count}`, color, fill, shape, count });
  return deck;
}

/**
 * Fisher-Yates. Takes an rng so a game can be replayed from a seed, which is
 * how the Java version worked (shuffleDeck took an int seed).
 */
export function shuffle(deck, rng = Math.random) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Mulberry32 — small seeded PRNG, so a seed reproduces a deal. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A set is three cards where every attribute is either all-same or
 * all-different. The original counted one point per satisfied attribute and
 * required all four; this is the same test written directly.
 */
export function isSet(a, b, c) {
  if (!a || !b || !c) return false;
  for (const attr of ['color', 'fill', 'shape', 'count']) {
    const [x, y, z] = [a[attr], b[attr], c[attr]];
    const allSame = x === y && y === z;
    const allDiff = x !== y && y !== z && x !== z;
    if (!allSame && !allDiff) return false;
  }
  return true;
}

/** First set present on the board, as an array of indices, or null. */
export function findSet(cards) {
  for (let i = 0; i < cards.length - 2; i++) {
    if (!cards[i]) continue;
    for (let j = i + 1; j < cards.length - 1; j++) {
      if (!cards[j]) continue;
      for (let k = j + 1; k < cards.length; k++) {
        if (!cards[k]) continue;
        if (isSet(cards[i], cards[j], cards[k])) return [i, j, k];
      }
    }
  }
  return null;
}

/** How many distinct sets are on the board (used for the end-of-game tally). */
export function countSets(cards) {
  let n = 0;
  for (let i = 0; i < cards.length - 2; i++) {
    if (!cards[i]) continue;
    for (let j = i + 1; j < cards.length - 1; j++) {
      if (!cards[j]) continue;
      for (let k = j + 1; k < cards.length; k++) {
        if (cards[k] && isSet(cards[i], cards[j], cards[k])) n++;
      }
    }
  }
  return n;
}

export class Game {
  constructor({ seed } = {}) {
    this.seed = seed ?? (Math.random() * 2 ** 32) >>> 0;
    this.deck = shuffle(buildDeck(), seededRng(this.seed));
    this.board = [];
    this.selected = [];
    this.score = 0;
    this.setsFound = 0;
    this.badGuesses = 0;
    this.hintsUsed = 0;
    this.startedAt = Date.now();
    this.endedAt = null;

    for (let i = 0; i < BOARD_COLS * START_ROWS; i++) this.board.push(this.deck.pop() ?? null);
  }

  get isOver() { return this.endedAt !== null; }
  get cardsLeft() { return this.deck.length; }
  get elapsedMs() { return (this.endedAt ?? Date.now()) - this.startedAt; }

  /** Cards actually on the table, ignoring emptied slots. */
  liveCards() { return this.board.filter(Boolean); }

  hasSet() { return findSet(this.board) !== null; }

  toggle(index) {
    if (this.isOver) return;
    const card = this.board[index];
    if (!card) return;
    const at = this.selected.indexOf(index);
    if (at !== -1) this.selected.splice(at, 1);
    else if (this.selected.length < 3) this.selected.push(index);
  }

  /**
   * Resolve a full selection.
   * Returns {result:'set'|'not-set'|'incomplete', indices}.
   */
  submit() {
    if (this.selected.length !== 3) return { result: 'incomplete', indices: [] };
    const indices = this.selected.slice();
    const [a, b, c] = indices.map((i) => this.board[i]);

    if (!isSet(a, b, c)) {
      this.badGuesses++;
      this.selected = [];
      return { result: 'not-set', indices };
    }

    this.score += SET_SCORE;
    this.setsFound++;
    this.selected = [];
    return { result: 'set', indices };
  }

  /**
   * Clear a matched set and refill. Slots are refilled in place while the
   * board is still the starting size; once it has grown past 12 the extra
   * cards collapse away instead, which is how physical Set plays.
   */
  resolveMatch(indices) {
    const atStartSize = this.board.length <= BOARD_COLS * START_ROWS;
    for (const i of indices) {
      this.board[i] = atStartSize && this.deck.length ? this.deck.pop() : null;
    }
    if (!atStartSize) this.board = this.board.filter(Boolean);
    this.checkEnd();
  }

  /** Deal three more. Returns false when that is not currently legal. */
  dealThree() {
    if (this.isOver) return false;
    if (!this.deck.length) return false;
    if (this.board.length >= BOARD_COLS * MAX_ROWS) return false;
    for (let i = 0; i < 3; i++) {
      const card = this.deck.pop();
      if (card) this.board.push(card);
    }
    this.checkEnd();
    return true;
  }

  hint() {
    const found = findSet(this.board);
    if (!found) return null;
    this.hintsUsed++;
    return found;
  }

  checkEnd() {
    if (!this.hasSet() && !this.deck.length) this.endedAt = Date.now();
  }
}
