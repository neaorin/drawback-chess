# Drawback Chess: Technical Documentation

[Back to the project overview](README.md)

Implementation details, gameplay conventions, testing, licensing, and deployment.

## Interface and behavior

Live human and computer moves play a short synthesized piece-move sound using
Web Audio, including captures, promotions, and castling (one sound per move).
The sound combines a noise impact with rapidly damped, inharmonic resonances
for a wooden clack; its short audio buffer is generated once and reused.
The icon-only speaker button beside the header theme switch toggles sounds.
Sound is enabled by default and the preference persists in browser storage.
Browsers require a user interaction to unlock audio; history review, reloading,
and starting a game do not play move sounds. No external audio assets are loaded.

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
On desktop, the board scales to fit the visible window, including player rows
and board controls, and resizes with the window. Pieces fill 92% of their
squares. Mobile uses compact player rows and places your drawback directly below
the board, ahead of history and other secondary controls. The board always fills
the available content width, including at the top of the page. Scrolling or browser
toolbar height changes do not resize it; changing the viewport width does.
On shorter screens, seeing the drawback card may require scrolling.
When present, the situational move restriction appears in a compact tinted strip
inside your drawback card, below the unchanging full rule. Mobile reserves
message space based on the rule text, with room for at least three message lines,
even when no message is shown. Changing or hiding the message does not resize the
board. Unusually long messages can scroll
within their reserved area rather than shifting the board.
If the message repeats the full rule exactly, only the description is shown.
Empty message space remains below the description, never between it and the name.
The board's light and dark square colors remain consistent in both UI themes.
When a game finishes, a dismissible results dialog shows the winner, reason,
and both players' drawbacks with difficulty levels beside their names. Review the
board or choose Play again. Reloading a finished save does not reopen it.
Use the toggle switch on the right of the header to switch between light and dark.
Your choice is saved locally; without a saved choice, the system theme is used.
This browser-based, local-first implementation is built with React, TypeScript,
and Vite, with all 181 glossary drawbacks and automatic game saving.

## Run

Requires Node.js 22.12+ (or a newer supported release).

```powershell
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` produces `dist`, and
`npm run preview` serves that production build. `npm test` runs rules and AI tests.
Unit tests live in `tests/*.test.ts`; browser tests live in `tests/*.spec.ts`.
Each runner discovers only its own test files.
`npm run test:e2e` runs browser tests against a production preview. It uses
installed Microsoft Edge on Windows; elsewhere run `npx playwright install chromium`
first. Run `npm run build` before the browser tests.

The install hook copies Stockfish's lite, single-threaded JavaScript, WASM, and
GPL license into `public/engine`. Both engine assets are served locally; gameplay
does not call an external AI service. Deploy the entire `dist` directory to a
static host that serves `.wasm` as `application/wasm`. No cross-origin isolation
headers are needed. Do not open the HTML using `file:`: workers need an HTTP host.

## Deploy to Azure Static Web Apps (Free)

The [deployment workflow](.github/workflows/deploy-static-web-app.yml) installs
dependencies with Node.js 24, runs unit tests and the type-checked production
build, then uploads `dist` without rebuilding it in Azure. Pushes to `master`
deploy to production; you can also run the workflow manually on `master` from
GitHub Actions. Pull requests do not create preview deployments.
The workflow allows 30 seconds per test for the exhaustive AI searches on
shared runners.
The [hosting configuration](public/staticwebapp.config.json) is copied into
`dist` by Vite and explicitly serves WebAssembly as `application/wasm`.

