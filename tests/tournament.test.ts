import { test, expect, describe } from "bun:test";
import {
  generateTournament,
  resolveRound,
  outDegrees,
  MIN_NODES,
  MAX_NODES,
  type Tournament,
} from "../shared/tournament";

// Deterministic seeded rng so the invariant sweep is reproducible.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("generateTournament", () => {
  test("holds all invariants across many seeds", () => {
    for (let seed = 0; seed < 500; seed++) {
      const t = generateTournament(mulberry32(seed));

      // node count within configured bounds
      expect(t.n).toBeGreaterThanOrEqual(MIN_NODES);
      expect(t.n).toBeLessThanOrEqual(MAX_NODES);

      // labels: correct count + distinct
      expect(t.labels.length).toBe(t.n);
      expect(new Set(t.labels).size).toBe(t.n);

      // adjacency matrix shape
      expect(t.beats.length).toBe(t.n);
      for (const row of t.beats) expect(row.length).toBe(t.n);

      for (let i = 0; i < t.n; i++) {
        // no self-loops
        expect(t.beats[i][i]).toBe(false);
        for (let j = i + 1; j < t.n; j++) {
          // complete + antisymmetric: exactly one direction per pair
          expect(t.beats[i][j]).toBe(!t.beats[j][i]);
        }
      }
    }
  });

  test("respects custom node bounds and label pool", () => {
    const t = generateTournament(mulberry32(7), {
      minNodes: 3,
      maxNodes: 3,
      labelPool: ["x", "y", "z", "w"],
    });
    expect(t.n).toBe(3);
    for (const l of t.labels) expect(["x", "y", "z", "w"]).toContain(l);
  });
});

describe("resolveRound", () => {
  // A beats B, B beats C, C beats A (a 3-cycle).
  const cycle: Tournament = {
    n: 3,
    labels: ["A", "B", "C"],
    beats: [
      [false, true, false],
      [false, false, true],
      [true, false, false],
    ],
  };

  test("same pick is a tie", () => {
    expect(resolveRound(cycle, 0, 0)).toBe("tie");
    expect(resolveRound(cycle, 2, 2)).toBe("tie");
  });

  test("beats[a][b] => p1 wins, otherwise p2", () => {
    expect(resolveRound(cycle, 0, 1)).toBe("p1"); // A beats B
    expect(resolveRound(cycle, 1, 0)).toBe("p2"); // B loses to A
    expect(resolveRound(cycle, 2, 0)).toBe("p1"); // C beats A
    expect(resolveRound(cycle, 0, 2)).toBe("p2"); // A loses to C
  });

  test("outDegrees counts wins per node", () => {
    expect(outDegrees(cycle)).toEqual([1, 1, 1]);
  });
});
