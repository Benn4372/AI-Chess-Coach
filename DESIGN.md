# Chess Coach AI — Design Document

## Overview

A single-page web application hosted on GitHub Pages that acts as a patient, Grandmaster-level chess coach. It analyzes games in real time using a dual-intelligence system: a **Tactical Referee** for immediate threats and a **Strategic Mentor** for long-range planning. The coach translates raw engine evaluations into clear, human insights — never cold numbers.

The entire application runs client-side in a single `index.html` file (plus supporting assets), requiring no backend server.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                       │
│                                                 │
│  ┌───────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Chessboard│  │  Engine    │  │  Coach AI  │ │
│  │    UI     │◄─┤  Worker    │◄─┤  (LLM API) │ │
│  │(chessboard│  │ (Stockfish │  │            │ │
│  │   .js)    │  │   WASM)    │  │            │ │
│  └───────────┘  └────────────┘  └────────────┘ │
│        │                              │         │
│  ┌─────▼──────────────────────────────▼───────┐ │
│  │            Game State Manager              │ │
│  │  (chess.js — move validation, PGN, FEN)    │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Core Dependencies (all client-side)

| Library | Purpose | Delivery |
|---|---|---|
| [chess.js](https://github.com/jhlywa/chess.js) | Move validation, PGN/FEN parsing, game state | CDN / bundled |
| [chessboard.js](https://chessboardjs.com/) or [cm-chessboard](https://github.com/shaack/cm-chessboard) | Interactive board rendering | CDN / bundled |
| [Stockfish WASM](https://github.com/niclas8/stockfish.wasm) | Position evaluation via Web Worker | Self-hosted WASM |
| Claude API (Anthropic) | Natural-language coaching responses | User-provided API key, called from browser |

### API Key Handling

The user provides their own Anthropic API key, stored **only** in `localStorage` (never transmitted anywhere except the Anthropic API). A clear prompt explains this on first visit. The key can be cleared at any time.

---

## Phases of Implementation

### Phase 1 — Static Board & Game State

**Goal:** A playable chessboard on a styled HTML page.

**Steps:**

1. **Scaffold `index.html`** with semantic HTML structure:
   - Header (title, skill-level selector, settings gear icon)
   - Main area split: board (left/center), coach panel (right)
   - Footer (credits, GitHub link)

2. **Integrate chessboard.js** for drag-and-drop piece movement.
   - Board resizes responsively (CSS grid / flexbox).
   - Light/dark theme toggle using CSS custom properties.

3. **Integrate chess.js** for legal move validation.
   - Wire board's `onDrop` callback to `chess.move()`.
   - Display move history in a scrollable notation panel (algebraic notation for advanced users, descriptive for beginners based on setting).

4. **PGN Import/Export:**
   - "Import PGN" button opens a textarea modal; paste a game and replay it move-by-move.
   - "Export PGN" copies the current game to clipboard.

5. **Board Controls:**
   - Flip board, reset, undo move, step forward/back through move history.

**Deliverable:** A fully playable local chess board with no AI yet.

---

### Phase 2 — Engine Integration (Stockfish WASM)

**Goal:** Real-time position evaluation running entirely in the browser.

**Steps:**

1. **Set up Stockfish Web Worker:**
   - Load `stockfish.wasm` in a dedicated Web Worker to avoid blocking the UI thread.
   - Communicate via `postMessage` — send FEN positions, receive evaluation lines.

2. **Evaluation Pipeline:**
   - After every move (player or opponent), send the current FEN to the worker.
   - Parse Stockfish's `info` lines to extract:
     - `score cp` (centipawn evaluation) or `score mate` (mate-in-N)
     - `pv` (principal variation — the engine's best line)
     - `depth` (search depth reached)
   - Normalize the score to always be from the player's perspective.

3. **Evaluation Bar:**
   - Vertical bar on the side of the board, white-to-black gradient.
   - Smoothly animates as evaluation changes.
   - On hover, shows the raw centipawn value (for advanced users).

4. **Move Classification Engine:**
   - Compare evaluation before and after the player's move.
   - Classify the delta into zones:
     - **Brilliant/Great** (eval improved significantly or found the engine's top move)
     - **Good/Book** (eval stayed stable, ≤ 0.3 pawn loss)
     - **Inaccuracy** (0.3–1.0 pawn loss)
     - **Mistake** (1.0–2.5 pawn loss)
     - **Blunder** (> 2.5 pawn loss or missed mate)
   - Color-code the move in the notation panel (green/yellow/orange/red).

5. **Performance Settings:**
   - Let users choose engine depth (10–20) and number of lines (1–3) to balance speed vs. accuracy on their hardware.

**Deliverable:** The board now silently evaluates every position and classifies moves by quality.

---

### Phase 3 — The Coach AI (LLM Integration)

**Goal:** Transform engine data into human coaching via the Claude API.

**Steps:**

1. **API Key Setup Flow:**
   - First-visit modal: "Enter your Anthropic API key to enable coaching."
   - Store in `localStorage`. Show a "Key saved" indicator. Provide a "Clear key" button.
   - If no key is set, the board still works — coaching panel just shows a prompt to add one.

2. **Build the Coaching Prompt System:**
   - Construct a detailed system prompt that encodes the coach's personality, the triage mindset, and the dual-persona behavior described in the spec.
   - The system prompt includes:
     - The player's selected skill level (beginner / intermediate / advanced)
     - Instructions to avoid coordinate notation for beginners
     - The Socratic method rules for blunders
     - The strategic/positional vocabulary for subtle mistakes

3. **Context Window per Move:**
   - On each classified move, build a user message containing:
     - Current FEN
     - The move just played (in algebraic and descriptive form)
     - The engine's evaluation before and after the move
     - The engine's best line (PV) as context
     - The move classification (great / inaccuracy / mistake / blunder)
     - The full move history so far (for opening identification)
   - Send to Claude API with the system prompt.

4. **Triage Logic (when to call the API):**
   - The coach only speaks when it has something to **teach**, not just something to point out.
   - **Coach speaks:**
     - Positional inaccuracies where the *why* is invisible (weakened squares, misplaced pieces, wrong pawn structure). These are the moves players never learn from on their own.
     - Brilliant moves worth reinforcing (explain the concept, not just that it was good).
     - Phase transitions (entering an endgame, position shifting from closed to open).
     - The player explicitly clicks "Coach me on this move."
   - **Coach stays silent (icon/eval bar only):**
     - Obvious blunders (hung pieces, walked into a fork) — the blunder icon and eval drop are self-explanatory. The player already knows they messed up.
     - Book moves / solid play — no news is good news.
     - Forced moves (recaptures, escaping check) — no real decision was made.
   - This design mirrors real coaching: a good coach never says "you dropped your queen." They focus on the subtle mistakes you'd never notice alone.

5. **"Coach Me" Button:**
   - A prominent button below or beside the board, always visible.
   - Clicking it requests coaching on the *current position*, regardless of move classification.
   - This is the player's primary way to get feedback, since the auto-triage intentionally stays silent on most moves.
   - If the position is after an obvious blunder, the coach still responds (the player explicitly asked) — but focuses on the lesson, not the obvious mistake.
   - If the position is fine, the coach gives a brief strategic read: "You're solid here. Your pieces are active, your king is safe. The question is where to create a pawn break."
   - Rate-limited to prevent accidental spam (1 request per 5 seconds).

6. **Consequence Visualization:**
   - When the coach explains why a move was bad (or good), it doesn't just describe the future — it **shows it on the board**.
   - The coach's response includes a sequence of moves (the engine's main line or a critical variation).
   - These render as a clickable "Show me" button in the coach panel.
   - Clicking it animates the moves on the board in sequence (1 move per second), with a ghost/transparent style to distinguish it from the actual game.
   - The player sees their pawn structure crumble, the enemy knight land on the weak square, or the rook infiltrate the open file — the consequence becomes visceral, not abstract.
   - A "Back to game" button restores the actual position.
   - Implementation: parse the PV (principal variation) from Stockfish, pass it to Claude for the explanation, render the sequence using chess.js to validate and chessboard.js to animate.

7. **Coach Panel UI:**
   - Right sidebar with chat-bubble styling.
   - Coach messages appear with a subtle animation (fade-in).
   - Each message is tagged with the move number it references.
   - Clicking a past coach message highlights that position on the board.

8. **Response Handling:**
   - Stream the Claude response (SSE) so text appears progressively.
   - "Show me" variation buttons are interactive — they take over the board temporarily.

**Deliverable:** A fully functional AI chess coach that speaks when it has something to teach, responds on demand, and shows you the consequences of your moves visually.

---

### Phase 4 — Opening & Endgame Specialists

**Goal:** Deep support for the two most teachable phases of chess.

**Steps:**

1. **Opening Book Integration:**
   - Bundle a lightweight opening book (ECO codes → opening names + descriptions).
   - After 4–6 moves, identify the opening being played.
   - Display the opening name and a one-line philosophy in the coach panel.
   - If the player deviates from book lines, the coach explains what the "main idea" was and whether the deviation is reasonable.

2. **Endgame Pattern Recognition:**
   - Detect endgame phase (≤ 6 non-pawn pieces remaining, or queens traded).
   - Switch coach prompt to endgame-specialist mode:
     - Focus on king activity, pawn structure, opposition, zugzwang.
     - Simplify language further: "Your king needs to get in front of the pawn."
   - Detect known endgame types (K+P vs K, rook endings, bishop vs knight) and teach the relevant principles.

3. **Opening Explorer (optional stretch):**
   - After importing a PGN, show a mini tree of the most common continuations from the current position (using a bundled database or Lichess API for stats).

**Deliverable:** The coach has deep awareness of opening theory and endgame principles.

---

### Phase 5 — Play vs. Computer & Post-Game Review

**Goal:** Let the user play against Stockfish and review completed games.

**Steps:**

1. **Play vs. Computer Mode:**
   - Player chooses color and difficulty (Stockfish depth 5–20).
   - Stockfish plays the opponent's moves automatically after a brief "thinking" delay.
   - Coach operates in real-time during the game.

2. **Post-Game Review Mode:**
   - After a game ends (or a PGN is imported), switch to review mode.
   - Auto-analyze every move: run Stockfish evaluation on each position.
   - Generate a move-by-move timeline with color-coded classifications.
   - Summary stats: accuracy %, number of blunders/mistakes/inaccuracies, best move found %.
   - The player can step through the game and request coaching on any move.

3. **Game Report:**
   - At the end of a review, generate a "Game Report" via Claude:
     - Overall strengths shown in this game.
     - Recurring weaknesses (e.g., "You consistently undervalued bishop activity").
     - Top 3 positions to study from this game.
     - A suggested topic to practice.

**Deliverable:** A complete play-and-learn experience.

---

### Phase 6 — Polish, Accessibility & Deployment

**Goal:** Production-ready, accessible, fast, and deployed to GitHub Pages.

**Steps:**

1. **Performance:**
   - Lazy-load Stockfish WASM (don't block initial paint).
   - Cache API responses in `sessionStorage` so stepping back/forward doesn't re-call the API.
   - Debounce rapid move sequences (e.g., clicking through a PGN quickly) before calling the engine.

2. **Accessibility:**
   - Full keyboard navigation for the board (arrow keys to select square, enter to move).
   - ARIA labels on all interactive elements.
   - Screen-reader-friendly move announcements.
   - High-contrast mode.

3. **Responsive Design:**
   - Mobile layout: board on top, coach panel below (stacked).
   - Touch-friendly piece dragging.
   - Minimum viable experience on 375px-wide screens.

4. **Theming:**
   - Light / Dark / Auto (system preference) theme toggle.
   - Board color schemes (classic green/cream, blue, wood).

5. **GitHub Pages Deployment:**
   - All assets in the repo root or `/assets` folder.
   - `index.html` as the entry point.
   - Enable GitHub Pages from the `main` branch.
   - Add a `CNAME` file if using a custom domain.

6. **Documentation:**
   - `README.md` with screenshots, feature list, and setup instructions.
   - In-app help modal explaining how the coach works and how to get an API key.

**Deliverable:** A polished, deployable chess coaching website.

---

## File Structure

```
Chess Coach/
├── index.html              # Single-page application entry point
├── style.css               # All styles (themes, layout, responsive)
├── app.js                  # Main application logic
├── engine-worker.js        # Stockfish Web Worker wrapper
├── coach.js                # LLM integration, prompt construction, triage
├── openings.json           # Lightweight ECO opening book
├── assets/
│   ├── pieces/             # SVG piece images
│   ├── sounds/             # Move, capture, check sounds
│   └── stockfish/          # Stockfish WASM files
├── DESIGN.md               # This document
└── README.md               # User-facing documentation
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Client-side only** | GitHub Pages is static hosting. No server means no cost, no auth backend, no latency for engine eval. |
| **User-provided API key** | Avoids needing a proxy server. The key stays in `localStorage` and is sent only to the Anthropic API. |
| **Stockfish WASM in a Web Worker** | Heavy computation must not block the UI. Workers run on a separate thread. |
| **Triage-based API calls** | The coach only speaks when it can teach something — obvious blunders get an icon, not a paragraph. This cuts API calls drastically and mirrors how real coaches behave. |
| **Skill-level adaptation** | A single system prompt parameter changes the entire coaching vocabulary and approach. |
| **No frameworks** | Vanilla HTML/CSS/JS keeps the bundle small, avoids build steps, and makes GitHub Pages deployment trivial. |

---

## Coaching Prompt Architecture

The system prompt is the soul of the coach. It is structured in layers:

```
Layer 1: Persona
  "You are a Grandmaster chess coach with infinite patience..."

Layer 2: Skill Calibration
  "The player's level is [beginner/intermediate/advanced].
   For beginners: no algebraic notation, use analogies...
   For advanced: use technical terms, discuss prophylaxis..."

Layer 3: Triage Mode
  "You are responding to a [GREAT_MOVE / POSITIONAL_INACCURACY / PHASE_TRANSITION].
   For GREAT_MOVE: validate the concept, not just the move...
   For POSITIONAL_INACCURACY: explain the invisible long-term cost...
   For PHASE_TRANSITION: reframe what matters now...
   You are NEVER called for obvious blunders — those are handled by the UI."

Layer 4: Game Context
  "Current opening: Sicilian Defense, Najdorf Variation.
   We are in the [opening / middlegame / endgame] phase.
   The position is [equal / slightly better for white / winning for black]."
```

The user message per move contains the raw data:
```
FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR
Move played: e4 (King's pawn forward two squares)
Eval before: +0.2 | Eval after: -1.8
Engine's best move was: d4
Classification: POSITIONAL_INACCURACY
Move number: 12
Recent moves: 8. Bg5 Be7 9. Bxf6 Bxf6 10. Nd5 ...
Opening: Sicilian Najdorf
```

Note: only the last 5-6 moves are sent (not the full game), and the engine's best move (not the full PV line) — this keeps token count minimal.

---

## Cost Optimization Strategy

| Technique | Savings | Notes |
|---|---|---|
| **Prompt caching** | ~90% on system prompt | The persona/rules prompt is identical every call — Anthropic's cache makes repeat calls near-free. |
| **Silent on obvious blunders** | ~40-50% fewer API calls | Hung pieces, walked into forks — the icon says it all. No API call needed. |
| **Skip forced moves** | ~10-15% fewer calls | Recaptures, escaping check — no decision was made, nothing to teach. |
| **Trimmed context** | ~60% fewer tokens per call | Send last 5-6 moves + opening name, not the full move list. Send best move, not full PV. |
| **Batched post-game review** | ~70% fewer calls in review | Send 5-10 positions per API call instead of one at a time. |
| **Haiku for triage** | ~60x cheaper per decision | Use Haiku to decide *if* a move deserves commentary. Only call Sonnet to write the actual coaching. |

**Estimated cost per game:** ~$0.03-0.08 for a 40-move game (down from ~$0.50 naive approach).

---

## Phase 7 — Cross-Game Intelligence (Backend)

This phase moves beyond single-game coaching into **pattern recognition across your playing history**. This is where the coach stops being a tool and starts feeling like a person who actually knows you.

### Architecture Change

Phases 1-6 are fully client-side. Phase 7 introduces a lightweight backend:

```
┌──────────────┐       ┌──────────────────────────┐
│   Browser    │◄─────►│   Backend (Node/Python)  │
│  (Frontend)  │  API  │                          │
└──────────────┘       │  ┌────────────────────┐  │
                       │  │  Player Profile DB  │  │
                       │  │  (SQLite / Postgres) │  │
                       │  └────────────────────┘  │
                       │  ┌────────────────────┐  │
                       │  │  Analysis Worker    │  │
                       │  │  (Stockfish batch)  │  │
                       │  └────────────────────┘  │
                       │  ┌────────────────────┐  │
                       │  │  Claude API         │  │
                       │  │  (cross-game coach) │  │
                       │  └────────────────────┘  │
                       └──────────────────────────┘
```

Hosting options: Railway, Fly.io, or a simple VPS. The API key now lives server-side, which also removes the user-facing API key friction from Phase 3.

---

### 7A — Player Profile & Weakness Tracking

**What a real coach does:** After watching 10 of your games, a GM doesn't treat you as a stranger anymore. They say "You keep doing this."

**How it works:**

1. **Game Storage:**
   - Every completed or imported game is saved with its full Stockfish analysis (per-move eval, classification, best moves).
   - Stored per-player in the database with metadata: date, time control, opening, result, accuracy %.

2. **Weakness Extraction (batch job after each game):**
   - Categorize every mistake/inaccuracy by *type*, not just severity:
     - **Tactical patterns:** missed forks, missed pins, missed skewers, missed back-rank threats, missed discovered attacks
     - **Positional themes:** bad pawn pushes, passive piece placement, ignoring open files, premature exchanges, weak square creation
     - **Phase-specific:** opening deviations that backfired, endgame technique failures (wrong rook placement, king activity lapses, pawn race miscalculations)
     - **Time-pressure patterns:** if time data is available (from Lichess imports), flag mistakes that cluster in the last 2 minutes
   - Each type gets a **frequency score** (how often you make this kind of mistake) and a **trend** (improving, stable, or getting worse).

3. **Player Profile Summary:**
   - A structured JSON profile generated after every game:
     ```json
     {
       "games_analyzed": 14,
       "overall_accuracy": 72.3,
       "accuracy_trend": "improving",
       "top_weaknesses": [
         {"type": "missed_forks", "frequency": "3 in last 10 games", "trend": "stable"},
         {"type": "passive_bishops", "frequency": "6 in last 10 games", "trend": "worsening"},
         {"type": "endgame_king_activity", "frequency": "4 in last 10 games", "trend": "improving"}
       ],
       "top_strengths": [
         {"type": "pawn_structure", "note": "Rarely creates weaknesses"},
         {"type": "opening_preparation", "note": "Stays in book lines consistently"}
       ],
       "opening_repertoire": {
         "white": {"e4": 8, "d4": 6},
         "black_vs_e4": {"sicilian": 5, "french": 3},
         "black_vs_d4": {"kings_indian": 4}
       }
     }
     ```
   - This profile is injected into the system prompt so the coach's commentary is informed by your history.

---

### 7B — Personalized Coaching That Remembers

**The difference:** Instead of "that bishop is passive," the coach now says "This is the same pattern from your game on Tuesday — you keep placing your dark-squared bishop behind your own pawns. Three of your last ten games had this issue."

**Implementation:**

1. **Profile-Aware System Prompt:**
   - The player profile summary (above) is appended to the system prompt.
   - The coach is instructed: "When the player makes a mistake that matches a recurring weakness, reference the pattern explicitly. When they avoid a past weakness, praise the improvement."

2. **Contextual Callbacks:**
   - When a positional inaccuracy triggers the coach, the backend checks the weakness database for matches.
   - If the current mistake matches a recurring pattern, the prompt includes: "This mistake matches the player's known weakness: passive_bishops (seen in 6 of last 10 games, trend: worsening)."
   - This lets Claude say something genuinely useful: "I've seen you do this before — you're comfortable developing the bishop early, but you keep putting it on e7 where your own pawns block it. Try fianchettoing it to g7 in the King's Indian — it belongs on the long diagonal, not tucked behind your center."

3. **Progress Acknowledgment:**
   - When accuracy trends upward or a specific weakness frequency drops, the coach celebrates it: "Your king activity in endgames has gotten noticeably better over your last few games. That rook ending you won last Thursday — three months ago you would have drawn that."

---

### 7C — Personalized Training Plans

**What a real coach does:** They assign homework. Not generic puzzles — targeted exercises that attack your specific weaknesses.

**Implementation:**

1. **Weekly Training Plan Generation:**
   - After every 5 games (or weekly, whichever comes first), the backend sends the player profile to Claude with the prompt: "Based on this player's weakness profile, generate a focused training plan for the next week."
   - The plan includes:
     - **Tactical drills:** Puzzles filtered by the player's weak tactical patterns (e.g., "You missed 3 forks — here are 10 fork puzzles at your level").
     - **Positional exercises:** Specific positions to study that illustrate the player's recurring positional mistakes.
     - **Opening homework:** If the player keeps deviating from their openings with poor results, suggest studying 3-5 key positions in that line.
     - **Endgame drills:** If endgame technique is weak, assign specific endgame positions (K+P vs K, rook endings, etc.).

2. **Puzzle Sourcing:**
   - Bundle a subset of the Lichess puzzle database (open source, millions of puzzles tagged by theme).
   - Filter puzzles by: theme (fork, pin, discovered attack), rating (matched to player level), and relevance to the player's weakness profile.

3. **Drill Mode UI:**
   - A "Training" tab alongside "Play" and "Review."
   - Shows the current training plan with progress bars.
   - Puzzles are presented on the board with the coach reacting to attempts.

---

### 7D — Opening Repertoire Coach

**What a real coach does:** They don't just name your opening — they track your repertoire, spot where you keep going wrong, and suggest improvements.

**Implementation:**

1. **Repertoire Tree:**
   - Aggregate the player's last 20+ games to build a personal opening tree.
   - For each branch, store: games played, win/draw/loss ratio, average accuracy in that line.

2. **Repertoire Gaps:**
   - Identify lines where the player consistently scores poorly or deviates early.
   - "You've played the Najdorf 5 times but you only know the main line up to move 7. After 7...Qb6, your accuracy drops from 78% to 54%. Let's look at the critical position."

3. **Preparation Suggestions:**
   - Before a game (if the player indicates their opponent's style or rating), suggest which opening to play and which traps to watch for.
   - "Against lower-rated players who play e4, your Sicilian has a 70% win rate. Stick with it."

---

### 7E — Psychological & Time-Management Patterns

**What a real coach does:** They notice that you collapse under pressure, or that you play too fast in winning positions.

**Implementation:**

1. **Momentum Analysis:**
   - Track eval swings within games. Detect patterns like:
     - "Collapser": plays well until gaining a big advantage, then makes mistakes (can't convert winning positions).
     - "Comeback kid": plays poorly early but recovers well in complex positions.
     - "Tilt": after one blunder, makes 2-3 more in quick succession.
   - The coach addresses the pattern: "You were up a full piece and then played three inaccurate moves in a row. This has happened in 4 of your last 10 games. When you're winning, slow down. The position isn't going anywhere."

2. **Time-Pressure Analysis (Lichess import):**
   - Lichess game exports include move timestamps.
   - Correlate accuracy with remaining clock time.
   - "Your accuracy in the last 2 minutes of your games is 41%, versus 74% with more than 5 minutes. You might benefit from playing longer time controls while you're learning."

3. **Pre-Game Mindset Prompt:**
   - Based on patterns, show a brief coaching note before the game starts:
   - "Reminder: when you get a big advantage today, take a deep breath before each move. You've been rushing in winning positions."

---

### 7F — Progress Dashboard

**A long-term view of improvement.**

1. **Accuracy Over Time Chart:**
   - Line graph of game accuracy % over the last 30/60/90 days.
   - Trendline showing overall improvement trajectory.

2. **Weakness Heatmap:**
   - Grid of weakness categories, color-coded by current frequency.
   - Click a category to see the specific positions where it occurred.

3. **Milestone System:**
   - "You've gone 5 games without a missed fork" — mark it, celebrate it.
   - "Your endgame accuracy has improved 12% this month."
   - Not gamified with points/badges — stated as facts, the way a coach would.

4. **Monthly Report:**
   - AI-generated summary of the month's progress, biggest improvements, and remaining focus areas.
   - "This month you played 22 games. Your biggest improvement was in rook endgames — you converted 3 won positions that you would have drawn a month ago. Your main area to work on is still bishop activity in closed positions."

---

## Revised Architecture Summary

| Component | Phases 1-6 (Client-Only) | Phase 7+ (With Backend) |
|---|---|---|
| Board & game logic | Browser (chess.js) | Same |
| Engine evaluation | Browser (Stockfish WASM) | Browser for live play, server for batch analysis |
| Single-game coaching | Browser → Claude API | Browser → Backend → Claude API |
| Cross-game analysis | N/A | Backend batch job |
| Player profile | N/A | Database (SQLite/Postgres) |
| API key management | localStorage (user provides) | Server-side (user authenticates instead) |
| Training plans | N/A | Backend → Claude API (weekly generation) |
| Hosting | GitHub Pages (free) | GitHub Pages + backend (Railway/Fly.io ~$5-10/mo) |

---

## Stretch Goals (Post-MVP)

- **Voice Mode:** Text-to-speech for coach messages (Web Speech API).
- **Multiplayer Spectating:** Paste a Lichess game URL and get live coaching.
- **Lichess OAuth Integration:** Import games directly from a Lichess account and auto-populate game history.
- **Study Groups:** Share your training plan or game review with a friend/coach for collaborative analysis.
- **Mobile App Wrapper:** Package the web app in a lightweight WebView shell for iOS/Android.
