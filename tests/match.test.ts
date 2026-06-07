import { test, expect, describe } from "bun:test";
import { Match, type MatchPlayer } from "../server/match";
import { WINS_TO_WIN } from "../shared/tournament";

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function players(): { p1: MatchPlayer; p2: MatchPlayer } {
  return {
    p1: { id: "p1", name: "Alice", connected: true },
    p2: { id: "p2", name: "Bob", connected: true },
  };
}

function newMatch(seed = 1, now = () => 1000): Match {
  return new Match(players(), { rng: mulberry32(seed), now });
}

// Find a directed edge winner→loser in the current tournament.
function anEdge(m: Match): { winner: number; loser: number } {
  const t = m.tournament!;
  for (let i = 0; i < t.n; i++)
    for (let j = 0; j < t.n; j++) if (i !== j && t.beats[i][j]) return { winner: i, loser: j };
  throw new Error("no edge found");
}

describe("Match", () => {
  test("start enters picking with a fresh graph and a deadline", () => {
    const m = newMatch();
    m.start();
    expect(m.phase).toBe("picking");
    expect(m.round).toBe(1);
    expect(m.tournament).not.toBeNull();
    expect(m.deadline).toBe(1000 + 20000);
  });

  test("two picks resolve and update the score", () => {
    const m = newMatch();
    m.start();
    const { winner, loser } = anEdge(m);
    expect(m.pick("p1", winner)).toBe(true);
    expect(m.pick("p2", loser)).toBe(true);
    expect(m.lastResult?.outcome).toBe("p1");
    expect(m.score).toEqual({ p1: 1, p2: 0 });
    expect(m.phase).toBe("revealing");
  });

  test("lock-in is final: a second pick that round is ignored", () => {
    const m = newMatch();
    m.start();
    const { winner, loser } = anEdge(m);
    expect(m.pick("p1", winner)).toBe(true);
    expect(m.pick("p1", loser)).toBe(false); // ignored
    expect(m.pick("p2", loser)).toBe(true);
    expect(m.lastResult?.picks.p1).toBe(winner); // first pick stuck
  });

  test("same pick is a tie: no point, round still advances", () => {
    const m = newMatch();
    m.start();
    expect(m.pick("p1", 0)).toBe(true);
    expect(m.pick("p2", 0)).toBe(true);
    expect(m.lastResult?.outcome).toBe("tie");
    expect(m.score).toEqual({ p1: 0, p2: 0 });
    expect(m.phase).toBe("revealing");

    const v = m.version;
    expect(m.advance()).toBe(true);
    expect(m.phase).toBe("picking");
    expect(m.round).toBe(2);
    expect(m.version).toBeGreaterThan(v); // version bumped → stale timers no-op
  });

  test("timeout auto-picks the missing side deterministically", () => {
    const m = newMatch(42);
    m.start();
    const t = m.tournament!;
    expect(m.pick("p1", 0)).toBe(true);
    // p2 never picks; the round timer fires.
    expect(m.forceTimeout()).toBe(true);
    expect(m.phase).toBe("revealing");
    expect(m.lastResult).not.toBeNull();
    const p2pick = m.lastResult!.picks.p2;
    expect(p2pick).toBeGreaterThanOrEqual(0);
    expect(p2pick).toBeLessThan(t.n);

    // Determinism: same seed + same sequence → identical auto-pick.
    const m2 = newMatch(42);
    m2.start();
    m2.pick("p1", 0);
    m2.forceTimeout();
    expect(m2.lastResult!.picks.p2).toBe(p2pick);
  });

  test("reaching WINS_TO_WIN ends the match with the right winner", () => {
    const m = newMatch();
    m.start();
    for (let i = 0; i < WINS_TO_WIN; i++) {
      const { winner, loser } = anEdge(m);
      m.pick("p1", winner);
      m.pick("p2", loser);
      if (m.phase === "revealing") m.advance();
    }
    expect(m.phase).toBe("matchOver");
    expect(m.winner).toBe("p1");
    expect(m.score.p1).toBe(WINS_TO_WIN);
  });

  test("rematch resets the score and starts a fresh round", () => {
    const m = newMatch();
    m.start();
    for (let i = 0; i < WINS_TO_WIN; i++) {
      const { winner, loser } = anEdge(m);
      m.pick("p1", winner);
      m.pick("p2", loser);
      if (m.phase === "revealing") m.advance();
    }
    expect(m.phase).toBe("matchOver");
    expect(m.rematch()).toBe(true);
    expect(m.score).toEqual({ p1: 0, p2: 0 });
    expect(m.round).toBe(1);
    expect(m.phase).toBe("picking");
    expect(m.winner).toBeNull();
  });

  test("anti-cheat: opponent's pick is never exposed before both lock", () => {
    const m = newMatch();
    m.start();
    m.pick("p1", 2);

    const p2view = m.snapshotFor("p2");
    expect(p2view.youPicked).toBe(false);
    expect(p2view.bothPicked).toBe(false);
    // The snapshot has no pick fields at all — structurally cannot leak p1's pick.
    expect(JSON.stringify(p2view)).not.toContain('"pick"');

    const p1view = m.snapshotFor("p1");
    expect(p1view.youPicked).toBe(true);
    expect(p1view.bothPicked).toBe(false);
  });

  test("invalid picks are rejected (out of range / wrong phase)", () => {
    const m = newMatch();
    m.start();
    const n = m.tournament!.n;
    expect(m.pick("p1", -1)).toBe(false);
    expect(m.pick("p1", n)).toBe(false);
    expect(m.pick("p1", 1.5)).toBe(false);
    expect(m.pick("p1", 0)).toBe(true);
    m.pick("p2", 0);
    // phase is now revealing — further picks rejected
    expect(m.pick("p1", 1)).toBe(false);
  });
});

