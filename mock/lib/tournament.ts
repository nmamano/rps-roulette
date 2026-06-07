// Pure game engine for RPS Roulette — no I/O, deterministic given an rng.

export interface Tournament {
  n: number
  labels: string[] // length n
  beats: boolean[][] // n×n; beats[i][j] => i beats j
}

export type RoundOutcome = "p1" | "p2" | "tie"

export const MIN_NODES = 5
export const MAX_NODES = 7
export const WINS_TO_WIN = 5
export const ROUND_TIMER_MS = 20000

// Clean, always-readable default label pool.
export const LABEL_POOL = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("")

// Alternate emoji pool, behind a constant so it's easy to swap.
export const EMOJI_POOL = ["🔥", "💧", "🌿", "⚡", "🪨", "🌪️", "🌙", "☀️", "❄️", "🌊"]

interface GenerateOpts {
  minNodes?: number
  maxNodes?: number
  labelPool?: string[]
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function generateTournament(rng: () => number, opts: GenerateOpts = {}): Tournament {
  const minNodes = opts.minNodes ?? MIN_NODES
  const maxNodes = opts.maxNodes ?? MAX_NODES
  const pool = opts.labelPool ?? LABEL_POOL

  const n = minNodes + Math.floor(rng() * (maxNodes - minNodes + 1))
  const labels = shuffle(pool, rng).slice(0, n)

  const beats: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false))

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const iBeatsJ = rng() < 0.5
      beats[i][j] = iBeatsJ
      beats[j][i] = !iBeatsJ
    }
  }

  return { n, labels, beats }
}

export function resolveRound(t: Tournament, pickA: number, pickB: number): RoundOutcome {
  if (pickA === pickB) return "tie"
  return t.beats[pickA][pickB] ? "p1" : "p2"
}

export function outDegrees(t: Tournament): number[] {
  return t.beats.map((row) => row.reduce((acc, v) => acc + (v ? 1 : 0), 0))
}
