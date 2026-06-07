"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { WINS_TO_WIN } from "@/lib/tournament"

const ADJ = ["Swift", "Sneaky", "Lucky", "Bold", "Cosmic", "Feral", "Quiet", "Royal", "Atomic", "Vivid"]
const NOUN = ["Fox", "Comet", "Raven", "Tiger", "Specter", "Bishop", "Hydra", "Falcon", "Wolf", "Sphinx"]

function randomName() {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`
}

export function Lobby({ onStart }: { onStart: (name: string) => void }) {
  const [name, setName] = useState(randomName)
  const [code, setCode] = useState("")

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-9 px-6 py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="rounded-full border-2 border-primary/30 bg-card px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-widest text-primary">
          new rules every round
        </span>
        <h1 className="text-balance font-heading text-6xl font-extrabold tracking-tight sm:text-7xl">
          RPS <span className="text-primary">Roulette</span>
        </h1>
        <p className="max-w-md text-pretty font-sans leading-relaxed text-muted-foreground">
          {
            "Rock-Paper-Scissors, but the rules get reshuffled every single round! Each turn spins up a brand-new little tournament graph — follow the arrows, out-guess your pal, and be the first to "
          }
          {WINS_TO_WIN} {"wins."}
        </p>
      </div>

      <div className="w-full rounded-3xl border-2 border-border bg-card p-6 shadow-[0_8px_0_0_var(--border)]">
        <label className="mb-2 block font-heading text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="name">
          Your name
        </label>
        <div className="mb-6 flex gap-2">
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl border-2 border-input bg-background px-4 py-3 font-semibold outline-none transition-colors focus:border-primary"
            placeholder="Enter a name"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setName(randomName())}
            className="shrink-0 rounded-2xl font-bold"
            aria-label="Randomize name"
          >
            Shuffle
          </Button>
        </div>

        <Button
          className="h-13 w-full rounded-2xl py-6 text-base font-bold shadow-[0_5px_0_0_var(--primary-foreground)]/0"
          onClick={() => onStart(name.trim() || "Player")}
        >
          Quick Match vs Bot
        </Button>

        <div className="my-5 flex items-center gap-3 font-heading text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span className="h-0.5 flex-1 rounded-full bg-border" />
          or join a room
          <span className="h-0.5 flex-1 rounded-full bg-border" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            className="w-full rounded-2xl border-2 border-input bg-background px-4 py-3 text-center font-heading text-lg font-bold uppercase tracking-[0.4em] outline-none transition-colors focus:border-primary"
            placeholder="CODE"
            maxLength={4}
          />
          <Button
            type="button"
            variant="outline"
            disabled={code.length < 4}
            onClick={() => onStart(name.trim() || "Player")}
            className="shrink-0 rounded-2xl font-bold"
          >
            Join
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Online rooms are coming soon — for now, warm up against the bot!
        </p>
      </div>

      <div className="grid w-full grid-cols-3 gap-3 text-center">
        {[
          { k: "5–7", v: "nodes / round" },
          { k: "first to 5", v: "takes the match" },
          { k: "20s", v: "to lock a pick" },
        ].map((s) => (
          <div key={s.v} className="rounded-2xl border-2 border-border bg-card px-3 py-4">
            <div className="font-heading text-lg font-extrabold text-primary">{s.k}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.v}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
