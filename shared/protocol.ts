// The client⇄server wire protocol. Imported by both the server and the frontend,
// so it must stay browser-safe (types only, plus the pure engine types).

import type { Tournament, RoundOutcome } from "./tournament";

export type PlayerId = "p1" | "p2";

export type Phase = "waiting" | "picking" | "revealing" | "matchOver";

export interface Score {
  p1: number;
  p2: number;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  connected: boolean;
}

/**
 * The serializable view of a room the server broadcasts to a *specific* client.
 *
 * Anti-cheat invariant: this snapshot carries NO pick values — only the booleans
 * `youPicked` / `bothPicked`. A player's chosen node is never serialized to the
 * opponent until both are locked, at which point it is revealed via `roundResult`.
 */
export interface RoomSnapshot {
  code: string;
  phase: Phase;
  players: PlayerView[];
  round: number;
  score: Score;
  tournament: Tournament | null; // the public graph for the current round
  youPicked: boolean; // whether THIS client has locked a pick
  bothPicked: boolean; // both locked (reveal imminent)
  deadline: number | null; // epoch ms for the pick timer
  roundTimerMs: number | null; // full pick timer duration for progress display
  winner: PlayerId | null; // set when phase === "matchOver"
}

// ---- client → server -------------------------------------------------------

export type ClientMsg =
  | { t: "create"; name: string }
  | { t: "createBot"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "reconnect"; code: string; token: string }
  | { t: "pick"; node: number }
  | { t: "rematch" }
  | { t: "leave" };

// ---- server → client -------------------------------------------------------

export type ErrorCode =
  | "room_not_found"
  | "room_full"
  | "bad_token"
  | "invalid_pick"
  | "bad_phase"
  | "bad_message";

export type ServerMsg =
  // `token` is returned ONLY here, in the direct response — never in a broadcast.
  | { t: "joined"; code: string; you: PlayerId; token: string; state: RoomSnapshot }
  | { t: "state"; state: RoomSnapshot } // pushed on every transition
  | {
      t: "roundResult";
      picks: { p1: number; p2: number };
      outcome: RoundOutcome;
      score: Score;
    }
  | { t: "opponentLeft" }
  | { t: "error"; code: ErrorCode; message: string };