Install [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and
[GitHub CLI](https://cli.github.com/), then run these PowerShell commands.
Replace the subscription ID and, if desired, the resource names and region.
The app is created without Azure-generated GitHub integration because this
repository already supplies the workflow.

```powershell
az login
if ($LASTEXITCODE -ne 0) { throw 'Azure login failed.' }
az account set --subscription '<subscription-id>'
if ($LASTEXITCODE -ne 0) { throw 'Could not select the Azure subscription.' }
gh auth login
if ($LASTEXITCODE -ne 0) { throw 'GitHub login failed.' }

$resourceGroup = 'drawback-chess-rg'
$appName = 'drawback-chess'
$location = 'westeurope'
$repo = 'neaorin/drawback-chess'

az group create --name $resourceGroup --location $location --output none
if ($LASTEXITCODE -ne 0) { throw 'Resource group creation failed.' }

az staticwebapp create --name $appName --resource-group $resourceGroup `
  --location $location --sku Free --output none
if ($LASTEXITCODE -ne 0) { throw 'Static Web App creation failed.' }

$token = az staticwebapp secrets list --name $appName `
  --resource-group $resourceGroup --query properties.apiKey --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
  throw 'Could not retrieve the deployment token.'
}
try {
  $token | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo $repo
  if ($LASTEXITCODE -ne 0) { throw 'Could not save the GitHub Actions secret.' }
} finally {
  Remove-Variable token
}

$hostname = az staticwebapp show --name $appName `
  --resource-group $resourceGroup --query defaultHostname --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hostname)) {
  throw 'Could not retrieve the app hostname.'
}
Write-Host "App URL (available after deployment): https://$hostname"
```

The deployment token goes directly into a GitHub Actions repository secret;
do not print it or commit it. No Azure service principal or `AZURE_CREDENTIALS`
secret is needed.

Once these files are pushed to `master` and the secret is configured, trigger
the first deployment (or push another commit):

```powershell
gh workflow run deploy-static-web-app.yml --ref master --repo neaorin/drawback-chess
if ($LASTEXITCODE -ne 0) { throw 'Could not start the deployment workflow.' }
```

The Free plan includes an Azure hostname, HTTPS, and 100 GB/month bandwidth per
subscription, with a 250 MB limit per environment and no SLA or paid bandwidth
overage. No other Azure services are required. Custom domain registration, if
you want one, and GitHub Actions usage beyond its included allowance are
separate costs. See [Azure quotas](https://learn.microsoft.com/azure/static-web-apps/quotas).

## Play

Pieces use Colin M. L. Burnett's **Cburnett** SVG set, bundled locally and
unmodified under GPLv2+. White and black retain their original colors in both
themes. Attribution, source revision, and license are included in
`public/pieces/cburnett/CREDITS.md` and `COPYING.txt` and copied into the build.

- Play the computer as either color, or share a device using local pass & play.
- Use Resign to concede after confirmation. The opponent wins and both drawbacks
  are revealed. Against the computer you resign your own color, even during its
  turn; in local play the current player resigns.
- In the new game modal, choose Random (the default) or a specific drawback.
  Your choice applies to your selected color against the computer, or White in
  local pass & play. A second selector chooses the opponent's drawback (Black
  in local play) with the same options, difficulty colors and tooltips.
  Both initially default to independently Random. Reopening the modal remembers
  previous choices, including after reload; cancelling does not change the game. Explicitly choosing
  an opponent rule naturally reveals that choice to the person setting up the
  game, but does not automatically mark it as revealed in the game UI.
- The drawback selector labels difficulty with a colored square: Very easy
  (0–19, dark green), Easy (20–39, green), Medium (40–59, ochre), Hard
  (60–79, orange-red), and Very hard (80–100, dark red). The selected rule
  also shows a matching badge. Text labels remain available regardless of
  platform-specific native dropdown styling.
- Five difficulty-specific Random options choose only from the selected band.
  The original Random option still uses all drawbacks. Each player's random
  selection is independent.
- Individual drawback options include native hover tooltips explaining their
  rules. Tooltip display depends on the browser's native select menu; the
  selected drawback's description is also always shown below the dropdown.
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

The New Game dialog remembers opponent mode, player color, engine thinking time,
and both drawback selections (including random difficulty bands) in browser storage.
Choices are retained even when the dialog is closed without starting a game and
survive page reloads. Changing these choices does not change the current game.
While a drawback selector is focused, pressing a letter jumps to the first
individual drawback with that initial in catalogue order; random choices are
skipped (so R selects a drawback beginning with R).

There is no check, checkmate, stalemate, or fifty-move draw.
Moving into check, adjacent kings, ignoring threats, and moving pinned pieces
are legal. You lose when your king is captured or you start a turn without
legal moves. Individual drawbacks can add further loss conditions.

The third occurrence of a position automatically draws the game (no claim is
required). A separate notice appears beside the turn information on the second
occurrence, without replacing drawback guidance. Occurrences need not be consecutive,
and the initial position counts once. Repetition counts survive reloads and are
reconstructed from move history for older saves.

This is a board-based house rule: position strings compare piece types/colors/squares,
the side to move, castling rights, geometrically available pawn en passant, and special
castled-king capture rights. Hidden drawback state, piece identities, and move counters
are ignored, even if they change available moves. King capture, drawback losses, and
having no legal moves take precedence over a repetition draw.

Castling requires the usual unmoved king/rook and empty intervening squares, but
attacked squares do not prohibit it. On the opponent's next move only, a move
to the castled king's original square or transit square captures that king,
including an ordinary capture of the rook on the transit square. The move must
otherwise follow piece geometry and the capturing player's drawback. The
opportunity expires after one reply. Pawn en passant also expires after one reply.

### Available drawbacks

All **181 drawbacks** in the [Drawback glossary](https://www.drawbackchess.com/glossary)
are available in the new-game selector and in-game glossary. This includes
movement and capture restrictions, compulsory moves, randomized terrain and
turn restrictions, piece-specific memory, deadlines, and additional losses.
Each catalogue entry stores a `difficulty` from 0 to 100, extracted from the
archived indicator's `left` percentage with the decimal part discarded. The
top triangle (`top: 0px; transform: translateX(-50%)`) is the source of truth:
The catalogue retains subsequent rating corrections (Absolution is 27).
These are snapshot ratings, not recalculated from local games.

Some examples:

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

### Parameters, timing, and rule conventions

The archive contains templates rather than every instantiated rule. Targets,
colors, ranks, piece types, parity, and starting moves are assigned when a game
is created and substituted into the player's private description. Scheduled
windows start on a personal move from 6 through 12; square targets are in the
middle four ranks, Crusade uses one of the center four squares, and Secret Garden
uses two adjacent squares immediately in front of the player's starting pawns.
Rook on the Seventh always targets rank 7 for White and rank 2 for Black, even
in older saves whose stored rank was randomly assigned.
Blinded by the Sun selects only d4, d5, e4, or e5 in new games. A sun sprite
marks the target for its player, and for the opponent once revealed (or at game
over). Local handoff hides the marker. Existing saved targets are preserved.
Active Volcano selects only c4, d4, e4, f4, c5, d5, e5, or f5 in new games.
A volcano sprite marks its square with the same reveal and handoff privacy.
Its four orthogonal neighbors have a striped, dashed danger-zone highlight.
Existing saved volcano targets are preserved.
Secret Garden randomly selects two horizontally adjacent squares on rank 3 for
White or rank 6 for Black. Flower sprites mark both squares, and the situational
message names them. Both squares forbid your own landings; an opponent landing
on either one loses you the game. Flowers follow the same reveal, game-over,
and handoff privacy as other terrain. Saved garden anchors stay stable; older
single-square gardens gain their right neighbor (left neighbor for h-file anchors).
Bridge Over Troubled Water marks ranks 4 and 5 with blue river overlays except
for d4, e4, d5, e5, which remain normal-looking, legal landing squares.
These markers follow the same reveal and handoff privacy rules.
These assignments are saved and do not change when reloading or reviewing.
Per-turn random restrictions are likewise deterministic for a saved game.
Unlucky forbids exactly 32 destination squares each turn.
Those squares have a light red overlay on the affected player's turn, with no
additional turn message. The overlays are hidden during local handoff.

Situational messages show concise current move restrictions, active windows,
and approaching deadlines rather than repeating the drawback definition.
Permanent terrain and capture rules have no extra banner, except Secret Garden's
square-location message.
Reconnaissance lists all researched capture types and currently researching types,
excluding types already researched: “Can capture pawns, knights, researching queens.”
Velociraptor lists the capturable piece types moved on the opponent's last three
moves: “Can capture pawns, knights, rooks.” Before any opposing moves it shows
“Can capture none.”
Monkey See lists the piece types that currently have legal capture moves, for
example “Can capture with rooks, bishops.”
Unspooling always shows its remaining movement budget on the player's turn:
“Distance left: 100.” The budget uses only that player's accumulated move distances.
Three Check shows “Checks left: 3.” on the player's turn, counting down with
each received check; receiving the third check loses the game.
Conditional “if able” obligations appear only when a qualifying move exists. Queen
Disguise and The Scent of Blood provide hints for the selected piece.
Messages disappear during slides/handoff and at game over; historical review
uses the reviewed position's rule state.
Ooh Shiny, Simplifier, Escort Mission, and Evil Twin mark mandatory capture targets with a red dashed
highlight before selecting a piece. Markers hide when no preferred capture
exists, during handoff/slides, and on the opponent's turn.
Jumpy highlights all of the current player's attacked pieces, including those
that cannot move, using the same geometric attack definition as its rule.
These markers are private and hidden during handoff, slides, and game over.

Where the short glossary wording leaves details unspecified, this implementation
uses these conventions:

- Turns and deadlines count each player's own moves, starting at 1. A
  start-of-turn condition is checked after the opponent's reply; a "by move N"
  objective is checked at the end of personal move N.
- Adjacent includes diagonal neighbors. Distance is Manhattan distance (a
  four-square diagonal bishop move has distance 8). Left/right and advancement
  are relative to the player. Square colors and named ranks are absolute.
  Move-distance comparisons and budgets use the primary piece's displacement
  (the king for castling). "Captured on" refers to the destination square,
  including for pawn en passant.
- Required-if-able rules fall back to other moves only when no preferred move
  exists. An unconditional requirement with no matching move loses the game.
- Attacks and defended squares use movement geometry, not the opponent's hidden
  capture restrictions. Three Check counts opponent moves ending in check,
  even if the king was already attacked.
- The river occupies ranks 4 and 5, with crossings restricted to the d/e files;
  pieces cannot land on the river except on d4, e4, d5, e5 (the bridge).
  Knights only require dry start and end squares, including the bridge;
  intervening water does not restrict their jumps.
  Water rises from each player's home rank.
  Thunderdome is the central 4-by-4 area (c3–f6), marked with a light reddish
  background. Like other terrain, it stays private until revealed, hides during
  local handoff, and is visible to both players after game over.
- A queen retains its queen identity and artwork under Drag, Queen Disguise,
  and Shapeshifter; its available destinations enforce its altered movement.
  Promoted queens use the same player's Shapeshifter form.
- A king capture wins immediately. Otherwise a move triggering both players'
  drawback losses penalizes the mover first.

The right pane shows the current restriction or randomized instruction before
each turn. Targets and schedules remain private until the drawback is revealed.
The same rules apply to human and computer players, including castling,
promotions, ordinary en passant, and the variant's king en passant.

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

Rule definitions follow the supplied November 4, 2026 archive of the
[official glossary](https://www.drawbackchess.com/glossary).
Fog of War intentionally retains the visibility behavior specified for this
game rather than the archive's simpler hidden-enemy-pieces wording.

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
   Before intersecting, exclude moves that immediately lose under the AI's own
   drawback when a surviving alternative exists (for example, missing Inching
   Forward's king-advancement deadline). If all surviving moves are non-orthodox,
   use variant search instead. This check ignores the opponent's hidden drawback
   and does not change the moves a human is allowed to play.
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

**Ichthyophobe** prepares an engine-selected forbidden move before allowing the
turn to begin. This also runs for human players. The forbidden choice is saved
so reload and history cannot reroll it. If Stockfish cannot safely analyze the
variant position, the variant engine supplies the forbidden move instead and
the UI explicitly reports that substitution. Computer players with Drag or
Shapeshifter use variant search because standard Stockfish cannot model their
own queen geometry. It still does not model an opponent's hidden restriction.

Integration reference: [Stockfish.js browser/UCI documentation](https://github.com/nmrugg/stockfish.js).
Stockfish.js is GPL-3.0; its license is distributed with the engine, and exact
source is available at [v19.0.1](https://github.com/nmrugg/stockfish.js/tree/v19.0.1).
Retain the license and satisfy GPL obligations when redistributing the engine or
a combined work. No Stockfish source changes are made here.
