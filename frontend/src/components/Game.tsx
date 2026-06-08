import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { TournamentGraph } from "@/components/TournamentGraph";
import { ROUND_TIMER_MS, WINS_TO_WIN, outDegrees, type RoundOutcome } from "@shared/tournament";
import type { PlayerId, RoomSnapshot, Score } from "@shared/protocol";
import { cn } from "@/lib/cn";

export interface LastResult {
  picks: { p1: number; p2: number };
  outcome: RoundOutcome;
  score: Score;
}

interface Props {
  snapshot: RoomSnapshot;
  you: PlayerId;
  lastResult: LastResult | null;
  myPick: number | null;
  onPick: (node: number) => void;
  onRematch: () => void;
  onExit: () => void;
  opponentLeft: boolean;
}

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
  );
}

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, deadline - now);
}

export function Game({
  snapshot,
  you,
  lastResult,
  myPick,
  onPick,
  onRematch,
  onExit,
  opponentLeft,
}: Props) {
  const me = you;
  const opp: PlayerId = you === "p1" ? "p2" : "p1";

  const { phase, score, round, tournament, deadline, roundTimerMs, winner, players, youPicked } =
    snapshot;
  const myName = players.find((p) => p.id === me)?.name ?? "You";
  const oppPlayer = players.find((p) => p.id === opp);
  const oppName = oppPlayer?.name ?? "Opponent";
  const oppConnected = oppPlayer?.connected ?? false;

  const remaining = useCountdown(deadline);
  const seconds = remaining !== null ? Math.ceil(remaining / 1000) : null;
  const pct =
    remaining !== null ? Math.min(100, (remaining / (roundTimerMs ?? ROUND_TIMER_MS)) * 100) : 100;
  const urgent = remaining !== null && remaining < 5000;

  const revealing = phase === "revealing" || phase === "matchOver";
  const locked = youPicked || myPick !== null;
  const interactive = phase === "picking" && !locked;
  // You never locked a pick this round → the server auto-picked a random node.
  const timedOut = revealing && myPick === null;

  const yourPick = revealing && lastResult ? lastResult.picks[me] : myPick;
  const oppPick = revealing && lastResult ? lastResult.picks[opp] : null;
  const myOutcome: "you" | "opp" | "tie" | null =
    revealing && lastResult
      ? lastResult.outcome === "tie"
        ? "tie"
        : lastResult.outcome === me
          ? "you"
          : "opp"
      : null;
  const iWon = winner === me;

  // The pending (selected-but-not-committed) pick. Committed via the status
  // line's Lock-in button below; cleared when a fresh picking round starts.
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (interactive) setSelected(null);
  }, [interactive]);
  const degrees = useMemo(() => (tournament ? outDegrees(tournament) : null), [tournament]);

  let status = "Pick a node";
  if (phase === "picking" && locked) status = "Locked in! Waiting on your opponent…";
  if (phase === "picking" && !oppConnected)
    status = `${oppName} disconnected — waiting for them to return…`;
  if (phase === "revealing") {
    if (timedOut) {
      const tail =
        myOutcome === "tie"
          ? "it happened to match — tie!"
          : myOutcome === "you"
            ? "you won anyway!"
            : `${oppName} took the round.`;
      status = `⏱ Time's up! A random node was auto-picked for you — ${tail}`;
    } else {
      status =
        myOutcome === "tie"
          ? "Same pick — it's a tie! No point this round."
          : myOutcome === "you"
            ? "Yay, you win the round!"
            : `${oppName} takes the round.`;
    }
  }
  if (phase === "matchOver") status = iWon ? "You won the match!" : "You lost the match.";

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
            <span className="truncate font-bold">{myName}</span>
          </div>
          <ScorePips value={score[me]} side="you" />
        </div>
        <div className="flex flex-col items-center px-2">
          <div className="font-heading text-3xl font-extrabold tabular-nums">
            <span className="text-win">{score[me]}</span>
            <span className="mx-1 text-muted-foreground">:</span>
            <span className="text-lose">{score[opp]}</span>
          </div>
          <span className="font-heading text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            first to {WINS_TO_WIN}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold">{oppName}</span>
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                oppConnected ? "bg-lose" : "bg-muted-foreground/40",
              )}
              title={oppConnected ? "Connected" : "Reconnecting…"}
            />
          </div>
          <ScorePips value={score[opp]} side="opp" />
        </div>
      </div>

      {/* Timer: kept mounted but hidden off-picking so the graph never shifts up. */}
      <div
        className={cn("mt-4", phase !== "picking" && "invisible")}
        aria-hidden={phase !== "picking"}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-muted-foreground">
            {locked ? "Pick locked" : "Time to pick"}
          </span>
          <span
            className={cn(
              "font-heading font-extrabold tabular-nums",
              urgent ? "text-lose" : "text-foreground",
            )}
          >
            {seconds}s
          </span>
        </div>
        <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-100 ease-linear",
              urgent ? "bg-lose" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Graph */}
      <div className="flex flex-col items-center py-2 sm:flex-1 sm:justify-center sm:py-6">
        {tournament && (
          <TournamentGraph
            tournament={tournament}
            selected={selected}
            onSelect={setSelected}
            yourPick={yourPick}
            oppPick={oppPick}
            revealing={revealing}
            outcome={myOutcome}
            interactive={interactive}
          />
        )}
      </div>

      {/* Status / reveal */}
      <div
        className={cn(
          "rounded-3xl border-2 p-4 text-center transition-colors",
          phase === "revealing" && myOutcome === "you" && "border-win/50 bg-win/10",
          phase === "revealing" && myOutcome === "opp" && "border-lose/50 bg-lose/10",
          (phase === "picking" || myOutcome === "tie") && "border-border bg-card",
          phase === "matchOver" && (iWon ? "border-win/60 bg-win/10" : "border-lose/60 bg-lose/10"),
        )}
      >
        {phase === "matchOver" ? (
          <div className="flex flex-col items-center gap-4">
            <div>
              <div
                className={cn(
                  "font-heading text-3xl font-extrabold",
                  iWon ? "text-win" : "text-lose",
                )}
              >
                {iWon ? "Victory!" : "Defeat!"}
              </div>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Final score {score[me]} : {score[opp]}
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button className="flex-1 rounded-2xl sm:flex-none sm:px-8" onClick={onRematch}>
                Rematch
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-2xl sm:flex-none sm:px-8"
                onClick={onExit}
              >
                Back to lobby
              </Button>
            </div>
          </div>
        ) : interactive && selected !== null && tournament && degrees ? (
          <button
            type="button"
            onClick={() => onPick(selected)}
            className="rounded-full bg-primary px-6 py-2 font-heading text-lg font-bold text-primary-foreground shadow-[0_4px_0_0_var(--border)] transition-transform active:translate-y-px"
          >
            Lock in {tournament.labels[selected]} (beats {degrees[selected]}/{tournament.n - 1})
          </button>
        ) : (
          <p className="font-heading text-lg font-bold">{status}</p>
        )}
      </div>

      {/* Opponent-left overlay */}
      {opponentLeft && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border-2 border-border bg-card p-6 text-center shadow-[0_8px_0_0_var(--border)]">
            <div className="font-heading text-2xl font-extrabold">Opponent left</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Your opponent disconnected and didn't return.
            </p>
            <Button className="mt-5 w-full rounded-2xl" onClick={onExit}>
              Back to lobby
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
