import http from "node:http";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { createRateLimiter, RateLimitError } from "./rate-limit.js";
import {
  isProtocolError,
  type RoomMetadata,
  validateClientId,
  validateEncryptedEnvelope,
  validateRoomId,
} from "./protocol.js";
import { FileSnapshotStore } from "./storage/file-store.js";

type ServerOptions = {
  port?: number;
  dataDir?: string;
  allowedOrigins?: string[] | null;
  maxPayloadBytes?: number;
  rateLimitPerMinute?: number;
};

type JoinedClient = {
  roomId: string;
  clientId: string;
};

const defaultPort = 3002;
const defaultMaxPayloadBytes = 1024 * 1024;
const defaultRateLimitPerMinute = 600;

export function createTabulaRoomServer(options: ServerOptions = {}) {
  const dataDir = options.dataDir ?? process.env.TABULA_ROOM_DATA_DIR ?? path.join(process.cwd(), ".tabula-room", "data");
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins(process.env.TABULA_ROOM_ALLOWED_ORIGINS);
  const maxPayloadBytes = options.maxPayloadBytes ?? numberFromEnv("TABULA_ROOM_MAX_PAYLOAD_BYTES", defaultMaxPayloadBytes);
  const rateLimitPerMinute =
    options.rateLimitPerMinute ?? numberFromEnv("TABULA_ROOM_RATE_LIMIT_PER_MINUTE", defaultRateLimitPerMinute);

  const store = new FileSnapshotStore(dataDir);
  const app = express();
  const server = http.createServer(app);
  const rateLimiter = createRateLimiter({ limit: rateLimitPerMinute });
  const joinedClients = new Map<string, JoinedClient>();
  const roomClients = new Map<string, Map<string, string>>();

  app.use(applyCors(allowedOrigins));
  app.use(express.json({ limit: `${maxPayloadBytes}b` }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "tabula-room",
      version: process.env.npm_package_version ?? "0.1.0",
    });
  });

  app.get("/v1/rooms/:roomId", async (request, response, next) => {
    try {
      const roomId = validateRoomId(request.params.roomId);
      response.json(await roomMetadata(store, roomClients, roomId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/rooms/:roomId/snapshot", async (request, response, next) => {
    try {
      const roomId = validateRoomId(request.params.roomId);
      const snapshot = await store.getSnapshot(roomId);
      if (!snapshot) {
        response.status(404).json({ error: "Snapshot not found" });
        return;
      }
      response.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.put("/v1/rooms/:roomId/snapshot", async (request, response, next) => {
    try {
      const roomId = validateRoomId(request.params.roomId);
      rateLimiter.assertAllowed(`snapshot:${request.ip}:${roomId}`);
      const snapshot = validateEncryptedEnvelope(request.body, {
        expectedRoomId: roomId,
        expectedKind: "snapshot",
        maxPayloadBytes,
      });
      await store.writeSnapshot(snapshot);
      response.status(201).json(await roomMetadata(store, roomClients, roomId));
    } catch (error) {
      next(error);
    }
  });

  app.use(handleError);

  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin, allowedOrigins));
      },
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
    },
    maxHttpBufferSize: maxPayloadBytes,
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    try {
      rateLimiter.assertAllowed(`socket:${socket.handshake.address}`);
    } catch (error) {
      emitSocketError(socket, error);
      socket.disconnect(true);
      return;
    }

    socket.on("room:join", async (payload, acknowledge) => {
      try {
        const roomId = validateRoomId(payload?.roomId);
        const clientId = validateClientId(payload?.clientId);
        await joinRoom({ socket, roomId, clientId, joinedClients, roomClients });
        const peerCount = roomClients.get(roomId)?.size ?? 0;
        acknowledge?.({ ok: true });
        socket.emit("room:joined", { roomId, clientId, peerCount });
        emitPeers(io, roomClients, roomId);
      } catch (error) {
        acknowledge?.({ ok: false, error: errorMessage(error) });
        emitSocketError(socket, error);
      }
    });

    socket.on("room:message", (payload, acknowledge) => {
      try {
        const joined = joinedClients.get(socket.id);
        if (!joined) {
          throw new SocketProtocolError("Join a room before sending messages");
        }
        rateLimiter.assertAllowed(`message:${joined.roomId}`);
        const envelope = validateEncryptedEnvelope(payload, {
          expectedRoomId: joined.roomId,
          maxPayloadBytes,
        });
        socket.to(roomChannel(joined.roomId)).emit("room:message", envelope);
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.({ ok: false, error: errorMessage(error) });
        emitSocketError(socket, error);
      }
    });

    socket.on("disconnect", () => {
      const joined = joinedClients.get(socket.id);
      if (!joined) {
        return;
      }
      joinedClients.delete(socket.id);
      roomClients.get(joined.roomId)?.delete(socket.id);
      emitPeers(io, roomClients, joined.roomId);
    });
  });

  return {
    app,
    server,
    io,
    store,
    start(port = options.port ?? numberFromEnv("PORT", defaultPort)) {
      return new Promise<void>((resolve) => {
        server.listen(port, resolve);
      });
    },
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    },
  };
}

async function roomMetadata(
  store: FileSnapshotStore,
  roomClients: Map<string, Map<string, string>>,
  roomId: string,
): Promise<RoomMetadata> {
  const activeConnections = roomClients.get(roomId)?.size ?? 0;
  const metadata = await store.getRoomMetadata(roomId, activeConnections);
  return { ...metadata, activeConnections };
}

async function joinRoom({
  socket,
  roomId,
  clientId,
  joinedClients,
  roomClients,
}: {
  socket: Socket;
  roomId: string;
  clientId: string;
  joinedClients: Map<string, JoinedClient>;
  roomClients: Map<string, Map<string, string>>;
}) {
  const previous = joinedClients.get(socket.id);
  if (previous) {
    await socket.leave(roomChannel(previous.roomId));
    roomClients.get(previous.roomId)?.delete(socket.id);
  }

  await socket.join(roomChannel(roomId));
  joinedClients.set(socket.id, { roomId, clientId });
  const clients = roomClients.get(roomId) ?? new Map<string, string>();
  clients.set(socket.id, clientId);
  roomClients.set(roomId, clients);
}

function emitPeers(io: SocketIOServer, roomClients: Map<string, Map<string, string>>, roomId: string) {
  const peers = [...(roomClients.get(roomId)?.values() ?? [])];
  io.to(roomChannel(roomId)).emit("room:peers", { roomId, peers });
}

function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

function applyCors(allowedOrigins: string[] | null) {
  return (request: Request, response: Response, next: NextFunction) => {
    const origin = request.headers.origin;
    if (typeof origin === "string" && isAllowedOrigin(origin, allowedOrigins)) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "origin");
    }
    response.setHeader("access-control-allow-methods", "GET,PUT,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    next();
  };
}

function handleError(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (isProtocolError(error)) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (error instanceof RateLimitError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({ error: "Request body is too large" });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
}

function emitSocketError(socket: Socket, error: unknown) {
  socket.emit("room:error", { error: errorMessage(error) });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[] | null) {
  if (!origin) {
    return true;
  }
  if (!allowedOrigins) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
  }
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

function parseAllowedOrigins(value: string | undefined) {
  if (!value) {
    return null;
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

class SocketProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocketProtocolError";
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const instance = createTabulaRoomServer();
  await instance.start();
  const address = instance.server.address();
  const port = typeof address === "object" && address ? address.port : numberFromEnv("PORT", defaultPort);
  console.log(`Tabula Room listening on http://localhost:${port}`);
}
