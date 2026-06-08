// Centralized tunables that aren't part of the pure engine.
// (Engine constants — MIN_NODES, MAX_NODES, WINS_TO_WIN, ROUND_TIMER_MS, label
// pools — live in tournament.ts.) Browser-safe: types/constants only.

// How long the reveal lingers before the server starts the next round.
export const REVEAL_MS = 4500;

// How long a room is kept alive after a player drops, so they can rejoin by code.
export const RECONNECT_GRACE_MS = 30000;

// Room code: short, unambiguous, uppercase, no look-alike characters.
export const CODE_LENGTH = 4;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Per-player reconnect token.
export const TOKEN_LENGTH = 24;
export const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Display name guardrails.
export const MAX_NAME_LENGTH = 20;
