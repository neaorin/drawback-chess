# Drawback Chess

Chess with a secret disadvantage. Inspired by [Drawback Chess](https://www.drawbackchess.com/),
each player receives a random **drawback**: an extra rule that changes how they
can play. You might only be allowed to capture on even-numbered turns, have to
alternate pawn and non-pawn moves, or play with most of the board hidden by fog.
You know your own drawback, but not your opponent's, so discovering their
limitations is part of the strategy. You can choose your own drawback instead
of a random one, and voluntarily reveal it at any time.

The pieces move as in regular chess, but **there is no check or checkmate**.
You can leave your king under attack, move into danger, or move a pinned piece.
Capture the opposing king to win, or leave your opponent with no legal moves
under their drawback. The game enforces restrictions and highlights legal moves
when you select a piece, so you never need to police the rules yourself.

Play against a Stockfish-backed computer or a friend on the same device.
This browser-based, local-first implementation is built with React, TypeScript,
and Vite, with seven initial drawbacks and automatic game saving.

## Run

Requires Node.js 22.12+ (or a newer supported release).

```powershell
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` produces `dist`, and
`npm run preview` serves that production build. `npm test` runs rules and AI tests.
`npm run test:e2e` runs browser tests against a production preview. It uses
installed Microsoft Edge on Windows; elsewhere run `npx playwright install chromium`
first. Run `npm run build` before the browser tests.

The install hook copies Stockfish's lite, single-threaded JavaScript, WASM, and
GPL license into `public/engine`. Both engine assets are served locally; gameplay
does not call an external AI service. Deploy the entire `dist` directory to a
static host that serves `.wasm` as `application/wasm`. No cross-origin isolation
headers are needed. Do not open the HTML using `file:`: workers need an HTTP host.

## Play

Pieces use Colin M. L. Burnett's **Cburnett** SVG set, bundled locally and
unmodified under GPLv2+. White and black retain their original colors in both
themes. Attribution, source revision, and license are included in
`public/pieces/cburnett/CREDITS.md` and `COPYING.txt` and copied into the build.

- Play the computer as either color, or share a device using local pass & play.
- In the new game modal, choose Random (the default) or a specific drawback.
  Your choice applies to your selected color against the computer, or White in
  local pass & play. The opponent's drawback is independently random. Reopening
  the modal resets the choice to Random; cancelling does not change the game.
- Before each move, the right pane automatically shows your current restriction:
  Centralized Command's remaining capture-enabled moves (including this move),
  Even Keeled's current/next capture permission, or Alternator's required piece
  category. This status is hidden during pass-device handoff, the AI's turn, and
  after game over, and never shows the opponent's hidden restriction.
- Click or drag pieces to highlight legal destinations. Up/Down navigate
  squares; Enter/Space selects. Promotion offers all four pieces.
- Left/Right browse past positions one ply at a time, including after reload
  or game over. Review is read-only and does not undo moves or change the saved
  live game. Use Right to reach the latest position, or "Return to latest".
  The AI may finish its live turn while you review. Fog remains restricted to
  your perspective until game over. History keys do not intercept form controls
  or operate during dialogs, handoff, or piece slides.
- Pieces slide into place over 0.2 seconds, including both castling pieces.
  The next move or pass-device handoff waits for the slide to finish.
  Reduced-motion preferences disable the animation.
- Attacked kings have a red halo. This is a geometric warning, including king
  en passant threats, not a move restriction. It ignores hidden drawbacks so
  it cannot disclose whether an opponent is actually permitted to capture.
- Your own drawback is shown directly in the right pane. You can permanently
  reveal it to the opponent.
  When the game ends for any reason, both drawbacks are automatically shown,
  including when reopening a finished saved game.
  In local play, either player's name row offers reveal even when it is not
  their turn.
  The computer does not voluntarily reveal its drawback in this iteration.
- A pass-device screen hides secrets between local turns. Game progress is
  automatically stored in this browser. Your drawback is shown after reload;
  local play still requires confirming the pass-device handoff first.
- No online multiplayer or server is included. Hidden information is a UI/gameplay
  guarantee, not a security boundary: anyone inspecting browser storage or code
  can see both drawbacks. The AI does not use the human's hidden drawback.

## Variant rules

There is no check, checkmate, stalemate, repetition draw, or fifty-move draw.
Moving into check, adjacent kings, ignoring threats, and moving pinned pieces
are legal. You lose when your king is captured or you start a turn without
legal moves. Castle Doctrine adds its own loss condition.

Castling requires the usual unmoved king/rook and empty intervening squares, but
attacked squares do not prohibit it. On the opponent's next move only, a move
to the castled king's original square or transit square captures that king,
including an ordinary capture of the rook on the transit square. The move must
otherwise follow piece geometry and the capturing player's drawback. The
opportunity expires after one reply. Pawn en passant also expires after one reply.

### Available drawbacks

| Drawback | Enforced rule |
|---|---|
| Castle Doctrine | Losing any rook immediately loses the game. |
| Centralized Command | A capture requires a king move on one of your previous three turns. |
| Even Keeled | Capture only on your even-numbered turns, starting at turn 1. |
| Alternator | Alternate pawn and non-pawn moves; either may go first. |
| Horse Tranquilizer | Knights cannot capture. |
| Cess | Moves cannot end on the h-file. |
| Fog of War | Only your pieces and their reachable squares are visible; forward pawn blockers are unknown occupants. |

Centralized Command uses completed personal turns: a king move on turn N enables
captures on turns N+1, N+2, and N+3. A king's first capture cannot enable itself.
Alternator classifies a promoting pawn move as a pawn move and castling as a
non-pawn move. Capturing a promoted rook also triggers Castle Doctrine.

### Fog of War

Visibility is recalculated from piece movement, not attacks on empty squares.
Your own pieces are always visible. Sliding pieces see to the first blocker
(an enemy there is visible), never through it. Pawns see their available forward
steps and diagonal captures; empty diagonals stay fogged unless another piece
can reach them. Pawn en passant and castling destinations are included.

An enemy blocking either available forward pawn step is shown as a `?`:
occupied and unmovable, but with no piece identity. A blocked first step prevents
seeing the second step. If another piece can reach the blocker, its identity is
shown normally. Fog does not alter movement or capture legality.

Opponent move history and last-move highlights are hidden while you have fog.
Opponent pieces do not slide from unseen origins, and king halos only reflect
visible attackers. Hidden pieces are omitted from the rendered board and square
accessibility labels, not merely covered with a translucent effect. During
local handoff (including the slide immediately before it), a fog game conceals
the whole board and move history until the next player confirms.

Revealing the drawback does not remove fog. Game over does: the full board and
history are then available. Reloading preserves the perspective. Like other
secrets in this local-only game, fog is not protected against inspecting
browser storage or JavaScript state.

The requested [official glossary](https://www.drawbackchess.com/glossary) was
unavailable during implementation. The original six rule meanings were cross-checked
against the community [all drawbacks list](https://www.chess.com/forum/view/general/all-drawbacks)
and [its expanded list](https://www.chess.com/forum/view/general/all-drawbacks?page=3).
Descriptions and interface are original, not copied site assets.
Fog of War implements the visibility behavior specified for this game.

## How the AI works

The game owns move generation; a standard chess library is never used to enforce
variant legality. Every submitted move, including engine output, is revalidated.

When the AI has Fog of War, it uses an observation-limited, one-ply heuristic,
not Stockfish. It scores only known captures and its own destinations from
the same visibility map as the UI. Unknown pawn blockers and unseen enemy
identities are never used for scoring; the full board is never sent to Stockfish
for that player. This policy is intentionally weaker than full-information AI.
An opponent without Fog of War still sees and analyzes the full board normally.

1. Take a legal king capture immediately if available.
2. Verify that the current board can be safely analyzed as orthodox chess.
   In particular, never send a position with an attacked non-moving king to
   Stockfish, which assumes such positions are impossible.
3. Intersect variant-legal moves with orthodox legal moves and send the resulting
   UCI list: `position fen ...`, then
   `go movetime 400 searchmoves e7e5 ...`.
4. Accept `bestmove` only if it belongs to that approved list.
5. If the position has no safe orthodox roots, use a small alpha-beta variant
   search. Worker errors/timeouts also use this fallback, with a visible warning
   and console error rather than silently pretending Stockfish succeeded.

**Limitations:** Stockfish evaluates future plies under standard chess rules.
`searchmoves` restricts the current move only. It does not teach Stockfish
drawbacks or king-capture rules. When Stockfish is applicable, non-orthodox root
moves are not searched. The fallback handles those positions but is weaker.
It models the opponent with no drawback, rather than cheating with the secret.
There is no claim of optimal play in this variant.

Integration reference: [Stockfish.js browser/UCI documentation](https://github.com/nmrugg/stockfish.js).
Stockfish.js is GPL-3.0; its license is distributed with the engine, and exact
source is available at [v19.0.1](https://github.com/nmrugg/stockfish.js/tree/v19.0.1).
Retain the license and satisfy GPL obligations when redistributing the engine or
a combined work. No Stockfish source changes are made here.
