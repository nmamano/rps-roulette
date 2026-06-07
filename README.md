# RPS Roulette

Online Rock-Paper-Scissors with the rules randomized every round.

Each round reveals a brand-new **tournament** — a complete directed graph on a
random number of randomly-labeled nodes, with a random direction on every edge.
An arrow `A → B` means "A beats B." Two players each secretly pick a node; the
edge between their picks decides the round. Same node = tie. Fresh graph every
round, so there's nothing to memorize — just read the graph and out-guess your
opponent.

(Classic RPS is just the 3-node cyclic tournament. RPS Roulette generalizes it.)

## Status

Design stage. The full end-to-end implementation spec lives in
[`PROMPT.md`](./PROMPT.md) — start there.

## Planned stack

Bun + Hono + WebSockets · React 19 + Vite · pure shared game engine · in-memory
server state (no DB, no login) · deployed on fly.io (single machine). Modeled on
the `wallgame` project.
