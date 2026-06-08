import { useCallback, useEffect, useRef, useState } from "react";
import { Lobby } from "@/components/Lobby";
import { Waiting } from "@/components/Waiting";
import { Game, type LastResult } from "@/components/Game";
import { Net, type Status } from "@/net/socket";
import type { PlayerId, RoomSnapshot, ServerMsg } from "@shared/protocol";

const SESSION_KEY = "rps-roulette";

interface Session {
  code: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function roomFromUrl(): string | undefined {
  try {
    return new URLSearchParams(location.search).get("room")?.toUpperCase() ?? undefined;
  } catch {
    return undefined;
  }
}

export function App() {
  const [status, setStatus] = useState<Status>("connecting");
  const [you, setYou] = useState<PlayerId | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [myPick, setMyPick] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);

  const netRef = useRef<Net | null>(null);
  const roundRef = useRef(0);
  const nameRef = useRef("");

  const handleMessage = useCallback((m: ServerMsg) => {
    switch (m.t) {
      case "joined":
        setYou(m.you);
        setOpponentLeft(false);
        setError(null);
        setMyPick(null);
        setLastResult(null);
        roundRef.current = m.state.round;
        setSnapshot(m.state);
        saveSession({ code: m.code, token: m.token });
        break;
      case "state":
        if (m.state.round !== roundRef.current) {
          roundRef.current = m.state.round;
          setMyPick(null);
          setLastResult(null);
        }
        setSnapshot(m.state);
        break;
      case "roundResult":
        setLastResult({ picks: m.picks, outcome: m.outcome, score: m.score });
        break;
      case "opponentLeft":
        setOpponentLeft(true);
        break;
      case "error":
        if (m.code === "invalid_pick") {
          // Server rejected the pick — roll back the optimistic highlight/lock.
          setMyPick(null);
          break;
        }
        setError(m.message);
        if (m.code === "room_not_found" || m.code === "bad_token") {
          // A failed (auto-)reconnect or stale code — drop back to the lobby.
          clearSession();
          setYou(null);
          setSnapshot(null);
          setLastResult(null);
        }
        break;
    }
  }, []);

  useEffect(() => {
    const net = new Net({
      onMessage: handleMessage,
      onStatus: setStatus,
      getReconnect: () => {
        const s = loadSession();
        return s ? { t: "reconnect", code: s.code, token: s.token } : null;
      },
    });
    netRef.current = net;
    net.connect();
    return () => net.close();
  }, [handleMessage]);

  const create = useCallback((name: string) => {
    nameRef.current = name;
    setError(null);
    netRef.current?.send({ t: "create", name });
  }, []);

  const createBot = useCallback((name: string) => {
    nameRef.current = name;
    setError(null);
    netRef.current?.send({ t: "createBot", name });
  }, []);

  const join = useCallback((code: string, name: string) => {
    nameRef.current = name;
    setError(null);
    netRef.current?.send({ t: "join", code, name });
  }, []);

  const pick = useCallback((node: number) => {
    setMyPick(node);
    netRef.current?.send({ t: "pick", node });
  }, []);

  const rematch = useCallback(() => {
    setLastResult(null);
    netRef.current?.send({ t: "rematch" });
  }, []);

  const exit = useCallback(() => {
    netRef.current?.send({ t: "leave" });
    clearSession();
    setYou(null);
    setSnapshot(null);
    setLastResult(null);
    setMyPick(null);
    setOpponentLeft(false);
    setError(null);
  }, []);

  const disconnected = status !== "open";

  let view;
  if (!you || !snapshot) {
    view = (
      <Lobby
        onCreate={create}
        onCreateBot={createBot}
        onJoin={join}
        initialCode={roomFromUrl()}
        error={error}
        busy={disconnected}
      />
    );
  } else if (snapshot.phase === "waiting") {
    view = <Waiting code={snapshot.code} onCancel={exit} />;
  } else {
    view = (
      <Game
        snapshot={snapshot}
        you={you}
        lastResult={lastResult}
        myPick={myPick}
        onPick={pick}
        onRematch={rematch}
        onExit={exit}
        opponentLeft={opponentLeft}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {disconnected && (
        <div className="fixed inset-x-0 top-0 z-20 bg-lose/90 py-1.5 text-center text-xs font-bold text-card">
          {status === "connecting" ? "Connecting…" : "Connection lost — reconnecting…"}
        </div>
      )}
      {view}
    </div>
  );
}
