# SET

The card game Set, rebuilt for touch — a modernisation of the 2006 Java/Swing
version in [`old-java-projects/Set`](https://github.com/dcaloia/old-java-projects).

No framework, no build step, no dependencies. Plain ES modules and one
stylesheet, which is what makes it trivial to wrap natively later.

## Playing

Tap three cards. They form a set when, for **each** of the four attributes —
colour, shading, shape and count — the three cards are either all the same or
all different. A set scores 3, carried over from the original.

`Deal 3` only works when the board genuinely has no set, so it can't be used to
skip a hard board. `Hint` reveals one card of a real set, not the whole answer.

## Installing on an iPhone

It must be served over **HTTPS or localhost** for the offline cache to install —
Safari refuses to register a service worker on a plain-HTTP origin. Over a bare
LAN address it still installs to the home screen and plays fine, it just won't
work without the server running.

1. Serve it (see below) and open the URL **in Safari** — Chrome on iOS cannot
   add to the home screen.
2. Share → **Add to Home Screen**.

It then launches full-screen with its own icon, no browser chrome, and — on an
HTTPS origin — works with no network at all.

## Running it

```bash
npm start           # serves on http://localhost:5174
```

To reach it from the phone on the same Wi-Fi, use the machine's LAN address
(`ipconfig`), e.g. `http://192.168.1.20:5174`. For a real HTTPS install, put the
folder on any static host — GitHub Pages, Netlify, Cloudflare Pages. The whole
app is static files, so any of them work with no configuration.

```bash
npm test            # play 300 full games headlessly and check the invariants
npm run icons       # regenerate icons/ from tools/make_icons.py
```

## Going native later

The structure is deliberately Capacitor-shaped: `game.js` holds the rules and
touches no DOM, and everything is static assets in the repo root. Wrapping it is

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/ios
npx cap init SET com.dcaloia.set --web-dir .
npx cap add ios && npx cap open ios
```

which produces an Xcode project to build and sign on the Mac. Nothing in the web
code needs to change.

## Layout notes

The board is 3 columns rather than the original's 3 rows × 4 columns, because
portrait phones are tall and narrow. Card count is identical — 12 to start,
growing by 3 when there is no set. The grid was checked at 320×568 through
430×932 and at every board size from 12 to 21 cards without overflowing.

Type is Futura falling back to Avenir Next, both already on iOS, so there is no
webfont request to fail when offline.

## What was verified

- `npm test` plays 300 complete games against the real rules module: every game
  terminates, all 81 cards stay accounted for, no game ends with a playable set
  on the board, and score always equals sets × 3. It also asserts the classic
  invariant that a full 81-card deck contains exactly **1080** distinct sets.
- The UI was driven end-to-end in a browser: valid and invalid selections, the
  `Deal 3` guard, hints, new game, and a full 25-set game through to the
  end-of-game panel.

One thing the simulation changed: **most games strand a few cards that form no
set** — over 300 games the average was 24.4 sets, and only about 2% cleared the
table completely. Personal bests are therefore ranked on sets found first and
time only as a tiebreak; ranking on time alone would have made a record almost
unreachable.
