/* SET — rendering and interaction. All rules live in game.js. */

import { Game, findSet, BOARD_COLS, MAX_ROWS } from './game.js';

const el = (id) => document.getElementById(id);
const boardEl = el('board');
const flashEl = el('flash');
const veilEl  = el('veil');

const SHAPE_HREF = { diamond: '#sym-diamond', oval: '#sym-oval', squiggle: '#sym-squiggle' };
const BEST_KEY = 'set.best.v1';

let game;
let locked = false;      // true while a match animation plays
let clockTimer = null;

/* ------------------------------------------------------------ helpers --- */

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function flash(msg, kind = '') {
  flashEl.textContent = msg;
  flashEl.className = `flash${msg ? ' is-on' : ''}${kind ? ` is-${kind}` : ''}`;
}

function buzz(ms) {
  // Only fires on devices that support it; iOS Safari currently ignores this.
  if (navigator.vibrate) navigator.vibrate(ms);
}

/**
 * Replay a one-shot animation class. The reflow read is what makes a second
 * press animate at all — without it the class is removed and re-added inside
 * one frame and the browser never sees a change.
 */
function nudge(node, cls, ms) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

function readBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || null; }
  catch { return null; }
}

function writeBest(entry) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(entry)); } catch { /* private mode */ }
}

/* ------------------------------------------------------------ drawing --- */

function symbolSvg(card) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 200');
  svg.setAttribute('class', `sym c-${card.color} f-${card.fill}`);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', SHAPE_HREF[card.shape]);
  svg.appendChild(use);
  return svg;
}

/** Stable identity for a slot, so render() can tell a moved card from a new one. */
const slotKey = (card, index) => (card ? card.id : `empty:${index}`);

function cardEl(card, index, dealOrder) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card';
  btn.dataset.index = String(index);
  btn.dataset.key = slotKey(card, index);

  if (!card) {
    btn.classList.add('is-empty');
    btn.disabled = true;
    btn.setAttribute('aria-hidden', 'true');
    return btn;
  }

  btn.setAttribute('aria-label', `${card.count} ${card.color} ${card.fill} ${card.shape}`);
  syncCard(btn, card, index);

  const wrap = document.createElement('span');
  wrap.className = 'card__syms';
  for (let i = 0; i < card.count; i++) wrap.appendChild(symbolSvg(card));
  btn.appendChild(wrap);

  // Stagger the deal so a new board cascades in rather than appearing at once.
  // The animation lives on a class, not on .card, so only genuinely new cards
  // play it — see render().
  btn.classList.add('is-dealing');
  btn.style.animationDelay = `${Math.min(dealOrder, 14) * 22}ms`;
  btn.addEventListener('animationend', () => {
    btn.classList.remove('is-dealing');
    btn.style.animationDelay = '';
  }, { once: true });

  return btn;
}

/** Update a reused node's transient state without rebuilding it. */
function syncCard(node, card, index) {
  node.dataset.index = String(index);
  if (!card) return;
  const sel = game.selected.includes(index);
  node.classList.toggle('is-sel', sel);
  node.classList.remove('is-good', 'is-bad');
  node.setAttribute('aria-pressed', String(sel));
}

/**
 * Reconcile the board in place, keyed by card id.
 *
 * This used to be replaceChildren(...game.board.map(cardEl)), which rebuilt all
 * twelve buttons on every call. Every new node restarted the deal animation, so
 * a single tap re-dealt the entire board visually — it read as the page
 * refreshing, and it swamped the hint ring badly enough to look like Hint was
 * doing nothing. Reusing nodes means only cards that actually changed animate.
 */
function render() {
  const pool = new Map();
  for (const node of boardEl.children) pool.set(node.dataset.key, node);

  let dealOrder = 0;
  const next = game.board.map((card, index) => {
    const key = slotKey(card, index);
    const found = pool.get(key);
    if (found) {
      pool.delete(key);
      syncCard(found, card, index);
      return found;
    }
    return cardEl(card, index, dealOrder++);
  });

  // Drop replaced cards *before* positioning. insertBefore inserts rather than
  // replaces, so leaving a stale node in place pushes every card after it along
  // by one and cascades into moving almost the whole board — and a moved node
  // restarts its animation, which is the exact flicker this exists to prevent.
  // Whatever is left in the pool is precisely the set of nodes no longer used.
  for (const stale of pool.values()) stale.remove();

  // Now only insert where the child differs, so untouched cards are never
  // detached.
  next.forEach((node, i) => {
    if (boardEl.children[i] !== node) boardEl.insertBefore(node, boardEl.children[i] || null);
  });

  const rows = Math.ceil(game.board.length / BOARD_COLS);
  boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  el('score').textContent = String(game.score);
  el('remaining').textContent = String(game.cardsLeft);

  const dealt = 81 - game.cardsLeft;
  document.querySelector('.hud__rule').style.setProperty('--progress', `${(dealt / 81) * 100}%`);

  el('btn-deal').disabled =
    game.isOver || !game.cardsLeft || game.board.length >= BOARD_COLS * MAX_ROWS;
  el('btn-hint').disabled = game.isOver;
}

