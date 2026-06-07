# RPS Roulette — End-to-End Implementation Prompt

> Hand this document to a coding agent (or build from it directly). It is a
> complete PRD + implementation spec for building, testing, and deploying the
> game. Read it top to bottom before writing code.

---

## 0. One-paragraph pitch

**RPS Roulette** is online Rock-Paper-Scissors with the rules randomized every round.
Instead of the fixed 3-way cycle (rock beats scissors beats paper beats rock),
each round reveals a brand-new **tournament** — a complete directed graph on a
random number of randomly-labeled nodes, with a random direction on every edge.
An arrow `A → B` means "A beats B." Two players each secretly pick a node; the
direction of the edge between their picks decides the round. Same node = tie.
A fresh graph is generated every round, so there is no memorizable strategy —
only reading the graph and out-guessing your opponent.

> Graph-theory note (this is the whole gimmick): a *tournament* is the technical
> term for a complete graph with a direction on every edge. Classic RPS is just
> the 3-node cyclic tournament. RPS Roulette generalizes it to a random tournament of
> random size each round.

---

## 1. Why this is actually a game (not just coin flips)

Each node has an **out-degree** = how many other nodes it beats. Picking the
highest-out-degree node maximizes your chance of beating a *random* opponent —
but a thinking opponent knows that too, so they pick it as well and you tie.
The optimal play is a **mixed strategy** over nodes (for the 3-cycle it's the
uniform 1/3-1/3-1/3 of normal RPS; for larger random tournaments it's a
non-trivial distribution related to the tournament's "maximal lottery"). The
point: there is genuine read-your-opponent depth, but every round the board is
new, so it stays fast and bluff-y. Keep gameplay dead simple; this paragraph is
flavor/justification, not a feature to implement.

---

## 2. Scope & non-goals

**In scope (MVP):**
- Two-player real-time matches.
- Minimal lobby: create a room (get a shareable code/link) or join by code. No
  accounts, no login, no persistence beyond the live match.
- Server-authoritative round engine (generates graphs, hides picks until both
  are in, resolves winners).
- Clean SVG rendering of the directed graph with readable arrows.
- Best-of-N match, rematch button, deploy to fly.io.

**Explicit non-goals (do NOT build for MVP):**
- No login / accounts / database / persistent ratings.
- No more than 2 players per match.
- No chat, no spectators, no replays, no sound (listed as nice-to-haves below).
- No mobile-perfect polish (but the layout should not be broken on a phone).

---

## 3. Game rules (precise spec)

### 3.1 Round generation
- `N` = node count, random integer in **[5, 7]** (configurable `MIN_NODES`,
  `MAX_NODES`).
- Labels: pick `N` distinct labels from a curated pool (see §3.4). Each round
  re-draws labels so the same shape isn't memorizable.
- Edges: for every unordered pair `{i, j}` (i < j), flip a fair coin to set the
  direction — either `i → j` or `j → i`. This yields a complete tournament: every
  pair has exactly one directed edge. Store as an `N×N` boolean adjacency matrix
  where `beats[i][j] === true` means node `i` beats node `j`
  (so `beats[i][j] !== beats[j][i]` for all `i ≠ j`, and `beats[i][i] === false`).

### 3.2 Picking & resolution
- Both players secretly choose one node index in `[0, N)`.
- Resolution given picks `a` (player 1) and `b` (player 2):
  - `a === b` → **tie**, no winner this round.
  - `beats[a][b]` → **player 1 wins** the round.
  - else (`beats[b][a]`) → **player 2 wins** the round.
- A tie does not award a point; the round counter still advances (or, optionally,
  ties replay the same scoring — pick one and document it; default: tie = no
  point, advance round).

### 3.3 Match structure
- Best-of: first player to **`WINS_TO_WIN` = 5** round wins takes the match
  (configurable). Display running score + round number.
- Per-round pick timer: **`ROUND_TIMER_MS` = 20000**. If a player hasn't picked
  when it expires, auto-pick a **uniformly random** node for them (do NOT forfeit
  — keep it light). Both timers run from the moment the round's graph is shown.
- After a match ends: show winner + a **Rematch** button. Rematch keeps both
  players in the same room and resets the score.

### 3.4 Label pool
Use short, glanceable, visually-distinct labels. Default pool = single uppercase
letters `A`–`Z` (clean, always readable). Provide an alternate emoji pool behind
a constant so it's easy to swap (e.g. 🔥💧🌿⚡🪨🌪️🌙☀️). Labels are cosmetic only;
the engine works on indices.

---

## 4. Tech stack (mirror the `wallgame` project under `~/nil/wallgame`)

- **Runtime:** [Bun](https://bun.sh) (latest 1.2.x).
- **Server:** [Hono](https://hono.dev) + Bun's native WebSocket via
  `createBunWebSocket` from `hono/bun`. Export `{ fetch, websocket }` as the
  default Bun server object (see wallgame's `server/index.ts` for the exact
  wiring pattern).
- **Frontend:** React 19 + Vite + TypeScript. Graph drawn with hand-rolled
  **SVG** (no graph library). Plain CSS or CSS modules — keep dependencies
  minimal; do not add Tailwind unless trivial.
- **Shared:** a `shared/` directory holding the pure game logic and the
  client⇄server message types, imported by both server and frontend. This is the
  key reuse boundary — the tournament generator and resolver live here and are
  unit-tested in isolation.
- **State:** entirely **in-memory** on the server (a `Map` of rooms). No
  database. This is acceptable because matches are ephemeral and there is no
  login. ⚠️ Consequence: the app must run on **exactly one fly.io machine** (see
  §8) so all players hit the same in-memory state.
- **Tooling:** Prettier + ESLint + a `tsconfig`. Match wallgame's config style
  where reasonable.

---

## 5. Project structure

```
rps-roulette/
├── PROMPT.md              # this file
├── README.md             # short: what it is + how to run/deploy
├── package.json          # root: server + scripts (start/dev/test/build/ci)
├── tsconfig.json
├── fly.toml
├── Dockerfile
├── .dockerignore
├── .gitignore
├── shared/
│   ├── tournament.ts     # generateTournament, resolveRound, outDegrees — PURE
│   └── protocol.ts       # all WS message types (client→server, server→client) + room/match types
├── server/
│   ├── index.ts          # Hono app, static serving of frontend/dist, WS upgrade, Bun export
│   ├── rooms.ts          # in-memory room store: create/join by code, presence, cleanup
│   ├── match.ts          # authoritative match state machine: round lifecycle, timers, resolution
│   └── socket.ts         # WS connection handling: parse/dispatch messages, broadcast to room
├── frontend/
│   ├── package.json
│   ├── vite.config.ts    # dev proxy /api + /ws → :3000; build to dist
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx           # top-level router between Lobby and Game views
│       ├── net/socket.ts     # typed WS client wrapper (connect, send, onMessage, reconnect)
│       ├── components/
│       │   ├── Lobby.tsx         # create / join / name entry / share link
│       │   ├── Game.tsx          # match HUD: score, round, timer, status, rematch
│       │   ├── TournamentGraph.tsx  # SVG nodes-on-a-circle + directed-edge arrows + pick interaction
│       │   └── RoundResult.tsx   # reveal overlay: both picks, deciding edge, winner
│       └── styles.css
└── tests/
    ├── tournament.test.ts    # generation invariants + resolution truth table
    └── match.test.ts         # state-machine: two picks → score update, timeout auto-pick, match end
```

---

## 6. Shared module contracts (`shared/`)

### 6.1 `tournament.ts` (pure, no I/O — the unit-tested core)
```ts
export interface Tournament {
  n: number;
  labels: string[];        // length n
  beats: boolean[][];      // n×n; beats[i][j] => i beats j; beats[i][i]=false; beats[i][j] !== beats[j][i] for i!=j
}

// rng is an injectable () => number in [0,1) so tests are deterministic (seeded).
export function generateTournament(rng: () => number, opts?: {
  minNodes?: number; maxNodes?: number; labelPool?: string[];
}): Tournament;

export type RoundOutcome = "p1" | "p2" | "tie";
export function resolveRound(t: Tournament, pickA: number, pickB: number): RoundOutcome;

export function outDegrees(t: Tournament): number[]; // optional helper, handy for UI hints/tests
```
**Invariants to test:** complete (every off-diagonal pair has exactly one
direction), antisymmetric, no self-loops, `labels.length === n`, `n` within
configured range, distinct labels. Resolution truth table: same pick → tie;
`beats[a][b]` → p1; otherwise p2.

### 6.2 `protocol.ts`
Define a discriminated union for every message, plus the serializable room/match
snapshot the server broadcasts. Critical rule: **the snapshot sent to clients
must never include the opponent's current-round pick until both picks are in.**

Sketch:
```ts
// client → server
type ClientMsg =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "pick"; node: number }
  | { t: "rematch" }
  | { t: "leave" };

// server → client
type ServerMsg =
  | { t: "joined"; code: string; you: PlayerId; state: RoomSnapshot }
  | { t: "state"; state: RoomSnapshot }          // pushed on every transition
  | { t: "roundResult"; picks: { p1: number; p2: number }; outcome: RoundOutcome; score: Score }
  | { t: "error"; message: string };

type Phase = "waiting" | "picking" | "revealing" | "matchOver";
interface RoomSnapshot {
  code: string;
  phase: Phase;
  players: { id: PlayerId; name: string; connected: boolean }[];
  round: number;
  score: Score;                 // wins per player
  tournament: Tournament | null;// the public graph for the current round
  youPicked: boolean;           // whether THIS client has locked a pick
  bothPicked: boolean;          // both locked (reveal imminent)
  deadline: number | null;      // epoch ms for the pick timer
  winner: PlayerId | null;      // set when phase === "matchOver"
}
```

---

## 7. Server behavior

- **Bun WS wiring:** use `createBunWebSocket()` from `hono/bun`; upgrade on a
  `GET /ws` route; default-export `{ fetch: app.fetch, websocket }`. Serve the
  built frontend with `serveStatic({ root: "./frontend/dist" })` and an SPA
  fallback to `index.html` (mirror wallgame).
- **Rooms (`rooms.ts`):**
  - `create` → generate a short, unambiguous code (e.g. 4 chars from
    `nanoid`'s no-look-alike alphabet, uppercased), store the room, attach the
    creator as player 1, phase `waiting`.
  - `join` → look up by code; if it exists and has 1 player, attach as player 2
    and start the match. If full/missing → `error`.
  - Track each player's live socket; mark `connected:false` on disconnect.
- **Match (`match.ts`):** an authoritative state machine.
  - On 2 players present → phase `picking`, generate a tournament
    (`generateTournament(Math.random, ...)`), set `deadline = now + ROUND_TIMER_MS`,
    broadcast `state`.
  - On `pick` → record that player's pick (server-side only; do not echo it).
    When both picks are in (or the timer fires → auto-pick random for whoever's
    missing), resolve with `resolveRound`, update score, broadcast `roundResult`
    then transition: if someone reached `WINS_TO_WIN` → phase `matchOver` with
    `winner`; else start the next round (new tournament).
  - Validate picks: in range, only during `picking`, only one lock per round
    (ignore/replace? → default: lock-in is final once submitted, ignore further
    picks that round; document the choice).
  - **Timer:** a single server-side `setTimeout` per round keyed to the deadline;
    clear it when both picks arrive.
  - **Disconnect handling:** if a player drops, keep the room alive for a grace
    period (e.g. 30s) so they can rejoin (same code) and resume; if they don't
    return, notify the opponent and close the room (opponent sees a friendly
    "opponent left" state, can return to lobby). Reap empty rooms.
- **Anti-cheat:** the graph is public (both see identical `beats`), but a
  player's current pick is never serialized to the other client until both have
  locked. The server is the only source of truth for resolution.
- Keep all of this in-memory; no DB. Add lightweight logging (Hono `logger()`).

---

## 8. Frontend behavior

- **Lobby (`Lobby.tsx`):** name field (default to a random fun name), big
  **Create game** and **Join game (code)** actions. On create, show the room
  code + a copy-link button and a "waiting for opponent…" state. Support deep
  link `/?room=CODE` (or `/r/CODE`) that pre-fills/auto-joins.
- **Graph (`TournamentGraph.tsx`):** lay the `N` nodes on a circle. Render each
  directed edge as an SVG line/curve with an arrowhead marker pointing from
  winner→loser. On hover/focus of a node, highlight its **out-edges** (nodes it
  beats, e.g. green) and **in-edges** (nodes that beat it, red) to help players
  read the graph fast. Click a node to pick; show a clear "locked" state and a
  ticking countdown to the deadline. With `N=7` there are 21 edges — make sure
  arrowheads and curves stay legible (curve opposing edges slightly, offset
  arrowheads from node circles).
- **Reveal (`RoundResult.tsx`):** when `roundResult` arrives, highlight both
  players' picked nodes and the single deciding edge, animate briefly, show who
  won the round and the updated score, then auto-advance to the next round.
- **HUD (`Game.tsx`):** opponent name + connection dot, your score vs theirs,
  round number, pick timer, phase-appropriate status text. On `matchOver`, show
  winner banner + **Rematch** and **Back to lobby** buttons.
- **Net (`net/socket.ts`):** typed wrapper around `WebSocket` using the
  `protocol.ts` types; auto-reconnect with the room code so a refresh rejoins the
  match; surface connection status to the UI.
- **Resilience:** handle opponent-left, room-not-found, and reconnect gracefully
  with plain, friendly messaging. Never trust client state for resolution —
  always render from the server `RoomSnapshot`.

---

## 9. Configuration (single source of truth)
Centralize tunables (in `shared/` or a `config.ts`): `MIN_NODES=5`,
`MAX_NODES=7`, `WINS_TO_WIN=5`, `ROUND_TIMER_MS=20000`, `RECONNECT_GRACE_MS=30000`,
`labelPool`. Document them in the README.

---

## 10. Testing
- **`tests/tournament.test.ts`** (Bun test): generation invariants (completeness,
  antisymmetry, no self-loops, label count/distinctness, node-count bounds using
  a seeded rng) + the resolution truth table (tie / p1 / p2).
- **`tests/match.test.ts`**: drive the match state machine without sockets —
  two picks resolve and update score; timeout triggers a random auto-pick;
  reaching `WINS_TO_WIN` transitions to `matchOver` with the right winner;
  rematch resets score and starts a fresh round.
- Keep the engine pure and socket-free so these tests need no network.
- (Nice-to-have, post-MVP) a Playwright e2e driving two browser contexts through
  a full match.
- A `ci` script must run: prettier check + eslint + tests + frontend build.

---

## 11. Deployment (fly.io, like wallgame)
- **`Dockerfile`:** multi-stage from `oven/bun:<ver>-slim` — install root + frontend
  deps, `bun run build` the frontend, then run `bun run server/index.ts` serving
  `frontend/dist`. Internal port **3000** (mirror wallgame's Dockerfile; no DB
  release command needed).
- **`fly.toml`:** `app = 'rps-roulette'`, a single primary region, `internal_port = 3000`,
  `force_https = true`. ⚠️ Because state is in-memory, you MUST keep exactly one
  machine: set `min_machines_running = 1` and **do not autoscale beyond 1**
  (a second machine would split players across separate in-memory stores). It's
  fine to let it `auto_stop`/`auto_start` as long as there's never >1 running, or
  simply keep one always-on machine. Document this constraint loudly.
- **`README.md`:** how to `bun install`, `bun run dev` (server) + `cd frontend &&
  bun run dev` (Vite on :5173 proxying to :3000), how to build, and
  `fly deploy`. State the single-machine constraint and that in-flight games are
  lost on machine restart (acceptable; ephemeral by design).

---

## 12. Build order (suggested, tracer-bullet style)
1. **Shared engine first:** `tournament.ts` + tests green. This is the heart;
   nail it before any networking.
2. `protocol.ts` types.
3. Server: rooms + match state machine + WS, tested via `match.test.ts` (no UI).
4. Minimal frontend: connect, create/join, render the graph statically, pick a
   node, see the result. Ugly is fine.
5. Polish loop: reveal animation, hover hints, timer, rematch, reconnect,
   mobile-not-broken.
6. Dockerfile + fly.toml; `fly deploy`; play a real match end-to-end.

## 13. Acceptance criteria (MVP done =)
- Two people on different devices can: open the site, one creates a room and
  shares the code/link, the other joins, and they play a full best-of-5 with a
  new random graph each round, correct winner resolution, a working timer, and a
  rematch — all with no login and no database.
- The shared engine has passing unit tests; `bun run ci` is green.
- It's deployed and reachable on fly.io on a single machine.

## 14. Nice-to-haves (only after MVP, do not block on these)
- "Quick match" matchmaking queue (auto-pair waiting players, no code needed).
- Solo vs. a simple bot (bot picks a max-out-degree node with some noise, or
  plays the mixed-strategy optimum for small `N`).
- Spectators, last-round replay, sound effects, emoji label themes, color themes,
  win animations, shareable result cards.

---

### Appendix A — name & branding
Name **RPS Roulette** — every round spins up a fresh random ruleset (a new
tournament), like a roulette wheel, so it reads instantly as rock-paper-scissors
with luck-of-the-draw. The folder/app slug is `rps-roulette`. The name is purely
cosmetic: nothing in the engine depends on it, so a rename only touches
`fly.toml` `app`, the README, and the page title.
