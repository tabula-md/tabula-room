import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type EncryptedEnvelope, type RoomMetadata, validateEncryptedEnvelope, validateRoomId } from "../protocol.js";

type SnapshotRecord = {
  snapshot: EncryptedEnvelope;
  updatedAt: string;
};

export class FileSnapshotStore {
  constructor(private readonly dataDir: string) {}

  async getRoomMetadata(roomIdInput: string, activeConnections = 0): Promise<RoomMetadata> {
    const roomId = validateRoomId(roomIdInput);
    const record = await this.readSnapshotRecord(roomId);
    return {
      roomId,
      activeConnections,
      snapshotVersion: record?.snapshot.version ?? null,
      updatedAt: record?.updatedAt ?? null,
    };
  }

  async getSnapshot(roomIdInput: string): Promise<EncryptedEnvelope | null> {
    const roomId = validateRoomId(roomIdInput);
    const record = await this.readSnapshotRecord(roomId);
    return record?.snapshot ?? null;
  }

  async writeSnapshot(snapshotInput: EncryptedEnvelope): Promise<RoomMetadata> {
    const roomId = validateRoomId(snapshotInput.roomId);
    const snapshot = validateEncryptedEnvelope(snapshotInput, {
      expectedRoomId: roomId,
      expectedKind: "snapshot",
    });
    const record: SnapshotRecord = {
      snapshot,
      updatedAt: new Date().toISOString(),
    };
    const roomDir = this.roomDir(roomId);
    await fs.mkdir(roomDir, { recursive: true });
    await writeFileAtomically(this.snapshotPath(roomId), `${JSON.stringify(record, null, 2)}\n`);
    return {
      roomId,
      activeConnections: 0,
      snapshotVersion: snapshot.version,
      updatedAt: record.updatedAt,
    };
  }

  private async readSnapshotRecord(roomId: string): Promise<SnapshotRecord | null> {
    try {
      return parseSnapshotRecord(await fs.readFile(this.snapshotPath(roomId), "utf8"), roomId);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private roomDir(roomId: string) {
    const root = path.resolve(this.dataDir);
    const roomDir = path.resolve(root, roomId);
    if (roomDir !== root && !roomDir.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid snapshot path");
    }
    return roomDir;
  }

  private snapshotPath(roomId: string) {
    return path.join(this.roomDir(roomId), "snapshot.json");
  }
}

async function writeFileAtomically(filePath: string, data: string) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.snapshot.${process.pid}.${randomUUID()}.tmp`);

  try {
    await fs.writeFile(temporaryPath, data, { flag: "wx" });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function parseSnapshotRecord(raw: string, roomId: string): SnapshotRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SnapshotStorageError("Invalid snapshot record");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SnapshotStorageError("Invalid snapshot record");
  }

  const record = value as Partial<SnapshotRecord>;
  try {
    return {
      snapshot: validateEncryptedEnvelope(record.snapshot, {
        expectedRoomId: roomId,
        expectedKind: "snapshot",
      }),
      updatedAt: validateStoredTimestamp(record.updatedAt),
    };
  } catch {
    throw new SnapshotStorageError("Invalid snapshot record");
  }
}

function validateStoredTimestamp(value: unknown) {
  if (typeof value !== "string") {
    throw new SnapshotStorageError("Invalid snapshot record");
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new SnapshotStorageError("Invalid snapshot record");
  }

  return value;
}

class SnapshotStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotStorageError";
  }
}
