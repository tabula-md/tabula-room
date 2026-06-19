import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTabulaRoomServer } from "../src/server.js";

type JoinedPayload = {
  roomId: string;
  clientId: string;
  peerCount: number;
};

type PeersPayload = {
  roomId: string;
  peers: string[];
};

type TestServerOptions = Parameters<typeof createTabulaRoomServer>[0];

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
    await startServer();
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

    const stored = await fs.readFile(path.join(dataDir, "room_123", "snapshot.json"), "utf8");
    const record = JSON.parse(stored) as { snapshot: unknown; updatedAt: string };
    expect(record.snapshot).toEqual(snapshot);
    expect(record.updatedAt).toEqual(expect.any(String));
    expect(stored).not.toContain("roomKey");
    expect(stored).not.toContain("plaintext");
    expect(stored).not.toContain("markdown");
  });

  it("keeps only the latest encrypted snapshot", async () => {
    const nextSnapshot = {
      ...snapshot,
      version: 2,
      iv: "bmV4dF9pdg",
      ciphertext: "bmV4dF9jaXBoZXJ0ZXh0",
      createdAt: "2026-06-18T00:01:00.000Z",
    } as const;

    await request(baseUrl).put("/v1/rooms/room_123/snapshot").send(snapshot).expect(201);
    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send(nextSnapshot)
      .expect(201)
      .expect(({ body }) => {
        expect(body.snapshotVersion).toBe(2);
      });

    await request(baseUrl).get("/v1/rooms/room_123/snapshot").expect(200).expect(nextSnapshot);
  });

  it("keeps encrypted snapshots across server restarts", async () => {
    await request(baseUrl).put("/v1/rooms/room_123/snapshot").send(snapshot).expect(201);

    await instance.close();
    instance = createTabulaRoomServer({
      dataDir,
      allowedOrigins: ["http://localhost:5173"],
      maxPayloadBytes: 256,
      rateLimitPerMinute: 1000,
    });
    await new Promise<void>((resolve) => instance.server.listen(0, resolve));
    const address = instance.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    await request(baseUrl).get("/v1/rooms/room_123/snapshot").expect(200).expect(snapshot);
    await request(baseUrl)
      .get("/v1/rooms/room_123")
      .expect(200)
      .expect(({ body }) => {
        expect(body.snapshotVersion).toBe(1);
        expect(body.updatedAt).toEqual(expect.any(String));
      });
  });

  it("does not serve invalid persisted snapshot records", async () => {
    await fs.mkdir(path.join(dataDir, "room_123"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "room_123", "snapshot.json"),
      `${JSON.stringify({
        snapshot: { ...snapshot, markdown: "# Secret" },
        updatedAt: new Date().toISOString(),
      })}\n`,
    );

    await request(baseUrl)
      .get("/v1/rooms/room_123/snapshot")
      .expect(500)
      .expect({ error: "Internal server error" });
  });

  it("rejects path traversal room ids before snapshot storage", async () => {
    await request(baseUrl).put("/v1/rooms/..%2Froom/snapshot").send(snapshot).expect(400);
    await expect(fs.readdir(dataDir)).resolves.toEqual([]);
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

  it("allows configured CORS origins and rejects disallowed origins", async () => {
    await request(baseUrl)
      .get("/health")
      .set("Origin", "http://localhost:5173")
      .expect("access-control-allow-origin", "http://localhost:5173");

    await request(baseUrl)
      .options("/v1/rooms/room_123/snapshot")
      .set("Origin", "http://localhost:5173")
      .expect(204)
      .expect("access-control-allow-origin", "http://localhost:5173");

    await request(baseUrl)
      .get("/health")
      .set("Origin", "https://evil.example")
      .expect(403)
      .expect({ error: "Origin is not allowed" });

    await request(baseUrl)
      .options("/v1/rooms/room_123/snapshot")
      .set("Origin", "https://evil.example")
      .expect(403)
      .expect({ error: "Origin is not allowed" });
  });

  it("rejects disallowed Socket.IO origins", async () => {
    const client = createClient(baseUrl, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      timeout: 500,
      extraHeaders: {
        Origin: "https://evil.example",
      },
    });
    clients.push(client);

    await expect(waitForConnect(client)).rejects.toBeTruthy();
    expect(client.connected).toBe(false);
  });

  it("does not allow authorization headers for Socket.IO handshakes", async () => {
    await request(baseUrl)
      .options("/socket.io/?EIO=4&transport=polling")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Authorization, Content-Type")
      .expect(204)
      .expect("access-control-allow-headers", "Content-Type");
  });

  it("rate-limits burst snapshot writes", async () => {
    await restartServer({ rateLimitPerMinute: 1 });

    await request(baseUrl).put("/v1/rooms/room_123/snapshot").send(snapshot).expect(201);
    await request(baseUrl)
      .put("/v1/rooms/room_123/snapshot")
      .send(snapshot)
      .expect(429)
      .expect({ error: "Rate limit exceeded" });
  });

  it("relays encrypted room messages between joined clients", async () => {
    const first = connect();
    const second = connect();
    await waitForConnect(first);
    await waitForConnect(second);

    await joinClient(first, "room_123", "client_a");
    await joinClient(second, "room_123", "client_b");

    const received = waitForEvent(first, "room:message");
    const notEchoed = waitForNoEvent(second, "room:message");
    await emitWithAck(second, "room:message", {
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
    await notEchoed;
  });

  it("emits joined peer counts and room peer updates", async () => {
    const first = connect();
    const second = connect();
    await waitForConnect(first);
    await waitForConnect(second);

    const firstPeers = waitForPeers(first, "room_123", ["client_a"]);
    await expect(joinClient(first, "room_123", "client_a")).resolves.toEqual({
      roomId: "room_123",
      clientId: "client_a",
      peerCount: 1,
    });
    await firstPeers;

    const firstSeesBoth = waitForPeers(first, "room_123", ["client_a", "client_b"]);
    const secondSeesBoth = waitForPeers(second, "room_123", ["client_a", "client_b"]);
    await expect(joinClient(second, "room_123", "client_b")).resolves.toEqual({
      roomId: "room_123",
      clientId: "client_b",
      peerCount: 2,
    });
    await Promise.all([firstSeesBoth, secondSeesBoth]);
  });

  it("updates peer lists when clients disconnect or switch rooms", async () => {
    const first = connect();
    const second = connect();
    const third = connect();
    await Promise.all([waitForConnect(first), waitForConnect(second), waitForConnect(third)]);

    await joinClient(first, "room_123", "client_a");
    await joinClient(second, "room_123", "client_b");
    await joinClient(third, "other_room", "client_c");

    const firstAfterSwitch = waitForPeers(first, "room_123", ["client_a"]);
    const thirdAfterSwitch = waitForPeers(third, "other_room", ["client_b", "client_c"]);
    await joinClient(second, "other_room", "client_b");
    await Promise.all([firstAfterSwitch, thirdAfterSwitch]);

    const thirdAfterDisconnect = waitForPeers(third, "other_room", ["client_c"]);
    second.disconnect();
    await thirdAfterDisconnect;
  });

  it("rate-limits burst room joins per socket", async () => {
    await restartServer({ rateLimitPerMinute: 2 });
    const first = connect();
    const second = connect();
    await Promise.all([waitForConnect(first), waitForConnect(second)]);

    await joinClient(first, "room_123", "client_a");
    await joinClient(second, "room_123", "client_b");
    await joinClient(first, "other_room", "client_a");

    const errorEvent = waitForEvent<{ error: string }>(first, "room:error");
    await expect(emitWithAck(first, "room:join", { roomId: "third_room", clientId: "client_a" })).rejects.toThrow(
      /Rate limit exceeded/,
    );
    await expect(errorEvent).resolves.toEqual({ error: "Rate limit exceeded" });
    expect(first.connected).toBe(true);

    await expect(joinClient(second, "fourth_room", "client_b")).resolves.toEqual({
      roomId: "fourth_room",
      clientId: "client_b",
      peerCount: 1,
    });
  });

  it("rejects malformed socket messages without disconnecting the client", async () => {
    const client = connect();
    await waitForConnect(client);
    await joinClient(client, "room_123", "client_a");

    const errorEvent = waitForEvent<{ error: string }>(client, "room:error");
    await expect(emitWithAck(client, "room:message", { ...snapshot, iv: "bad=" })).rejects.toThrow(
      /Invalid envelope iv/,
    );
    await expect(errorEvent).resolves.toEqual({ error: "Invalid envelope iv" });
    expect(client.connected).toBe(true);
  });

  it("rate-limits burst socket messages", async () => {
    await restartServer({ rateLimitPerMinute: 1 });
    const client = connect();
    await waitForConnect(client);
    await joinClient(client, "room_123", "client_a");

    await emitWithAck(client, "room:message", { ...snapshot, kind: "presence" });

    const errorEvent = waitForEvent<{ error: string }>(client, "room:error");
    await expect(emitWithAck(client, "room:message", { ...snapshot, kind: "presence", version: 2 })).rejects.toThrow(
      /Rate limit exceeded/,
    );
    await expect(errorEvent).resolves.toEqual({ error: "Rate limit exceeded" });
  });

  it("does not rate-limit every socket in a room when one client sends", async () => {
    await restartServer({ rateLimitPerMinute: 2 });
    const first = connect();
    const second = connect();
    await Promise.all([waitForConnect(first), waitForConnect(second)]);
    await joinClient(first, "room_123", "client_a");
    await joinClient(second, "room_123", "client_b");

    await emitWithAck(first, "room:message", { ...snapshot, kind: "presence" });
    await emitWithAck(first, "room:message", { ...snapshot, kind: "presence", version: 2 });
    await expect(
      emitWithAck(second, "room:message", {
        ...snapshot,
        kind: "presence",
        version: 3,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects oversized socket payloads", async () => {
    const client = connect();
    await waitForConnect(client);
    await joinClient(client, "room_123", "client_a");

    const disconnected = waitForEvent<string>(client, "disconnect");
    client.emit("room:message", {
      ...snapshot,
      kind: "yjs-update",
      ciphertext: "a".repeat(50_000),
    });

    await expect(disconnected).resolves.toEqual(expect.any(String));
    expect(client.connected).toBe(false);
  });

  function connect() {
    const client = createClient(baseUrl, {
      transports: ["websocket"],
      forceNew: true,
    });
    clients.push(client);
    return client;
  }

  async function startServer(options: TestServerOptions = {}) {
    instance = createTabulaRoomServer({
      dataDir,
      allowedOrigins: ["http://localhost:5173"],
      maxPayloadBytes: 256,
      rateLimitPerMinute: 1000,
      ...options,
    });
    await new Promise<void>((resolve) => instance.server.listen(0, resolve));
    const address = instance.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async function restartServer(options: TestServerOptions = {}) {
    await instance.close();
    await startServer(options);
  }
});

function waitForConnect(socket: ClientSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 1_000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, onEvent);
  });
}

function waitForNoEvent(socket: ClientSocket, event: string, timeoutMs = 100) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, timeoutMs);
    const onEvent = () => {
      clearTimeout(timer);
      reject(new Error(`Unexpected ${event}`));
    };
    socket.once(event, onEvent);
  });
}

function waitForPeers(socket: ClientSocket, roomId: string, peers: string[]) {
  return new Promise<void>((resolve, reject) => {
    const expectedPeers = [...peers].sort();
    const timer = setTimeout(() => {
      socket.off("room:peers", onPeers);
      reject(new Error(`Timed out waiting for peers ${expectedPeers.join(",")}`));
    }, 1_000);
    const onPeers = (payload: PeersPayload) => {
      if (payload.roomId !== roomId) {
        return;
      }
      if (JSON.stringify([...payload.peers].sort()) !== JSON.stringify(expectedPeers)) {
        return;
      }
      clearTimeout(timer);
      socket.off("room:peers", onPeers);
      resolve();
    };
    socket.on("room:peers", onPeers);
  });
}

async function joinClient(socket: ClientSocket, roomId: string, clientId: string) {
  const joined = waitForEvent<JoinedPayload>(socket, "room:joined");
  await emitWithAck(socket, "room:join", { roomId, clientId });
  return joined;
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