function tickClock() {
  el('clock').textContent = fmtTime(game.elapsedMs);
}

/* ---------------------------------------------------------- game flow --- */

function onCardTap(index) {
  if (locked || game.isOver) return;

  game.toggle(index);
  render();

  if (game.selected.length !== 3) {
    flash('');
    return;
  }

  const { result, indices } = game.submit();

  if (result === 'not-set') {
    flash('Not a set', 'bad');
    buzz(60);
    markCards(indices, 'is-bad');
    // Leave the wrong trio visible for the length of the shake so the player
    // can see what they picked before it clears.
    locked = true;
    setTimeout(() => { locked = false; render(); }, 380);
    return;
  }

  flash('Set', 'good');
  buzz([18, 40, 18]);
  markCards(indices, 'is-good');
  // Score straight away rather than waiting out the animation — a full
  // render() here would wipe the is-good class off the cards mid-flight.
  el('score').textContent = String(game.score);
  locked = true;
  setTimeout(() => {
    game.resolveMatch(indices);
    locked = false;
    render();
    if (game.isOver) finish();
    else if (!game.hasSet()) flash('No set on the board — deal 3', '');
  }, 400);
}

function markCards(indices, cls) {
  for (const i of indices) {
    const node = boardEl.querySelector(`[data-index="${i}"]`);
    if (node) { node.classList.remove('is-sel'); node.classList.add(cls); }
  }
}

function doHint() {
  if (locked || game.isOver) return;
  const found = game.hint();
  if (!found) { flash('No set here — deal 3', ''); return; }

  // Reveal one card of a real set, not the whole answer. It pulses rather than
  // sitting still — a static 3px ring on one card is easy to miss entirely.
  nudge(boardEl.querySelector(`[data-index="${found[0]}"]`), 'is-hint', 1400);
  flash('One of three', '');
}

function doDeal() {
  if (locked || game.isOver) return;

  // Dealing is only legal when the board genuinely has no set — otherwise
  // this would just be a way to skip hard boards.
  //
  // The button deliberately stays enabled. Disabling it whenever a set exists
  // would be a standing free hint: you could read "is there a set here?" off
  // the button without ever looking at the board. So it accepts the press and
  // refuses visibly instead.
  if (findSet(game.board)) {
    flash('There is a set here', 'bad');
    buzz(60);
    nudge(el('btn-deal'), 'is-refused', 400);
    return;
  }
  if (!game.dealThree()) { flash('No cards left', ''); return; }
  flash('Three more', '');
  render();
  if (game.isOver) finish();
}

function finish() {
  clearInterval(clockTimer);
  tickClock();

  el('ov-sets').textContent  = String(game.setsFound);
  el('ov-score').textContent = String(game.score);
  el('ov-time').textContent  = fmtTime(game.elapsedMs);
  el('ov-miss').textContent  = String(game.badGuesses);

  const best = readBest();
  const bestEl = el('ov-best');
  const perfect = game.liveCards().length === 0;

  // Most games strand a few cards that form no set — a simulation over 300
  // games averaged 24 sets, and only 2% cleared the table. So rank on sets
  // found first and time only as the tiebreak, otherwise a personal best
  // would almost never be recordable.
  const better = !best
    || game.setsFound > best.sets
    || (game.setsFound === best.sets && game.elapsedMs < best.ms);

  if (better) {
    writeBest({ sets: game.setsFound, ms: game.elapsedMs, misses: game.badGuesses, at: Date.now() });
    bestEl.textContent = 'Personal best';
    bestEl.className = 'tally__best is-record';
  } else {
    bestEl.textContent = `Best ${best.sets} sets in ${fmtTime(best.ms)}`;
    bestEl.className = 'tally__best';
  }

  el('over-title').textContent = perfect ? 'Perfect clear' : 'No sets left';
  veilEl.hidden = false;
}

function newGame() {
  clearInterval(clockTimer);
  game = new Game();
  locked = false;
  veilEl.hidden = true;
  flash('');
  render();
  tickClock();
  clockTimer = setInterval(tickClock, 500);
}

/* ------------------------------------------------------------- wiring --- */

boardEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.card');
  if (!btn || btn.disabled) return;
  onCardTap(Number(btn.dataset.index));
});

el('btn-hint').addEventListener('click', doHint);
el('btn-deal').addEventListener('click', doDeal);
el('btn-new').addEventListener('click', newGame);
el('btn-again').addEventListener('click', newGame);

// Keep the clock honest when the app is backgrounded and resumed.
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });

newGame();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
