// In-memory room store + the Room, which is the single owner of all timers
// (round + reconnect-grace) and the only place that broadcasts to clients.

import { customAlphabet } from "nanoid";
import { Match, type MatchPlayer } from "./match";
import {
  REVEAL_MS,
  RECONNECT_GRACE_MS,
  CODE_LENGTH,
  CODE_ALPHABET,
  TOKEN_LENGTH,
  TOKEN_ALPHABET,
  MAX_NAME_LENGTH,
} from "../shared/config";
import type { PlayerId, ServerMsg, RoomSnapshot, ErrorCode } from "../shared/protocol";

const genCode = customAlphabet(CODE_ALPHABET, CODE_LENGTH);
const genToken = customAlphabet(TOKEN_ALPHABET, TOKEN_LENGTH);

type Timer = ReturnType<typeof setTimeout>;

/** The server's handle on one client socket. */
export interface Connection {
  send(msg: ServerMsg): void;
  close(): void;
}

interface Slot {
  player: MatchPlayer;
  token: string;
  conn: Connection | null;
  graceTimer: Timer | null;
}

interface JoinError {
  error: ErrorCode;
  message: string;
}

function cleanName(name: unknown): string {
  const n = (typeof name === "string" ? name : "").trim().slice(0, MAX_NAME_LENGTH);
  return n.length ? n : "Player";
}

const other = (pid: PlayerId): PlayerId => (pid === "p1" ? "p2" : "p1");

export class Room {
  match: Match | null = null;
  private slots: { p1: Slot | null; p2: Slot | null } = { p1: null, p2: null };
  private roundTimer: Timer | null = null;

  constructor(
    readonly code: string,
    private readonly onEmpty: (code: string) => void,
  ) {}

  hasOpenSlot(): boolean {
    return this.slots.p2 === null;
  }

  // ---- joining ----------------------------------------------------------

  addCreator(name: string, conn: Connection): { pid: "p1"; token: string } {
    const token = genToken();
    this.slots.p1 = {
      player: { id: "p1", name: cleanName(name), connected: true },
      token,
      conn,
      graceTimer: null,
    };
    return { pid: "p1", token };
  }

  /** Attach the second player and start the match. */
  reserveJoiner(name: string, conn: Connection): { pid: "p2"; token: string } | JoinError {
    if (!this.slots.p1) return { error: "room_not_found", message: "Room is not ready." };
    if (this.slots.p2) return { error: "room_full", message: "This room is full." };

    const token = genToken();
    this.slots.p2 = {
      player: { id: "p2", name: cleanName(name), connected: true },
      token,
      conn,
      graceTimer: null,
    };

    this.match = new Match({ p1: this.slots.p1.player, p2: this.slots.p2.player });
    this.match.start();
    this.reconcileTimers();
    return { pid: "p2", token };
  }

  /** Reclaim a slot by its secret token. Replaces the prior socket if any. */
  reconnect(token: string, conn: Connection): { pid: PlayerId } | JoinError {
    const pid = this.findByToken(token);
    if (!pid) return { error: "bad_token", message: "Could not rejoin this room." };

    const slot = this.slots[pid]!;
    if (slot.conn) slot.conn.close(); // replace the prior socket (friendly for refresh)
    slot.conn = conn;
    slot.player.connected = true;
    if (slot.graceTimer) {
      clearTimeout(slot.graceTimer);
      slot.graceTimer = null;
    }
    return { pid };
  }

  /** After a reconnect, replay the in-progress reveal so the client can render it. */
  replayResultTo(pid: PlayerId): void {
    const slot = this.slots[pid];
    const m = this.match;
    if (slot?.conn && m?.lastResult && (m.phase === "revealing" || m.phase === "matchOver")) {
      slot.conn.send({
        t: "roundResult",
        picks: m.lastResult.picks,
        outcome: m.lastResult.outcome,
        score: m.lastResult.score,
      });
    }
  }

  // ---- gameplay ---------------------------------------------------------

  pick(pid: PlayerId, node: number, conn: Connection): void {
    const slot = this.slots[pid];
    if (!slot || slot.conn !== conn) return; // a replaced/stale socket may not act for this pid
    if (!this.match) return;
    if (!this.match.pick(pid, node)) {
      slot.conn.send({
        t: "error",
        code: "invalid_pick",
        message: "That pick wasn't accepted.",
      });
      return;
    }
    if (this.match.phase === "picking") this.broadcast();
    else this.broadcastResult();
    this.reconcileTimers();
  }

