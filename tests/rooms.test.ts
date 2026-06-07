import { test, expect, describe } from "bun:test";
import { Room, type Connection } from "../server/rooms";
import type { ServerMsg } from "../shared/protocol";

interface FakeConn extends Connection {
  sent: ServerMsg[];
  closed: boolean;
}

function fakeConn(): FakeConn {
  const conn: FakeConn = {
    sent: [],
    closed: false,
    send(m: ServerMsg) {
      conn.sent.push(m);
    },
    close() {
      conn.closed = true;
    },
  };
  return conn;
}

const noop = () => {};

describe("Room connection-identity guards", () => {
  test("a replaced (stale) socket cannot pick for its old pid; the live socket can", () => {
    const room = new Room("TEST", noop);
    const c1 = fakeConn();
    const { token } = room.addCreator("Alice", c1);
    const c2 = fakeConn();
    room.reserveJoiner("Bob", c2); // match starts → picking

    // p1 reconnects on a fresh socket; this replaces (and closes) the old one.
    const c1b = fakeConn();
    const res = room.reconnect(token, c1b);
    expect(res).toEqual({ pid: "p1" });
    expect(c1.closed).toBe(true);

    // The stale socket tries to act for p1 → must be a no-op.
    room.pick("p1", 0, c1);
    expect(room.snapshotFor("p1").youPicked).toBe(false);

    // The live socket can pick.
    room.pick("p1", 0, c1b);
    expect(room.snapshotFor("p1").youPicked).toBe(true);
  });

  test("a stale socket cannot trigger rematch for its old pid", () => {
    const room = new Room("TEST", noop);
    const c1 = fakeConn();
    const { token } = room.addCreator("Alice", c1);
    const c2 = fakeConn();
    room.reserveJoiner("Bob", c2);

    const c1b = fakeConn();
    room.reconnect(token, c1b);

    // Drive the match to matchOver so rematch() would otherwise be valid.
    const m = room.match!;
    for (let i = 0; i < 5; i++) {
      const t = m.tournament!;
      let w = 0;
      let l = 1;
      outer: for (let a = 0; a < t.n; a++)
        for (let b = 0; b < t.n; b++)
          if (a !== b && t.beats[a][b]) {
            w = a;
            l = b;
            break outer;
          }
      room.pick("p1", w, c1b);
      room.pick("p2", l, c2);
      if (m.phase === "revealing") m.advance();
    }
    expect(m.phase).toBe("matchOver");

    // Stale socket's rematch is ignored; the match stays over.
    room.rematch("p1", c1);
    expect(room.match!.phase).toBe("matchOver");

    // The live socket's rematch works.
    room.rematch("p1", c1b);
    expect(room.match!.phase).toBe("picking");
    expect(room.match!.score).toEqual({ p1: 0, p2: 0 });
  });
});
