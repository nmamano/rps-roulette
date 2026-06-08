import { useMemo, useState } from "react";
import type { Tournament } from "@shared/tournament";
import { outDegrees } from "@shared/tournament";
import { cn } from "@/lib/cn";

interface Props {
  tournament: Tournament;
  onPick: (node: number) => void;
  yourPick: number | null;
  oppPick: number | null;
  locked: boolean;
  revealing: boolean;
  outcome: "you" | "opp" | "tie" | null;
  interactive: boolean;
}

const SIZE = 460;
const CENTER = SIZE / 2;
const RADIUS = 168;
const NODE_R = 32;

export function TournamentGraph({
  tournament,
  onPick,
  yourPick,
  oppPick,
  revealing,
  outcome,
  interactive,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const { n, labels, beats } = tournament;

  const points = useMemo(() => {
    return Array.from({ length: n }, (_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return {
        x: CENTER + RADIUS * Math.cos(angle),
        y: CENTER + RADIUS * Math.sin(angle),
      };
    });
  }, [n]);

  const degrees = useMemo(() => outDegrees(tournament), [tournament]);

  // The single deciding edge during reveal.
  const decidingEdge = useMemo(() => {
    if (!revealing || yourPick === null || oppPick === null || yourPick === oppPick) return null;
    return { a: yourPick, b: oppPick };
  }, [revealing, yourPick, oppPick]);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-full max-w-[460px] touch-none overflow-visible select-none"
        role="img"
        aria-label="Tournament graph. Hover a node to see what it beats."
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
          </marker>
          <marker
            id="arrow-win"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-win" />
          </marker>
          <marker
            id="arrow-lose"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-lose" />
          </marker>
          <marker
            id="arrow-decide"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-accent" />
          </marker>
          <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="4"
              floodColor="oklch(0.6 0.08 25)"
              floodOpacity="0.18"
            />
          </filter>
        </defs>

        {/* Edges */}
        {points.map((_, i) =>
          points.map((_, j) => {
            if (i >= j) return null;
            const from = beats[i][j] ? i : j;
            const to = beats[i][j] ? j : i;
            const p1 = points[from];
            const p2 = points[to];

            // Offset endpoints to the node circle edge and curve slightly.
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const sx = p1.x + ux * NODE_R;
            const sy = p1.y + uy * NODE_R;
            const ex = p2.x - ux * (NODE_R + 4);
            const ey = p2.y - uy * (NODE_R + 4);

            // Bow every edge AWAY from the graph center (independent of the
            // arrow's direction) so the perimeter edges form a clean circular
            // outline. Central chords bow only gently.
            const midX = (sx + ex) / 2;
            const midY = (sy + ey) / 2;
            let nx = -uy;
            let ny = ux;
            const outX = midX - CENTER;
            const outY = midY - CENTER;
            if (nx * outX + ny * outY < 0) {
              nx = -nx;
              ny = -ny;
            }
            const rimFrac = Math.min(1, Math.hypot(outX, outY) / RADIUS);
            const bow = 12 + 30 * rimFrac;
            const mx = midX + nx * bow;
            const my = midY + ny * bow;

            const isDeciding =
              decidingEdge !== null &&
              ((decidingEdge.a === from && decidingEdge.b === to) ||
                (decidingEdge.a === to && decidingEdge.b === from));

            // Hover hint: highlight edges touching the hovered node.
            let state: "win" | "lose" | "idle" = "idle";
            if (hover !== null && !revealing) {
              if (from === hover) state = "win";
              else if (to === hover) state = "lose";
            }

            // Edges not connected to focus stay clearly visible (lighter, not invisible).
            const faded =
              (hover !== null && state === "idle" && !revealing) || (revealing && !isDeciding);

            return (
              <path
                key={`${i}-${j}`}
                d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
                fill="none"
                strokeLinecap="round"
                strokeWidth={isDeciding ? 5 : state !== "idle" ? 3.5 : 2.5}
                markerEnd={
                  isDeciding
                    ? "url(#arrow-decide)"
                    : state === "win"
                      ? "url(#arrow-win)"
                      : state === "lose"
                        ? "url(#arrow-lose)"
                        : "url(#arrow)"
                }
                className={cn(
                  "transition-all duration-300",
                  isDeciding
                    ? "stroke-accent"
                    : state === "win"
                      ? "stroke-win"
                      : state === "lose"
                        ? "stroke-lose"
                        : "stroke-muted-foreground",
                )}
                style={{ opacity: faded ? 0.3 : 0.85 }}
              />
            );
          }),
        )}

        {/* Nodes */}
        {points.map((p, i) => {
          const isYou = yourPick === i;
          const isOpp = oppPick === i && revealing;
          const isHover = hover === i;
          const isWinner =
            revealing &&
            outcome !== "tie" &&
            ((outcome === "you" && isYou) || (outcome === "opp" && isOpp));

          return (
            <g
              key={i}
              onMouseEnter={() => interactive && setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => interactive && onPick(i)}
              onFocus={() => interactive && setHover(i)}
              onBlur={() => setHover(null)}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={
                interactive ? `Pick node ${labels[i]}, beats ${degrees[i]} of ${n - 1}` : undefined
              }
              onKeyDown={(e) => {
                if (interactive && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onPick(i);
                }
              }}
              className={cn("origin-center transition-transform", interactive && "cursor-pointer")}
              style={{
                transform: isHover || isYou || isOpp ? "scale(1.08)" : undefined,
                transformBox: "fill-box",
                transformOrigin: "center",
              }}
            >
              {isWinner && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_R + 9}
                  className="fill-none stroke-accent"
                  strokeWidth={4}
                >
                  <animate
                    attributeName="r"
                    values={`${NODE_R + 5};${NODE_R + 13};${NODE_R + 5}`}
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={NODE_R}
                filter="url(#soft)"
                className={cn(
                  "transition-colors duration-200",
                  isYou
                    ? "fill-win stroke-win"
                    : isOpp
                      ? "fill-lose stroke-lose"
                      : isHover
                        ? "fill-secondary stroke-primary"
                        : "fill-card stroke-border",
                )}
                strokeWidth={isYou || isOpp ? 4 : 3}
              />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                className={cn(
                  "pointer-events-none font-heading text-[24px] font-bold",
                  isYou || isOpp ? "fill-card" : "fill-foreground",
                )}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover legend. Both rows have fixed dimensions so nothing shifts (and
          the vertically-centered graph above never moves) when hovering. */}
      {interactive && (
        <div className="mt-3 flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-x-5">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-full bg-win" /> beats
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-full bg-lose" /> loses to
            </span>
          </div>
          {/* Reserved-height row: the badge toggles visibility, never layout. */}
          <div className="flex h-7 items-center">
            <span
              className="rounded-full bg-secondary px-3 py-0.5 font-heading font-bold text-secondary-foreground"
              style={{ visibility: hover !== null ? "visible" : "hidden" }}
            >
              {hover !== null ? `${labels[hover]} beats ${degrees[hover]}/${n - 1}` : " "}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
