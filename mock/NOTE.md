# ⚠️ MOCK — UI reference only, not the real app

This folder is a **frontend UI mock** that Nil attached on 2026-06-07 (a v0-style
Next.js export). It is here for **visual/interaction reference only**.

**Do not build, install, or wire this up yet.** It is not part of the real
implementation and is intentionally excluded from the project's build.

## What it is
- **Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui.
- **Self-contained client mock:** `hooks/use-match.ts` simulates a match locally
  (no server, no WebSocket, no opponent). The lobby → game → reveal flow is all
  client-side.
- **Screenshots** (`*.png`) show the intended look: lobby, game, hover states,
  reveal, mobile.
- **`lib/tournament.ts`** already implements the engine from `../PROMPT.md`
  (MIN_NODES=5, MAX_NODES=7, WINS_TO_WIN=5, ROUND_TIMER_MS=20000;
  `generateTournament` / `resolveRound` / `outDegrees`) — reusable as-is.

## ⚠️ Stack divergence vs. PROMPT.md
The spec targets **React + Vite + Hono (Bun)** with a server-authoritative
WebSocket backend; this mock is **Next.js with a client-only simulated match**.
When we build for real, decide per `PROMPT.md`: port these components into the
Vite frontend (recommended — keeps the Bun/Hono server + anti-cheat model), or
revisit the stack choice. Either way, the `tournament.ts` engine and the visual
design carry straight over.
