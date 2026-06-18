import fs from "node:fs/promises";
import path from "node:path";
import { type EncryptedEnvelope, type RoomMetadata, validateRoomId } from "../protocol.js";

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

  async writeSnapshot(snapshot: EncryptedEnvelope): Promise<RoomMetadata> {
    const roomId = validateRoomId(snapshot.roomId);
    const record: SnapshotRecord = {
      snapshot,
      updatedAt: new Date().toISOString(),
    };
    const roomDir = this.roomDir(roomId);
    await fs.mkdir(roomDir, { recursive: true });
    await fs.writeFile(this.snapshotPath(roomId), `${JSON.stringify(record, null, 2)}\n`);
    return {
      roomId,
      activeConnections: 0,
      snapshotVersion: snapshot.version,
      updatedAt: record.updatedAt,
    };
  }

  private async readSnapshotRecord(roomId: string): Promise<SnapshotRecord | null> {
    try {
      return JSON.parse(await fs.readFile(this.snapshotPath(roomId), "utf8")) as SnapshotRecord;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private roomDir(roomId: string) {
    return path.join(this.dataDir, roomId);
  }

  private snapshotPath(roomId: string) {
    return path.join(this.roomDir(roomId), "snapshot.json");
  }
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
