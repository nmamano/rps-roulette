"use client"

import { useState } from "react"
import { Lobby } from "@/components/lobby"
import { Game } from "@/components/game"

export default function Page() {
  const [player, setPlayer] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {player === null ? (
        <Lobby onStart={setPlayer} />
      ) : (
        <Game playerName={player} onExit={() => setPlayer(null)} />
      )}
    </div>
  )
}
