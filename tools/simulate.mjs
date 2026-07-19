/*
 * Plays complete games headlessly against the real rules module.
 *
 * The end of a game is impractical to reach by tapping — it takes 27 correct
 * sets — so this drives the same code the UI drives and checks the invariants
 * that only show up at the end: that a game always terminates, that every card
 * is accounted for, and that a board is never left with a set unplayed.
 *
 *   node tools/simulate.mjs [gameCount]
 */

import { Game, findSet, buildDeck, isSet, countSets } from '../game.js';

let failures = 0;

function check(label, cond, detail = '') {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/* --- deck sanity ------------------------------------------------------- */

const deck = buildDeck();
check('deck has 81 cards', deck.length === 81, `got ${deck.length}`);
check('deck is unique', new Set(deck.map((c) => c.id)).size === 81);

/* --- rule spot-checks --------------------------------------------------- */

const card = (color, fill, shape, count) => ({ color, fill, shape, count });

check('all-same on every attribute is a set', isSet(
  card('red', 'solid', 'oval', 1), card('red', 'solid', 'oval', 1), card('red', 'solid', 'oval', 1)));

check('all-different on every attribute is a set', isSet(
  card('red', 'solid', 'oval', 1),
  card('green', 'striped', 'diamond', 2),
  card('purple', 'open', 'squiggle', 3)));

check('two-same-one-different is not a set', !isSet(
  card('red', 'solid', 'oval', 1), card('red', 'solid', 'oval', 2), card('red', 'solid', 'oval', 3)
    && card('red', 'solid', 'oval', 1)));

check('mixed count 1,1,2 is not a set', !isSet(
  card('red', 'solid', 'oval', 1), card('green', 'striped', 'diamond', 1), card('purple', 'open', 'squiggle', 2)));

// The classic total: 81 cards contain 1080 distinct sets.
check('full deck contains 1080 sets', countSets(deck) === 1080, `got ${countSets(deck)}`);

/* --- full games --------------------------------------------------------- */

const rounds = Number(process.argv[2] ?? 300);
let totalSets = 0;
let leftoverGames = 0;

for (let n = 0; n < rounds; n++) {
  const game = new Game({ seed: n });
  let guard = 0;

  while (!game.isOver) {
    if (++guard > 500) { check(`game ${n} terminates`, false, 'exceeded 500 moves'); break; }

    const found = findSet(game.board);
    if (found) {
      const picked = found.map((i) => game.board[i]);
      check(`game ${n} findSet returns a real set`, isSet(...picked));
      found.forEach((i) => game.toggle(i));
      const { result } = game.submit();
      check(`game ${n} submit agrees with findSet`, result === 'set', result);
      game.resolveMatch(found);
    } else if (!game.dealThree()) {
      break;   // no set and nothing left to deal — game is over
    }
  }

  game.checkEnd();
  totalSets += game.setsFound;

  const onTable = game.liveCards().length;
  const accounted = game.setsFound * 3 + onTable + game.cardsLeft;

  check(`game ${n} ends`, game.isOver);
  check(`game ${n} accounts for all 81 cards`, accounted === 81,
        `sets*3=${game.setsFound * 3} table=${onTable} deck=${game.cardsLeft} total=${accounted}`);
  check(`game ${n} leaves no playable set`, findSet(game.board) === null);
  check(`game ${n} score matches sets found`, game.score === game.setsFound * 3);

  if (onTable > 0) leftoverGames++;
}

/* --- report ------------------------------------------------------------- */

console.log(`
games played      ${rounds}
sets found        ${totalSets}  (avg ${(totalSets / rounds).toFixed(2)} per game)
ended with cards  ${leftoverGames}/${rounds} left an unplayable remainder
`);

if (failures) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('all checks passed');
