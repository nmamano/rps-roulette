# RPS Roulette

Online Rock-Paper-Scissors with the rules randomized every round.

Each round reveals a brand-new **tournament** — a complete directed graph on a
random number of randomly-labeled nodes, with a random direction on every edge.
An arrow `A → B` means "A beats B." Two players each secretly pick a node; the
edge between their picks decides the round. Same node = tie. Fresh graph every
round, so there's nothing to memorize — just read the graph and out-guess your
opponent.

(Classic RPS is just the 3-node cyclic tournament. RPS Roulette generalizes it.)

## Stack

Bun + Hono + native WebSockets · React 19 + Vite + TypeScript · a pure shared
game engine · in-memory server state (no DB, no login) · deployed on fly.io
(single machine). Modeled on the `wallgame` project.

```
shared/      pure engine (tournament.ts) + wire protocol (protocol.ts) + config.ts   ← browser-safe
server/      Hono app (index.ts), room store + timers (rooms.ts), match state
             machine (match.ts), WS dispatch (socket.ts)
frontend/    Vite + React: Lobby / Waiting / Game / TournamentGraph, typed WS client
tests/       engine invariants + match state-machine tests (bun test)
mock/        original UI mock — kept for reference only, not built or shipped
```

The server is **authoritative**: it owns graph generation and pick resolution.
The graph is public, but a player's current-round pick is never serialized to
the opponent until both are locked (`RoomSnapshot` carries no pick values).

## Run locally

```bash
bun install                 # root (server) deps
cd frontend && bun install  # frontend deps
cd ..

# Terminal 1 — Bun server (API + WebSocket) on :3000
bun run dev

# Terminal 2 — Vite dev server on :5173 (proxies /ws → :3000)
cd frontend && bun run dev
```

Open <http://localhost:5173> in **two** browser windows: create a game in one,
copy the 4-letter code (or share link `/?room=CODE`) into the other, and play.

If port `3000` is already in use, run the backend on another port and point Vite
at it:

```bash
PORT=3010 bun run dev
cd frontend && RPS_BACKEND_URL=http://127.0.0.1:3010 bun run dev -- --port 5174
```

### Production-style run

```bash
bun run build      # builds frontend/dist
bun run start      # serves the built SPA + WebSocket on :3000
```

## Test / CI

```bash
bun test           # engine + match state-machine tests
bun run ci         # prettier --check + eslint + tests + frontend build
```

## Configuration (single source of truth)

| Constant             | Default | Where               | Meaning                                         |
| -------------------- | ------- | ------------------- | ----------------------------------------------- |
| `MIN_NODES`          | 5       | `shared/tournament` | min nodes per round                             |
| `MAX_NODES`          | 7       | `shared/tournament` | max nodes per round                             |
| `WINS_TO_WIN`        | 3       | `shared/tournament` | round wins to take the match (best-of)          |
| `ROUND_TIMER_MS`     | 30000   | `shared/tournament` | per-round pick timer (auto-picks on expiry)     |
| `REVEAL_MS`          | 4500    | `shared/config`     | how long the reveal lingers before next round   |
| `RECONNECT_GRACE_MS` | 30000   | `shared/config`     | room kept alive after a drop for rejoin-by-code |
| `CODE_LENGTH`        | 4       | `shared/config`     | room code length (no look-alike chars)          |

Labels default to a colorful animal-face pool (`LABEL_POOL` = `ANIMAL_POOL`); a
letter pool (`LETTER_POOL`) is available as an alternate.

## Deploy (fly.io)

```bash
fly deploy
```

> ⚠️ **Run exactly one machine.** State is in-memory, so a second machine would
> hold a separate room store and split players. `fly.toml` sets
> `min_machines_running = 1`; do not scale past 1 (`fly scale count 1`).
> In-flight games are lost on restart — ephemeral by design.

## Rules recap

- `N` ∈ [5, 7] nodes, fresh random labels + random edge directions each round.
- Both players secretly pick a node. `beats[a][b]` → player 1; same pick → tie
  (no point, round still advances). First to `WINS_TO_WIN` takes the match.
- 30s pick timer; on expiry a uniformly-random node is auto-picked (no forfeit).
- Lock-in is final: the first valid pick each round sticks.
- Rematch keeps both players in the room and resets the score.
- **Play vs Bot** (solo): a server-driven bot fills the second seat. It weights
  its pick toward high out-degree nodes (with noise), so it's competent but
  beatable. Indistinguishable from a human to the client — the server drives it.
