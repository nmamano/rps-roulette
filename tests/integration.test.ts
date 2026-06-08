// End-to-end integration over a real WebSocket against the actual server,
// booted in-process on an ephemeral port. Covers the highest-risk wire
// behaviors: hidden picks, server-driven round advance, reconnect-by-token,
// bad-token rejection, opponent-left, and room join errors.

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import app from "../server/index.ts";
import type { ClientMsg, ServerMsg } from "../shared/protocol";

type OfType<K extends ServerMsg["t"]> = Extract<ServerMsg, { t: K }>;

let server: ReturnType<typeof Bun.serve>;
let WS_URL = "";

beforeAll(() => {
  server = Bun.serve({ port: 0, fetch: app.fetch, websocket: app.websocket });
  WS_URL = `ws://localhost:${server.port}/ws`;
});
afterAll(() => server.stop(true));

interface Client {
  send(m: ClientMsg): void;
  opened(): Promise<void>;
  waitFor<K extends ServerMsg["t"]>(
    t: K,
    extra?: (m: OfType<K>) => boolean,
    ms?: number,
  ): Promise<OfType<K>>;
  last<K extends ServerMsg["t"]>(t: K): OfType<K> | null;
  states(): OfType<"state">[];
  close(): void;
}

function client(): Client {
  const ws = new WebSocket(WS_URL);
  const inbox: ServerMsg[] = [];
  const waiters: Array<(m: ServerMsg) => boolean> = [];

  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const m = JSON.parse(e.data) as ServerMsg;
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i](m)) waiters.splice(i, 1);
  };

  return {
    send: (m) => ws.send(JSON.stringify(m)),
    opened: () =>
      new Promise<void>((r) =>
        ws.readyState === WebSocket.OPEN ? r() : ws.addEventListener("open", () => r()),
      ),
    waitFor: (t, extra, ms = 2500) => {
      const match = (m: ServerMsg): m is OfType<typeof t> =>
        m.t === t && (!extra || extra(m as OfType<typeof t>));
      const existing = inbox.find(match);
      if (existing) return Promise.resolve(existing as OfType<typeof t>);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), ms);
        waiters.push((m) => {
          if (match(m)) {
            clearTimeout(timer);
            resolve(m as OfType<typeof t>);
            return true;
          }
          return false;
        });
      });
    },
    last: (t) => {
      for (let i = inbox.length - 1; i >= 0; i--)
        if (inbox[i].t === t) return inbox[i] as OfType<typeof t>;
      return null;
    },
    states: () => inbox.filter((m): m is OfType<"state"> => m.t === "state"),
    close: () => ws.close(),
  };
}

async function startMatch() {
  const p1 = client();
  await p1.opened();
  p1.send({ t: "create", name: "Alice" });
  const j1 = await p1.waitFor("joined");
  const p2 = client();
  await p2.opened();
  p2.send({ t: "join", code: j1.code, name: "Bob" });
  const j2 = await p2.waitFor("joined");
  await p1.waitFor("state", (m) => m.state.phase === "picking");
  return { p1, p2, j1, j2 };
}

describe("integration (real WS)", () => {
  test("create + join start a synchronized picking round", async () => {
    const { p1, p2, j1, j2 } = await startMatch();
    expect(j1.you).toBe("p1");
    expect(j2.you).toBe("p2");
    expect(j1.token.length).toBeGreaterThanOrEqual(12);
    const s = p1.last("state")!;
    expect(s.state.phase).toBe("picking");
    expect(s.state.players.find((p) => p.id === "p2")?.name).toBe("Bob");
    p1.close();
    p2.close();
  });

  test("picks stay hidden until both lock, then resolve and the server advances the round", async () => {
    const { p1, p2 } = await startMatch();

    p1.send({ t: "pick", node: 0 });
    const afterP1 = await p1.waitFor("state", (m) => m.state.youPicked === true);
    expect(afterP1.state.bothPicked).toBe(false);
    // p2 hasn't picked and never saw a pick value
    expect(p2.last("state")?.state.youPicked).toBe(false);

    p2.send({ t: "pick", node: 1 });
    const rr = await p1.waitFor("roundResult");
    expect(["p1", "p2", "tie"]).toContain(rr.outcome);

    // Anti-cheat: no state snapshot ever carried a pick field.
    expect(p2.states().every((m) => !JSON.stringify(m.state).includes('"pick"'))).toBe(true);

    // Server-driven reveal → next round (REVEAL_MS).
    const next = await p1.waitFor("state", (m) => m.state.round === 2, 5000);
    expect(next.state.phase).toBe("picking");
    p1.close();
    p2.close();
  });

  test("same pick is a tie with no points", async () => {
    const { p1, p2 } = await startMatch();
    p1.send({ t: "pick", node: 0 });
    p2.send({ t: "pick", node: 0 });
    const rr = await p1.waitFor("roundResult");
    expect(rr.outcome).toBe("tie");
    expect(rr.score).toEqual({ p1: 0, p2: 0 });
    p1.close();
    p2.close();
  });

  test("reconnect by token reclaims the slot; bad token is rejected", async () => {
    const { p1, p2, j1 } = await startMatch();

    p1.close();
    await p2.waitFor(
      "state",
      (m) => m.state.players.find((p) => p.id === "p1")?.connected === false,
    );

    const p1b = client();
    await p1b.opened();
    p1b.send({ t: "reconnect", code: j1.code, token: j1.token });
    const rejoined = await p1b.waitFor("joined");
    expect(rejoined.you).toBe("p1");
    await p2.waitFor(
      "state",
      (m) => m.state.players.find((p) => p.id === "p1")?.connected === true,
    );

    const intruder = client();
    await intruder.opened();
    intruder.send({ t: "reconnect", code: j1.code, token: "not-a-real-token" });
    const err = await intruder.waitFor("error");
    expect(err.code).toBe("bad_token");

    p1b.close();
    p2.close();
    intruder.close();
  });

  test("solo vs bot: starts immediately, bot auto-picks, a round resolves", async () => {
    const p = client();
    await p.opened();
    p.send({ t: "createBot", name: "Solo" });
    const j = await p.waitFor("joined");
    expect(j.you).toBe("p1");
    expect(j.state.phase).toBe("picking"); // no waiting room for bot games
    const bot = j.state.players.find((pl) => pl.id === "p2");
    expect(bot?.connected).toBe(true);
    expect((bot?.name.length ?? 0) > 0).toBe(true);

    // Human picks; the bot auto-picks within its think time → the round resolves.
    p.send({ t: "pick", node: 0 });
    const rr = await p.waitFor("roundResult", undefined, 4000);
    expect(["p1", "p2", "tie"]).toContain(rr.outcome);
    p.close();
  });

  test("explicit leave notifies the opponent", async () => {
    const { p1, p2 } = await startMatch();
    p1.send({ t: "leave" });
    await p2.waitFor("opponentLeft");
    p2.close();
  });

  test("join errors: unknown code and full room", async () => {
    const x = client();
    await x.opened();
    x.send({ t: "join", code: "ZZZZ", name: "Nobody" });
    const e1 = await x.waitFor("error");
    expect(e1.code).toBe("room_not_found");
    x.close();

    const { p1, p2, j1 } = await startMatch();
    const c = client();
    await c.opened();
    c.send({ t: "join", code: j1.code, name: "Cat" });
    const e2 = await c.waitFor("error");
    expect(e2.code).toBe("room_full");
    p1.close();
    p2.close();
    c.close();
  });
});