describe("version semantics (pins stale-timer protection)", () => {
  // The Room keys timers on `version`: it captures the value when scheduling and
  // only acts on fire if `phase` + `version` still match. These tests make the
  // transition rules explicit so a future change can't widen or narrow the guard
  // by accident.

  test("version increments by exactly 1 on each phase transition, and only then", () => {
    const m = newMatch();
    expect(m.version).toBe(0); // constructed, phase "waiting"

    m.start(); // waiting → picking (round 1)
    expect(m.version).toBe(1);
    expect(m.phase).toBe("picking");

    // A lock that does NOT resolve is not a phase transition → version unchanged.
    expect(m.pick("p1", 0)).toBe(true);
    expect(m.version).toBe(1);

    // The second pick resolves: picking → revealing.
    expect(m.pick("p2", 1)).toBe(true);
    expect(m.version).toBe(2);

    // advance → next picking round.
    expect(m.advance()).toBe(true);
    expect(m.version).toBe(3);
    expect(m.phase).toBe("picking");
  });

  test("an early resolve invalidates the picking timer (phase + version both move)", () => {
    const m = newMatch();
    m.start();
    const scheduled = m.version; // what the Room captured for the picking timer
    m.pick("p1", 0);
    m.pick("p2", 1); // resolves before the timer would fire
    // Room guard is `phase === "picking" && version === scheduled` → now false on both.
    expect(m.phase).not.toBe("picking");
    expect(m.version).not.toBe(scheduled);
    // Belt-and-suspenders: forceTimeout is itself inert outside picking.
    expect(m.forceTimeout()).toBe(false);
  });

  test("a valid picking-timer fire (forceTimeout) advances version exactly once", () => {
    const m = newMatch(42);
    m.start();
    const v = m.version;
    expect(m.forceTimeout()).toBe(true);
    expect(m.version).toBe(v + 1);
    expect(m.phase === "revealing" || m.phase === "matchOver").toBe(true);
  });
});