  rematch(pid: PlayerId, conn: Connection): void {
    const slot = this.slots[pid];
    if (!slot || slot.conn !== conn) return; // a replaced/stale socket may not act for this pid
    if (this.match?.rematch()) {
      this.broadcast();
      this.reconcileTimers();
    }
  }

  // ---- presence / teardown ---------------------------------------------

  /** Called when a socket closes. `conn` guards against a stale (replaced) socket. */
  handleDisconnect(pid: PlayerId, conn: Connection): void {
    const slot = this.slots[pid];
    if (!slot || slot.conn !== conn) return; // already replaced by a reconnect
    slot.conn = null;
    slot.player.connected = false;
    this.broadcast(); // opponent sees the connection dot drop

    if (slot.graceTimer) clearTimeout(slot.graceTimer);
    slot.graceTimer = setTimeout(() => {
      if (!slot.player.connected) this.teardown(pid);
    }, RECONNECT_GRACE_MS);
  }

  /** Explicit, immediate leave. */
  leave(pid: PlayerId, conn: Connection): void {
    const slot = this.slots[pid];
    if (!slot) return;
    if (slot.conn && slot.conn !== conn) return;
    slot.conn = null;
    slot.player.connected = false;
    this.teardown(pid);
  }

  private teardown(leftPid: PlayerId): void {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    for (const pid of ["p1", "p2"] as const) {
      const s = this.slots[pid];
      if (s?.graceTimer) {
        clearTimeout(s.graceTimer);
        s.graceTimer = null;
      }
    }
    const opp = this.slots[other(leftPid)];
    opp?.conn?.send({ t: "opponentLeft" });
    this.onEmpty(this.code);
  }

  // ---- timers (single owner) -------------------------------------------

  private reconcileTimers(): void {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    const m = this.match;
    if (!m) return;

    if (m.phase === "picking" && m.deadline !== null) {
      const v = m.version;
      const delay = Math.max(0, m.deadline - Date.now());
      this.roundTimer = setTimeout(() => {
        if (m.phase === "picking" && m.version === v && m.forceTimeout()) {
          this.broadcastResult();
          this.reconcileTimers();
        }
      }, delay);
    } else if (m.phase === "revealing") {
      const v = m.version;
      this.roundTimer = setTimeout(() => {
        if (m.phase === "revealing" && m.version === v && m.advance()) {
          this.broadcast();
          this.reconcileTimers();
        }
      }, REVEAL_MS);
    }
  }

  // ---- snapshots / broadcast -------------------------------------------

  snapshotFor(pid: PlayerId): RoomSnapshot {
    if (!this.match) {
      const players = (["p1", "p2"] as const)
        .map((id) => this.slots[id])
        .filter((s): s is Slot => s !== null)
        .map((s) => ({ id: s.player.id, name: s.player.name, connected: s.player.connected }));
      return {
        code: this.code,
        phase: "waiting",
        players,
        round: 0,
        score: { p1: 0, p2: 0 },
        tournament: null,
        youPicked: false,
        bothPicked: false,
        deadline: null,
        winner: null,
      };
    }
    return { ...this.match.snapshotFor(pid), code: this.code };
  }

  broadcast(): void {
    for (const pid of ["p1", "p2"] as const) {
      const slot = this.slots[pid];
      if (slot?.conn) slot.conn.send({ t: "state", state: this.snapshotFor(pid) });
    }
  }

  private broadcastResult(): void {
    const r = this.match?.lastResult;
    if (r) {
      for (const pid of ["p1", "p2"] as const) {
        this.slots[pid]?.conn?.send({
          t: "roundResult",
          picks: r.picks,
          outcome: r.outcome,
          score: r.score,
        });
      }
    }
    this.broadcast();
  }

  private findByToken(token: string): PlayerId | null {
    if (token && this.slots.p1?.token === token) return "p1";
    if (token && this.slots.p2?.token === token) return "p2";
    return null;
  }
}

export class RoomStore {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = genCode();
    while (this.rooms.has(code)) code = genCode();
    const room = new Room(code, (c) => this.rooms.delete(c));
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get((code ?? "").toUpperCase());
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  get size(): number {
    return this.rooms.size;
  }
}
