// WebSocket connection handling: parse/validate/dispatch ClientMsg, manage each
// socket's binding to a room slot. All game state + broadcasting lives in Room.

import { createBunWebSocket } from "hono/bun";
import type { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { type Connection, type Room, RoomStore } from "./rooms";
import type { ClientMsg, PlayerId } from "../shared/protocol";

const { upgradeWebSocket, websocket } = createBunWebSocket();

function makeConn(ws: WSContext): Connection {
  return {
    send(msg) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        // socket already gone; nothing to do
      }
    },
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
    },
  };
}

export function registerSocket(app: Hono, store: RoomStore) {
  app.get(
    "/ws",
    upgradeWebSocket(() => {
      let conn: Connection | null = null;
      let bound: { room: Room; pid: PlayerId } | null = null;

      // If our room was reaped, drop the stale binding so create/join works again.
      const active = (): { room: Room; pid: PlayerId } | null => {
        if (bound && !store.has(bound.room.code)) bound = null;
        return bound;
      };

      const dispatch = (msg: ClientMsg) => {
        if (!conn) return;
        switch (msg.t) {
          case "create": {
            if (active()) return;
            const room = store.createRoom();
            const { pid, token } = room.addCreator(msg.name, conn);
            bound = { room, pid };
            conn.send({
              t: "joined",
              code: room.code,
              you: pid,
              token,
              state: room.snapshotFor(pid),
            });
            return;
          }
          case "join": {
            if (active()) return;
            const room = store.get(msg.code);
            if (!room) {
              conn.send({ t: "error", code: "room_not_found", message: "No room with that code." });
              return;
            }
            const res = room.reserveJoiner(msg.name, conn);
            if ("error" in res) {
              conn.send({ t: "error", code: res.error, message: res.message });
              return;
            }
            bound = { room, pid: res.pid };
            conn.send({
              t: "joined",
              code: room.code,
              you: res.pid,
              token: res.token,
              state: room.snapshotFor(res.pid),
            });
            room.broadcast(); // push the picking state to both players
            return;
          }
          case "reconnect": {
            if (active()) return;
            const room = store.get(msg.code);
            if (!room) {
              conn.send({ t: "error", code: "room_not_found", message: "Room no longer exists." });
              return;
            }
            const res = room.reconnect(msg.token, conn);
            if ("error" in res) {
              conn.send({ t: "error", code: res.error, message: res.message });
              return;
            }
            bound = { room, pid: res.pid };
            conn.send({
              t: "joined",
              code: room.code,
              you: res.pid,
              token: msg.token,
              state: room.snapshotFor(res.pid),
            });
            room.replayResultTo(res.pid); // re-send an in-progress reveal
            room.broadcast(); // opponent sees presence restored
            return;
          }
          case "pick": {
            const b = active();
            if (b) b.room.pick(b.pid, msg.node, conn);
            return;
          }
          case "rematch": {
            const b = active();
            if (b) b.room.rematch(b.pid, conn);
            return;
          }
          case "leave": {
            const b = active();
            if (b) b.room.leave(b.pid, conn);
            bound = null;
            return;
          }
          default: {
            conn.send({ t: "error", code: "bad_message", message: "Unknown message." });
          }
        }
      };

      return {
        onOpen(_event: Event, ws: WSContext) {
          conn = makeConn(ws);
        },
        onMessage(event: MessageEvent, ws: WSContext) {
          if (!conn) conn = makeConn(ws);
          const raw = typeof event.data === "string" ? event.data : null;
          if (!raw) {
            conn.send({ t: "error", code: "bad_message", message: "Expected a text frame." });
            return;
          }
          let msg: ClientMsg;
          try {
            msg = JSON.parse(raw) as ClientMsg;
          } catch {
            conn.send({ t: "error", code: "bad_message", message: "Malformed JSON." });
            return;
          }
          if (!msg || typeof msg.t !== "string") {
            conn.send({ t: "error", code: "bad_message", message: "Missing message type." });
            return;
          }
          dispatch(msg);
        },
        onClose() {
          if (bound) bound.room.handleDisconnect(bound.pid, conn!);
          bound = null;
        },
      };
    }),
  );

  return websocket;
}
