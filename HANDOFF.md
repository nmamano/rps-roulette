# RPS Roulette — Implementation Hand-Off

You are the implementing agent. Build **RPS Roulette** end-to-end, deploy-ready,
from the spec in this repository. This document orients you; **`PROMPT.md` is the
authoritative spec** and wins any conflict (flag conflicts rather than guessing).

---

## 0. Mission (TL;DR)
Build the complete game: a **two-player, real-time, no-login** web game of
*randomized rock-paper-scissors* — every round generates a fresh random
**tournament** (complete directed graph, 5–7 randomly-labeled nodes, random edge
directions); each player secretly picks a node; the arrow between the two picks
decides the round. Best-of-5, rematch. **Server-authoritative** Bun + Hono +
WebSocket backend, **React + Vite** frontend, deployed to **fly.io on a single
machine**. Reuse the existing engine; port the existing UI mock.

## 1. Read these first (in order)
1. **`PROMPT.md`** — the full PRD + spec: rules, architecture, file layout, the
   client⇄server protocol, tests, deployment, and acceptance criteria. Source of
   truth.
2. **`mock/NOTE.md`** — what the attached UI mock is and isn't.
3. **`~/nil/wallgame`** — reference for the exact stack wiring you'll mirror:
   Bun-native WebSockets via `createBunWebSocket` from `hono/bun`, default-export
   `{ fetch, websocket }`, `serveStatic` with SPA fallback, plus the Dockerfile,
   `fly.toml`, and tsconfig/eslint/prettier conventions. This game is **simpler**
   than wallgame — no DB, no auth, no ratings.

## 2. What already exists — reuse, don't reinvent
- **`mock/lib/tournament.ts`** — the **pure engine**, already matching the spec
  (`MIN_NODES=5`, `MAX_NODES=7`, `WINS_TO_WIN=5`, `ROUND_TIMER_MS=20000`;
  `generateTournament(rng, opts)`, `resolveRound`, `outDegrees`, label pools).
  **Move it to `shared/tournament.ts`** and build the server on it. Add the unit
  tests PROMPT §10 requires (it ships without tests).
- **`mock/` UI** — Next.js 16 + React 19 + Tailwind v4 + shadcn, **client-only**
  (it fakes the opponent via `hooks/use-match.ts`). Components: `lobby.tsx`,
  `game.tsx`, `tournament-graph.tsx`, `ui/button.tsx`. Screenshots (`*.png`) show
  the target look (lobby, game, hover, reveal, mobile). **Port the visuals** into
  the real frontend.

## 3. Decisions already made (do not relitigate without asking Nil)
- **Stack = PROMPT.md's:** React + Vite + Hono/Bun, **server-authoritative over
  WebSocket.** The mock's **Next.js shell and its client-side match simulation
  are throwaway scaffolding** — keep the visuals and the engine, replace the fake
  "match" with the real WS protocol (PROMPT §6.2 / §7). Rationale: anti-cheat and
  a single source of truth require the **server** to own graph generation and
  pick resolution; a client-only sim cannot. **Do not ship the Next.js app as-is,
  and do not keep the fake-opponent model.**
- **No database, no login, no accounts, no analytics.** In-memory server state.
- **fly.io: exactly ONE machine** (in-memory state isn't shared across machines):
  `min_machines_running = 1`, do not autoscale beyond 1. In-flight games are lost
  on restart — acceptable, ephemeral by design.

## 4. Build order (tracer-bullet, engine-first — PROMPT §12)
1. `shared/tournament.ts` (move from mock) **+ tests green** — nail the core first.
2. `shared/protocol.ts` — message union + `RoomSnapshot` types (PROMPT §6.2).
3. **Server:** `rooms.ts` + `match.ts` (state machine) + `socket.ts`; drive it
   with `tests/match.test.ts` (no UI): two picks → score, timeout → random
   auto-pick, reaching `WINS_TO_WIN` → matchOver, rematch resets.
4. **Minimal Vite frontend:** connect, create/join by code, render the graph,
   pick a node, see the result — wired to the **real** WS. Ugly is fine.
5. **Port the mock visuals:** circular graph + directed-edge arrows, hover
   in/out-edge highlighting, reveal animation, HUD (score/round/timer/status),
   rematch; reconnect-by-code; don't-break-on-mobile.
6. `Dockerfile` + `fly.toml`; `bun run ci` green; `fly deploy`; play a real
   match across two devices.

## 5. Guardrails & conventions
- Fresh standalone repo at `~/nil/rps-roulette`. Commit in **logical increments**
  with clear messages; only stage files you actually changed (don't blanket
  `git add -A` over unrelated/other-agent work).
- **Server is authoritative.** Never serialize a player's current-round pick to
  the opponent before both are locked (PROMPT §7 anti-cheat). The graph is public;
  the live pick is the only hidden bit.
- Keep dependencies minimal: hand-rolled **SVG** for the graph (no graph lib);
  plain CSS, or port the mock's Tailwind v4 setup cleanly for **Vite** (not Next).
  The shadcn `button` is trivial — keep it or inline a plain button.
- Centralize tunables (PROMPT §9). Validate picks (in range, only during
  `picking`, lock-in final).
- **Leave `mock/` in place as reference** — don't delete it, don't build it,
  don't let Next.js config or `use-match`'s fake-opponent logic leak into the
  real app.

## 6. Definition of done (PROMPT §13)
- Two people on different devices play a full **best-of-5** with a **new random
  graph each round**, correct resolution, a working pick timer, and a rematch —
  **no login, no DB.**
- Shared engine unit tests + match state-machine tests pass; **`bun run ci`**
  (prettier + eslint + tests + frontend build) is green.
- **Deployed and reachable on fly.io on a single machine.**

## 7. Verify before declaring done
- `bun test` for engine + state machine.
- Local run: server on `:3000`, Vite on `:5173`; open **two** browser windows,
  create + join, and play through: a normal round, a **tie** (both pick the same
  node), a **timeout auto-pick**, and **match-over → rematch**.
- (Optional) a Playwright two-context e2e for a full match.

## 8. When to proceed vs. check in with Nil
- **Proceed autonomously** through the build order; default to "server-
  authoritative + the simplest thing that works."
- **Surface to Nil** only if: §3's stack decision needs reopening, the visual
  design must deviate meaningfully from the mock/screenshots, or a `PROMPT.md`
  ambiguity can't be resolved from first principles.
- **Report (concisely) at three checkpoints:** (a) engine + tests green,
  (b) server + protocol done and playable locally, (c) deployed.

## 9. Watch-outs
- `N` up to 7 ⇒ **21 edges**. Keep arrows legible: curve opposing edges, offset
  arrowheads off the node circles. `mock/components/tournament-graph.tsx` already
  handles layout for up to 7 nodes — verify and reuse it.
- **Tailwind v4 + Vite** ≠ Next.js wiring. If porting the mock's styles, set up
  Tailwind for Vite or convert the handful of components to plain CSS. Don't drag
  in `next.config`, `next-env`, or the App-Router layout.
- **Reconnect:** rejoin by room code; the server keeps the room alive for
  `RECONNECT_GRACE_MS` after a drop, then notifies the opponent and reaps it.
- Same-node pick = **tie, no point, advance the round** (default per PROMPT §3.2).

---

*Spec: `PROMPT.md`. UI reference: `mock/` (see `mock/NOTE.md`). Stack reference:
`~/nil/wallgame`.*
