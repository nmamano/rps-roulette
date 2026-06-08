// Authoritative match state machine.
//
// Deliberately timer-free and socket-free: the Room owns all real timers and
// sockets and drives this class by calling pick()/forceTimeout()/advance().
// rng and clock are injected so tests are deterministic and need no real time.

import {
  generateTournament,
  resolveRound,
  outDegrees,
  WINS_TO_WIN,
  ROUND_TIMER_MS,
  type Tournament,
  type RoundOutcome,
} from "../shared/tournament";
import type { PlayerId, Phase, Score, RoomSnapshot, PlayerView } from "../shared/protocol";

export interface MatchPlayer {
  id: PlayerId;
  name: string;
  connected: boolean;
}

export interface RoundResultData {
  picks: { p1: number; p2: number };
  outcome: RoundOutcome;
  score: Score;
}

interface MatchOpts {
  rng?: () => number;
  now?: () => number;
}

export class Match {
  phase: Phase = "waiting";
  round = 0;
  score: Score = { p1: 0, p2: 0 };
  tournament: Tournament | null = null;
  deadline: number | null = null;
  winner: PlayerId | null = null;
  lastResult: RoundResultData | null = null;

  /**
   * Bumped on every phase transition. The Room captures it when scheduling a
   * timer and no-ops on fire if it has changed, so a stale timeout (from a
   * round that already resolved, a rematch, or a reconnect) can never advance.
   */
  version = 0;

  private picks: { p1: number | null; p2: number | null } = { p1: null, p2: null };
  private readonly rng: () => number;
  private readonly now: () => number;

  constructor(
    readonly players: { p1: MatchPlayer; p2: MatchPlayer },
    opts: MatchOpts = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  /** Begin (or restart) the match: reset score and start round 1. */
  start(): void {
    this.score = { p1: 0, p2: 0 };
    this.round = 0;
    this.winner = null;
    this.startRound();
  }

  private startRound(): void {
    this.round += 1;
    this.tournament = generateTournament(this.rng);
    this.picks = { p1: null, p2: null };
    this.phase = "picking";
    this.deadline = this.now() + ROUND_TIMER_MS;
    this.lastResult = null;
    this.version += 1;
  }

  /** Record a pick. Lock-in is final: the first valid pick per round sticks. */
  pick(pid: PlayerId, node: number): boolean {
    if (this.phase !== "picking" || !this.tournament) return false;
    if (this.picks[pid] !== null) return false; // already locked this round
    if (!Number.isInteger(node) || node < 0 || node >= this.tournament.n) return false;
    this.picks[pid] = node;
    if (this.picks.p1 !== null && this.picks.p2 !== null) this.resolve();
    return true;
  }

  /** Timer fired: auto-pick a uniformly random node for whoever is missing. */
  forceTimeout(): boolean {
    if (this.phase !== "picking" || !this.tournament) return false;
    if (this.picks.p1 === null) this.picks.p1 = this.randomNode();
    if (this.picks.p2 === null) this.picks.p2 = this.randomNode();
    this.resolve();
    return true;
  }

  /** Advance from the reveal into the next round. */
  advance(): boolean {
    if (this.phase !== "revealing") return false;
    this.startRound();
    return true;
  }

  /** Rematch from match-over: reset the score and start a fresh match. */
  rematch(): boolean {
    if (this.phase !== "matchOver") return false;
    this.start();
    return true;
  }

  bothPicked(): boolean {
    return this.picks.p1 !== null && this.picks.p2 !== null;
  }

  hasPicked(pid: PlayerId): boolean {
    return this.picks[pid] !== null;
  }

  /** Per-client view. Carries no pick values — see RoomSnapshot anti-cheat note. */
  snapshotFor(pid: PlayerId): Omit<RoomSnapshot, "code"> {
    const players: PlayerView[] = [
      { id: "p1", name: this.players.p1.name, connected: this.players.p1.connected },
      { id: "p2", name: this.players.p2.name, connected: this.players.p2.connected },
    ];
    return {
      phase: this.phase,
      players,
      round: this.round,
      score: { ...this.score },
      tournament: this.tournament,
      youPicked: this.picks[pid] !== null,
      bothPicked: this.bothPicked(),
      deadline: this.deadline,
      roundTimerMs: this.phase === "picking" ? ROUND_TIMER_MS : null,
      winner: this.winner,
    };
  }

  private randomNode(): number {
    return Math.floor(this.rng() * this.tournament!.n);
  }

  private resolve(): void {
    const t = this.tournament!;
    const a = this.picks.p1!;
    const b = this.picks.p2!;
    const outcome = resolveRound(t, a, b);
    if (outcome === "p1") this.score.p1 += 1;
    else if (outcome === "p2") this.score.p2 += 1;

    this.lastResult = { picks: { p1: a, p2: b }, outcome, score: { ...this.score } };
    this.deadline = null;

    if (this.score.p1 >= WINS_TO_WIN) {
      this.winner = "p1";
      this.phase = "matchOver";
    } else if (this.score.p2 >= WINS_TO_WIN) {
      this.winner = "p2";
      this.phase = "matchOver";
    } else {
      this.phase = "revealing";
    }
    this.version += 1; // invalidate the now-stale picking timer
  }
}

/**
 * Bot move (strategy "b"): weighted toward high out-degree nodes — the ones
 * that beat the most others — with a bump for the current maximum and enough
 * noise to stay beatable. Picking a max-out-degree node is the best response to
 * a *random* opponent, but a thinking player can exploit the bot's bias.
 */
export function botMove(t: Tournament, rng: () => number): number {
  const deg = outDegrees(t);
  const max = Math.max(...deg);
  const weights = deg.map((d) => Math.pow(d + 1, 2) + (d === max ? 1.5 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
