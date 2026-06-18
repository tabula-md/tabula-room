import { describe, expect, it } from "vitest";
import { validateClientId, validateEncryptedEnvelope, validateRoomId } from "../src/protocol.js";

const envelope = {
  v: 1,
  roomId: "room_123",
  kind: "snapshot",
  version: 1,
  iv: "YWJjMTIz",
  ciphertext: "Y2lwaGVydGV4dA",
  createdAt: "2026-06-18T00:00:00.000Z",
} as const;

describe("protocol validation", () => {
  it("accepts safe room and client ids", () => {
    expect(validateRoomId("room_123-abc")).toBe("room_123-abc");
    expect(validateClientId("client_123-abc")).toBe("client_123-abc");
  });

  it("rejects unsafe room ids", () => {
    expect(() => validateRoomId("../room")).toThrow(/Invalid room id/);
    expect(() => validateRoomId("room with space")).toThrow(/Invalid room id/);
  });

  it("validates encrypted envelopes without decrypting content", () => {
    expect(validateEncryptedEnvelope(envelope, { expectedRoomId: "room_123", expectedKind: "snapshot" })).toEqual(envelope);
  });

  it("rejects plaintext and key fields", () => {
    expect(() =>
      validateEncryptedEnvelope({
        ...envelope,
        roomKey: "secret",
      }),
    ).toThrow(/roomKey/);
    expect(() =>
      validateEncryptedEnvelope({
        ...envelope,
        markdown: "# Secret",
      }),
    ).toThrow(/markdown/);
  });

  it("rejects route mismatches and large payloads", () => {
    expect(() => validateEncryptedEnvelope(envelope, { expectedRoomId: "other" })).toThrow(/does not match/);
    expect(() =>
      validateEncryptedEnvelope(
        {
          ...envelope,
          ciphertext: "a".repeat(128),
        },
        { maxPayloadBytes: 8 },
      ),
    ).toThrow(/too large/);
  });
});
