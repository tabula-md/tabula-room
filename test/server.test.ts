import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { AddressInfo } from "node:net";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTabulaRoomServer, installShutdownHandlers } from "../src/server.js";

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

const roomEventEnvelope = {
  v: 1,
  roomId: "room_123",
  kind: "room-event",
  version: 1,
  iv: "YWJjMTIz",
  ciphertext: "Y2lwaGVydGV4dA",
  createdAt: "2026-06-18T00:00:00.000Z",
} as const;

const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
  version: string;
};
const originalNpmPackageVersion = process.env.npm_package_version;

describe("tabula room server", () => {
  let instance: ReturnType<typeof createTabulaRoomServer>;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    delete process.env.npm_package_version;
    await startServer();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }
    await instance.close();
    if (originalNpmPackageVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = originalNpmPackageVersion;
    }
  });

  it("serves service root, health, and room metadata", async () => {
    await request(baseUrl).get("/").expect(200).expect(({ body }) => {
      expect(body).toEqual({
        ok: true,
        service: "tabula-room",
        description: "Encrypted live-collaboration relay for Tabula.md.",
        health: "/health",
        version: packageJson.version,
      });
    });

    await request(baseUrl).get("/health").expect(200).expect(({ body }) => {
      expect(body).toEqual({ ok: true, service: "tabula-room", version: packageJson.version });
    });

    await request(baseUrl)
      .get("/v1/rooms/room_123")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          roomId: "room_123",
          activeConnections: 0,
        });
      });
  });

  it("allows npm package version to override package metadata in health", async () => {
    process.env.npm_package_version = "9.8.7-test";
    await restartServer();

    await request(baseUrl)
      .get("/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true, service: "tabula-room", version: "9.8.7-test" });
      });
  });

  it("does not expose room snapshot HTTP storage", async () => {
    await request(baseUrl).get("/v1/rooms/room_123/snapshot").expect(404);
    await request(baseUrl).put("/v1/rooms/room_123/snapshot").send(roomEventEnvelope).expect(404);
  });

  it("allows configured CORS origins and rejects disallowed origins", async () => {
    await request(baseUrl)
      .get("/health")
      .set("Origin", "http://localhost:5173")
      .expect("access-control-allow-origin", "http://localhost:5173");

    await request(baseUrl)
      .options("/v1/rooms/room_123")
      .set("Origin", "http://localhost:5173")
      .expect(204)
      .expect("access-control-allow-origin", "http://localhost:5173");

    await request(baseUrl)
      .get("/health")
      .set("Origin", "https://evil.example")
      .expect(403)
      .expect({ error: "Origin is not allowed" });

    await request(baseUrl)
      .options("/v1/rooms/room_123")
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

  it("relays encrypted room events as opaque ciphertext", async () => {
    const first = connect();
    const second = connect();
    await waitForConnect(first);
    await waitForConnect(second);

    await joinClient(first, "room_123", "client_a");
    await joinClient(second, "room_123", "client_b");

    const received = waitForEvent(first, "room:message");
    const notEchoed = waitForNoEvent(second, "room:message");
    await emitWithAck(second, "room:message", {
      ...roomEventEnvelope,
      kind: "room-event",
      version: 2,
      ciphertext: "ZW5jcnlwdGVkX3Jvb21fZXZlbnQ",
    });

    await expect(received).resolves.toMatchObject({
      roomId: "room_123",
      kind: "room-event",
      version: 2,
      ciphertext: "ZW5jcnlwdGVkX3Jvb21fZXZlbnQ",
    });
    await notEchoed;
  });

  it("relays volatile encrypted room events without interpreting them", async () => {
    const first = connect();
    const second = connect();
    await waitForConnect(first);
    await waitForConnect(second);

    await joinClient(first, "room_123", "client_a");
    await joinClient(second, "room_123", "client_b");

    const received = waitForEvent(first, "room:message");
    const notEchoed = waitForNoEvent(second, "room:message");
    await emitWithAck(second, "room:volatile-message", {
      ...roomEventEnvelope,
      kind: "room-event",
      version: 2,
      ciphertext: "dm9sYXRpbGVfcm9vbV9ldmVudA",
    });

    await expect(received).resolves.toMatchObject({
      roomId: "room_123",
      kind: "room-event",
      ciphertext: "dm9sYXRpbGVfcm9vbV9ldmVudA",
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
    const firstSeesPeerJoined = waitForEvent(first, "room:peer-joined");
    await expect(joinClient(second, "room_123", "client_b")).resolves.toEqual({
      roomId: "room_123",
      clientId: "client_b",
      peerCount: 2,
    });
    await Promise.all([firstSeesBoth, secondSeesBoth]);
    await expect(firstSeesPeerJoined).resolves.toEqual({ roomId: "room_123", clientId: "client_b" });
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
    await expect(emitWithAck(client, "room:message", { ...roomEventEnvelope, iv: "bad=" })).rejects.toThrow(
      /Invalid envelope iv/,
    );
    await expect(errorEvent).resolves.toEqual({ error: "Invalid envelope iv" });
    expect(client.connected).toBe(true);
  });

  it("rejects unsupported envelope kinds without disconnecting the client", async () => {
    const client = connect();
    await waitForConnect(client);
    await joinClient(client, "room_123", "client_a");

    const errorEvent = waitForEvent<{ error: string }>(client, "room:error");
    await expect(
      emitWithAck(client, "room:message", { ...roomEventEnvelope, kind: "unsupported" }),
    ).rejects.toThrow(/Invalid envelope kind/);
    await expect(errorEvent).resolves.toEqual({ error: "Invalid envelope kind" });
    expect(client.connected).toBe(true);
  });

  it("rejects plaintext-like fields on room-event envelopes", async () => {
    const client = connect();
    await waitForConnect(client);
    await joinClient(client, "room_123", "client_a");

    const errorEvent = waitForEvent<{ error: string }>(client, "room:error");
    await expect(
      emitWithAck(client, "room:message", {
        ...roomEventEnvelope,
        kind: "room-event",
        text: "plain text must not reach the relay",
      }),
    ).rejects.toThrow(/text/);
    await expect(errorEvent).resolves.toEqual({ error: "Encrypted envelope must not include text" });
    expect(client.connected).toBe(true);
  });

  it("rate-limits burst socket messages", async () => {
    await restartServer({ rateLimitPerMinute: 1 });
    const client = connect();
    await waitForConnect(client);
    await joinClient(client, "room_123", "client_a");

    await emitWithAck(client, "room:message", roomEventEnvelope);

    const errorEvent = waitForEvent<{ error: string }>(client, "room:error");
    await expect(emitWithAck(client, "room:message", { ...roomEventEnvelope, version: 2 })).rejects.toThrow(
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

    await emitWithAck(first, "room:message", roomEventEnvelope);
    await emitWithAck(first, "room:message", { ...roomEventEnvelope, version: 2 });
    await expect(
      emitWithAck(second, "room:message", {
        ...roomEventEnvelope,
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
      ...roomEventEnvelope,
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

describe("shutdown handling", () => {
  it("closes the server once and exits successfully on SIGTERM", async () => {
    const processLike = new FakeShutdownProcess();
    let closeCalls = 0;

    installShutdownHandlers(
      {
        close: async () => {
          closeCalls += 1;
        },
      },
      processLike,
    );

    processLike.emit("SIGTERM", "SIGTERM");
    await flushMicrotasks();
    processLike.emit("SIGINT", "SIGINT");
    await flushMicrotasks();

    expect(closeCalls).toBe(1);
    expect(processLike.exitCode).toBe(0);
  });

  it("exits non-zero when server shutdown fails", async () => {
    const processLike = new FakeShutdownProcess();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      installShutdownHandlers(
        {
          close: async () => {
            throw new Error("close failed");
          },
        },
        processLike,
      );

      processLike.emit("SIGINT", "SIGINT");
      await flushMicrotasks();

      expect(processLike.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith("Failed to stop Tabula Room after SIGINT: close failed");
    } finally {
      errorSpy.mockRestore();
    }
  });
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

class FakeShutdownProcess extends EventEmitter {
  exitCode: number | null = null;

  exit(code = 0): never {
    this.exitCode = code;
    return undefined as never;
  }
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
