"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import {
  generateTournament,
  outDegrees,
  resolveRound,
  ROUND_TIMER_MS,
  type Tournament,
  WINS_TO_WIN,
} from "@/lib/tournament"

export type Phase = "picking" | "revealing" | "matchOver"

export interface RoundReveal {
  picks: { you: number; opp: number }
  outcome: "you" | "opp" | "tie"
}

export interface MatchState {
  phase: Phase
  round: number
  score: { you: number; opp: number }
  tournament: Tournament | null
  youPicked: number | null
  oppPicked: number | null
  deadline: number | null
  reveal: RoundReveal | null
  winner: "you" | "opp" | null
}

type Action =
  | { type: "START"; tournament: Tournament; deadline: number }
  | { type: "NEXT_ROUND"; tournament: Tournament; deadline: number }
  | { type: "PICK"; node: number }
  | { type: "RESOLVE"; oppPick: number }

// Bot: weighted toward high out-degree nodes, with noise so it stays beatable.
function botPick(t: Tournament): number {
  const deg = outDegrees(t)
  const max = Math.max(...deg)
  const weights = deg.map((d) => Math.pow(d + 1, 2) + (d === max ? 1.5 : 0))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

export function freshTournament() {
  return generateTournament(Math.random)
}

const initialState: MatchState = {
  phase: "picking",
  round: 1,
  score: { you: 0, opp: 0 },
  tournament: null,
  youPicked: null,
  oppPicked: null,
  deadline: null,
  reveal: null,
  winner: null,
}

function reducer(state: MatchState, action: Action): MatchState {
  switch (action.type) {
    case "START":
      return {
        ...initialState,
        tournament: action.tournament,
        deadline: action.deadline,
      }
    case "NEXT_ROUND":
      return {
        ...state,
        phase: "picking",
        round: state.round + 1,
        tournament: action.tournament,
        youPicked: null,
        oppPicked: null,
        reveal: null,
        deadline: action.deadline,
      }
    case "PICK":
      if (state.phase !== "picking" || state.youPicked !== null) return state
      return { ...state, youPicked: action.node }
    case "RESOLVE": {
      if (!state.tournament || state.youPicked === null) return state
      const you = state.youPicked
      const opp = action.oppPick
      const res = resolveRound(state.tournament, you, opp)
      const outcome: RoundReveal["outcome"] = res === "tie" ? "tie" : res === "p1" ? "you" : "opp"
      const score = {
        you: state.score.you + (outcome === "you" ? 1 : 0),
        opp: state.score.opp + (outcome === "opp" ? 1 : 0),
      }
      const winner = score.you >= WINS_TO_WIN ? "you" : score.opp >= WINS_TO_WIN ? "opp" : null
      return {
        ...state,
        phase: winner ? "matchOver" : "revealing",
        oppPicked: opp,
        score,
        reveal: { picks: { you, opp }, outcome },
        winner,
        deadline: null,
      }
    }
    default:
      return state
  }
}

export function useMatch() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback(() => {
    dispatch({ type: "START", tournament: freshTournament(), deadline: Date.now() + ROUND_TIMER_MS })
  }, [])

  const pick = useCallback((node: number) => {
    dispatch({ type: "PICK", node })
  }, [])

  // Once the player has locked a pick, resolve against the bot after a beat.
  useEffect(() => {
    if (state.phase === "picking" && state.youPicked !== null && state.tournament) {
      const t = state.tournament
      const id = setTimeout(() => dispatch({ type: "RESOLVE", oppPick: botPick(t) }), 500)
      return () => clearTimeout(id)
    }
  }, [state.phase, state.youPicked, state.tournament])

  // Pick timer: auto-pick a uniformly random node on expiry.
  useEffect(() => {
    if (state.phase !== "picking" || !state.deadline || state.youPicked !== null) return
    if (timerRef.current) clearTimeout(timerRef.current)
    const ms = Math.max(0, state.deadline - Date.now())
    timerRef.current = setTimeout(() => {
      if (state.tournament) {
        dispatch({ type: "PICK", node: Math.floor(Math.random() * state.tournament.n) })
      }
    }, ms)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state.phase, state.deadline, state.youPicked, state.tournament])

  // Auto-advance to the next round after the reveal.
  useEffect(() => {
    if (state.phase !== "revealing") return
    const id = setTimeout(() => {
      dispatch({ type: "NEXT_ROUND", tournament: freshTournament(), deadline: Date.now() + ROUND_TIMER_MS })
    }, 2800)
    return () => clearTimeout(id)
  }, [state.phase])

  return { state, start, pick }
}
