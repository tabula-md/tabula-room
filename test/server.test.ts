import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTabulaRoomServer } from "../src/server.js";

const snapshot = {
  v: 1,
  roomId: "room_123",
  kind: "snapshot",
  version: 1,
  iv: "YWJjMTIz",
  ciphertext: "Y2lwaGVydGV4dA",
  createdAt: "2026-06-18T00:00:00.000Z",
} as const;

describe("tabula room server", () => {
  let dataDir: string;
  let instance: ReturnType<typeof createTabulaRoomServer>;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tabula-room-"));
    instance = createTabulaRoomServer({
      dataDir,
      allowedOrigins: ["http://localhost:5173"],
      maxPayloadBytes: 256,
      rateLimitPerMinute: 1000,
    });
    await new Promise<void>((resolve) => instance.server.listen(0, resolve));
    const address = instance.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }
    await instance.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("serves health and room metadata", async () => {
    await request(baseUrl).get("/health").expect(200).expect(({ body }) => {
      expect(body).toEqual({ ok: true, service: "tabula-room", version: "0.1.0" });
    });

    await request(baseUrl)
      .get("/v1/rooms/room_123")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          roomId: "room_123",
          activeConnections: 0,
          snapshotVersion: null,
          updatedAt: null,
        });
      });
  });

  it("stores and returns encrypted snapshots", async () => {
    await request(baseUrl).get("/v1/rooms/room_123/snapshot").expect(404);

    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send(snapshot)
      .expect(201)
      .expect(({ body }) => {
        expect(body.roomId).toBe("room_123");
        expect(body.snapshotVersion).toBe(1);
        expect(body.updatedAt).toEqual(expect.any(String));
      });

    await request(baseUrl).get("/v1/rooms/room_123/snapshot").expect(200).expect({ ...snapshot });
  });

  it("rejects room keys, plaintext fields, and oversized encrypted payloads", async () => {
    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send({ ...snapshot, roomKey: "secret" })
      .expect(400);

    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send({ ...snapshot, markdown: "# Secret" })
      .expect(400);

    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send({ ...snapshot, ciphertext: "a".repeat(400) })
      .expect(413);
  });

  it("returns clear 4xx errors for malformed snapshot payloads", async () => {
    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400)
      .expect({ error: "Invalid JSON body" });

    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send({ ...snapshot, author: "client-a" })
      .expect(400)
      .expect({ error: "Unsupported encrypted envelope field author" });

    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send({ ...snapshot, iv: "bad=" })
      .expect(400)
      .expect({ error: "Invalid envelope iv" });
  });

  it("applies CORS only to allowed origins", async () => {
    await request(baseUrl)
      .get("/health")
      .set("Origin", "http://localhost:5173")
      .expect("access-control-allow-origin", "http://localhost:5173");

    await request(baseUrl).get("/health").set("Origin", "https://evil.example").expect((response) => {
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  it("relays encrypted room messages between joined clients", async () => {
    const first = connect();
    const second = connect();
    await waitForConnect(first);
    await waitForConnect(second);

    await emitWithAck(first, "room:join", { roomId: "room_123", clientId: "client_a" });
    await emitWithAck(second, "room:join", { roomId: "room_123", clientId: "client_b" });

    const received = waitForEvent(first, "room:message");
    second.emit("room:message", {
      ...snapshot,
      kind: "yjs-update",
      version: 2,
      ciphertext: "ZW5jcnlwdGVkX3VwZGF0ZQ",
    });

    await expect(received).resolves.toMatchObject({
      roomId: "room_123",
      kind: "yjs-update",
      version: 2,
      ciphertext: "ZW5jcnlwdGVkX3VwZGF0ZQ",
    });
  });

  it("rejects malformed socket messages without disconnecting the client", async () => {
    const client = connect();
    await waitForConnect(client);
    await emitWithAck(client, "room:join", { roomId: "room_123", clientId: "client_a" });

    const errorEvent = waitForEvent<{ error: string }>(client, "room:error");
    await expect(emitWithAck(client, "room:message", { ...snapshot, iv: "bad=" })).rejects.toThrow(
      /Invalid envelope iv/,
    );
    await expect(errorEvent).resolves.toEqual({ error: "Invalid envelope iv" });
    expect(client.connected).toBe(true);
  });

  function connect() {
    const client = createClient(baseUrl, {
      transports: ["websocket"],
      forceNew: true,
    });
    clients.push(client);
    return client;
  }
});

function waitForConnect(socket: ClientSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string) {
  return new Promise<T>((resolve) => {
    socket.once(event, resolve);
  });
}

function emitWithAck(socket: ClientSocket, event: string, payload: unknown) {
  return new Promise<void>((resolve, reject) => {
    socket.emit(event, payload, (response: { ok: boolean; error?: string }) => {
      if (response.ok) {
        resolve();
      } else {
        reject(new Error(response.error ?? "Socket acknowledgement failed"));
      }
    });
  });
}
