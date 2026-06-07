"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { TournamentGraph } from "@/components/tournament-graph"
import { useMatch } from "@/hooks/use-match"
import { ROUND_TIMER_MS, WINS_TO_WIN } from "@/lib/tournament"
import { cn } from "@/lib/utils"

function ScorePips({ value, side }: { value: number; side: "you" | "opp" }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: WINS_TO_WIN }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-colors",
            i < value ? (side === "you" ? "bg-win" : "bg-lose") : "bg-border",
          )}
        />
      ))}
    </div>
  )
}

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [deadline])
  if (!deadline) return null
  return Math.max(0, deadline - now)
}

export function Game({ playerName, onExit }: { playerName: string; onExit: () => void }) {
  const { state, start, pick } = useMatch()
  const remaining = useCountdown(state.deadline)

  // Boot the first round.
  useEffect(() => {
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { tournament, phase, score, round, youPicked, oppPicked, reveal, winner } = state
  const locked = youPicked !== null
  const seconds = remaining !== null ? Math.ceil(remaining / 1000) : null
  const pct = remaining !== null ? (remaining / ROUND_TIMER_MS) * 100 : 100
  const urgent = remaining !== null && remaining < 5000

  let status = "Pick a node — the arrow pointing at your opponent wins!"
  if (phase === "picking" && locked) status = "Locked in! Waiting on your opponent…"
  if (phase === "revealing") {
    status =
      reveal?.outcome === "tie"
        ? "Same pick — it's a tie! No point this round."
        : reveal?.outcome === "you"
          ? "Yay, you win the round!"
          : "Aw, opponent takes the round."
  }
  if (phase === "matchOver") status = winner === "you" ? "You won the match!" : "You lost the match."

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
      {/* Top bar */}
      <header className="flex items-center justify-between">
        <button
          onClick={onExit}
          className="font-heading text-lg font-extrabold tracking-tight text-muted-foreground transition-colors hover:text-foreground"
        >
          RPS<span className="text-primary">Roulette</span>
        </button>
        <span className="rounded-full border-2 border-border bg-card px-3 py-1 font-heading text-xs font-bold text-muted-foreground">
          Round {round}
        </span>
      </header>

      {/* Scoreboard */}
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl border-2 border-border bg-card p-4 shadow-[0_6px_0_0_var(--border)]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-win" />
            <span className="truncate font-bold">{playerName}</span>
          </div>
          <ScorePips value={score.you} side="you" />
        </div>
        <div className="flex flex-col items-center px-2">
          <div className="font-heading text-3xl font-extrabold tabular-nums">
            <span className="text-win">{score.you}</span>
            <span className="mx-1 text-muted-foreground">:</span>
            <span className="text-lose">{score.opp}</span>
          </div>
          <span className="font-heading text-[10px] font-bold uppercase tracking-widest text-muted-foreground">first to {WINS_TO_WIN}</span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold">RNGesus Bot</span>
            <span className="h-2.5 w-2.5 rounded-full bg-lose" />
          </div>
          <ScorePips value={score.opp} side="opp" />
        </div>
      </div>

      {/* Timer */}
      {phase === "picking" && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-muted-foreground">{locked ? "Pick locked" : "Time to pick"}</span>
            <span className={cn("font-heading font-extrabold tabular-nums", urgent ? "text-lose" : "text-foreground")}>
              {seconds}s
            </span>
          </div>
          <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full transition-all duration-100 ease-linear", urgent ? "bg-lose" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Graph */}
      <div className="flex flex-1 flex-col items-center justify-center py-6">
        {tournament && (
          <TournamentGraph
            tournament={tournament}
            onPick={pick}
            yourPick={youPicked}
            oppPick={oppPicked}
            locked={locked}
            revealing={phase === "revealing" || phase === "matchOver"}
            outcome={reveal?.outcome ?? null}
            interactive={phase === "picking" && !locked}
          />
        )}
      </div>

      {/* Status / reveal */}
      <div
        className={cn(
          "rounded-3xl border-2 p-4 text-center transition-colors",
          phase === "revealing" && reveal?.outcome === "you" && "border-win/50 bg-win/10",
          phase === "revealing" && reveal?.outcome === "opp" && "border-lose/50 bg-lose/10",
          (phase === "picking" || reveal?.outcome === "tie") && "border-border bg-card",
          phase === "matchOver" && (winner === "you" ? "border-win/60 bg-win/10" : "border-lose/60 bg-lose/10"),
        )}
      >
        {phase === "matchOver" ? (
          <div className="flex flex-col items-center gap-4">
            <div>
              <div
                className={cn(
                  "font-heading text-3xl font-extrabold",
                  winner === "you" ? "text-win" : "text-lose",
                )}
              >
                {winner === "you" ? "Victory!" : "Defeat!"}
              </div>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Final score {score.you} : {score.opp}
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button className="flex-1 rounded-2xl font-bold sm:flex-none sm:px-8" onClick={start}>
                Rematch
              </Button>
              <Button variant="outline" className="flex-1 rounded-2xl font-bold sm:flex-none sm:px-8 bg-transparent" onClick={onExit}>
                Back to lobby
              </Button>
            </div>
          </div>
        ) : (
          <p className="font-heading text-lg font-bold">{status}</p>
        )}
      </div>
    </main>
  )
}
