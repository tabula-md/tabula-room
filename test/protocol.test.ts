import { describe, expect, it } from "vitest";
import { ENVELOPE_KINDS, validateClientId, validateEncryptedEnvelope, validateRoomId } from "../src/protocol.js";

const envelope = {
  v: 1,
  roomId: "room_123",
  kind: "room-event",
  version: 1,
  iv: "YWJjMTIz",
  ciphertext: "Y2lwaGVydGV4dA",
  createdAt: "2026-06-18T00:00:00.000Z",
} as const;

describe("protocol validation", () => {
  it("exposes only the room event envelope contract", () => {
    expect(ENVELOPE_KINDS).toEqual(["room-event"]);
  });

  it("accepts safe room and client ids", () => {
    expect(validateRoomId("room_123-abc")).toBe("room_123-abc");
    expect(validateClientId("client_123-abc")).toBe("client_123-abc");
  });

  it("rejects unsafe room ids", () => {
    expect(() => validateRoomId("../room")).toThrow(/Invalid room id/);
    expect(() => validateRoomId("room with space")).toThrow(/Invalid room id/);
    expect(() => validateRoomId("")).toThrow(/Invalid room id/);
    expect(() => validateRoomId("a".repeat(161))).toThrow(/Invalid room id/);
  });

  it("rejects unsafe client ids", () => {
    expect(() => validateClientId("../client")).toThrow(/Invalid client id/);
    expect(() => validateClientId("client with space")).toThrow(/Invalid client id/);
    expect(() => validateClientId("")).toThrow(/Invalid client id/);
    expect(() => validateClientId("a".repeat(161))).toThrow(/Invalid client id/);
  });

  it("validates encrypted envelopes without decrypting content", () => {
    expect(validateEncryptedEnvelope(envelope, { expectedRoomId: "room_123", expectedKind: "room-event" })).toEqual(
      envelope,
    );
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
    expect(() =>
      validateEncryptedEnvelope({
        ...envelope,
        content: "secret",
      }),
    ).toThrow(/content/);
  });

  it("rejects unsupported envelope fields and invalid envelope shape", () => {
    expect(() => validateEncryptedEnvelope(null)).toThrow(/must be an object/);
    expect(() => validateEncryptedEnvelope([])).toThrow(/must be an object/);
    expect(() =>
      validateEncryptedEnvelope({
        ...envelope,
        author: "client-a",
      }),
    ).toThrow(/Unsupported encrypted envelope field author/);
    expect(() => validateEncryptedEnvelope({ ...envelope, v: 2 })).toThrow(/Unsupported envelope version/);
    expect(() => validateEncryptedEnvelope({ ...envelope, kind: "markdown" })).toThrow(/Invalid envelope kind/);
    expect(() => validateEncryptedEnvelope({ ...envelope, version: -1 })).toThrow(/Invalid envelope version counter/);
    expect(() => validateEncryptedEnvelope({ ...envelope, version: 1.5 })).toThrow(/Invalid envelope version counter/);
  });

  it("requires canonical base64url envelope fields", () => {
    expect(() => validateEncryptedEnvelope({ ...envelope, iv: "abc=" })).toThrow(/Invalid envelope iv/);
    expect(() => validateEncryptedEnvelope({ ...envelope, iv: "a" })).toThrow(/Invalid envelope iv/);
    expect(() => validateEncryptedEnvelope({ ...envelope, iv: "" })).toThrow(/Invalid envelope iv/);
    expect(() => validateEncryptedEnvelope({ ...envelope, iv: "a".repeat(513) })).toThrow(/Invalid envelope iv/);
    expect(() => validateEncryptedEnvelope({ ...envelope, ciphertext: "cipher+text" })).toThrow(
      /Invalid envelope ciphertext/,
    );
    expect(() => validateEncryptedEnvelope({ ...envelope, ciphertext: "" })).toThrow(/Invalid envelope ciphertext/);
  });

  it("requires a valid UTC ISO timestamp", () => {
    expect(() => validateEncryptedEnvelope({ ...envelope, createdAt: "2026-06-18" })).toThrow(
      /Invalid envelope timestamp/,
    );
    expect(() => validateEncryptedEnvelope({ ...envelope, createdAt: "2026-99-18T00:00:00.000Z" })).toThrow(
      /Invalid envelope timestamp/,
    );
    expect(() => validateEncryptedEnvelope({ ...envelope, createdAt: "2026-06-18T00:00:00+09:00" })).toThrow(
      /Invalid envelope timestamp/,
    );

    expect(
      validateEncryptedEnvelope({
        ...envelope,
        createdAt: "2026-06-18T00:00:00Z",
      }).createdAt,
    ).toBe("2026-06-18T00:00:00Z");
  });

  it("rejects route mismatches and large payloads", () => {
    expect(() => validateEncryptedEnvelope(envelope, { expectedRoomId: "other" })).toThrow(/does not match/);
    expect(() =>
      validateEncryptedEnvelope(
        {
          ...envelope,
          ciphertext: "YWJjZA",
        },
        { maxPayloadBytes: 3 },
      ),
    ).toThrow(/too large/);
  });
});
