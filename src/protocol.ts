import { Buffer } from "node:buffer";

export const ENVELOPE_VERSION = 1;

export const ENVELOPE_KINDS = ["yjs-update", "presence", "snapshot"] as const;

export type EnvelopeKind = (typeof ENVELOPE_KINDS)[number];

export type EncryptedEnvelope = {
  v: 1;
  roomId: string;
  kind: EnvelopeKind;
  version: number;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export type RoomMetadata = {
  roomId: string;
  activeConnections: number;
  snapshotVersion: number | null;
  updatedAt: string | null;
};

const roomIdPattern = /^[a-zA-Z0-9_-]{1,160}$/;
const clientIdPattern = /^[a-zA-Z0-9_-]{1,160}$/;
const base64UrlPattern = /^[a-zA-Z0-9_-]+$/;
const isoUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const envelopeFields = ["v", "roomId", "kind", "version", "iv", "ciphertext", "createdAt"] as const;
const envelopeFieldSet = new Set<string>(envelopeFields);
const forbiddenPlaintextFields = new Set(["roomKey", "key", "plaintext", "markdown", "text", "content"]);

export function validateRoomId(value: unknown): string {
  if (typeof value !== "string" || !roomIdPattern.test(value)) {
    throw new ProtocolError(400, "Invalid room id");
  }
  return value;
}

export function validateClientId(value: unknown): string {
  if (typeof value !== "string" || !clientIdPattern.test(value)) {
    throw new ProtocolError(400, "Invalid client id");
  }
  return value;
}

export function validateEncryptedEnvelope(
  value: unknown,
  options: { expectedRoomId?: string; expectedKind?: EnvelopeKind; maxPayloadBytes?: number } = {},
): EncryptedEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProtocolError(400, "Encrypted envelope must be an object");
  }

  for (const key of Object.keys(value)) {
    if (forbiddenPlaintextFields.has(key)) {
      throw new ProtocolError(400, `Encrypted envelope must not include ${key}`);
    }
    if (!envelopeFieldSet.has(key)) {
      throw new ProtocolError(400, `Unsupported encrypted envelope field ${key}`);
    }
  }

  const envelope = value as Partial<EncryptedEnvelope>;
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new ProtocolError(400, "Unsupported envelope version");
  }

  const roomId = validateRoomId(envelope.roomId);
  if (options.expectedRoomId && roomId !== options.expectedRoomId) {
    throw new ProtocolError(400, "Envelope room id does not match route");
  }

  if (!isEnvelopeKind(envelope.kind)) {
    throw new ProtocolError(400, "Invalid envelope kind");
  }
  if (options.expectedKind && envelope.kind !== options.expectedKind) {
    throw new ProtocolError(400, `Expected ${options.expectedKind} envelope`);
  }

  const version = envelope.version;
  if (!Number.isSafeInteger(version) || version === undefined || version < 0) {
    throw new ProtocolError(400, "Invalid envelope version counter");
  }

  const iv = validateBase64UrlField(envelope.iv, "iv", { maxChars: 512 });
  const ciphertext = validateBase64UrlField(envelope.ciphertext, "ciphertext");

  const maxPayloadBytes = options.maxPayloadBytes ?? 1024 * 1024;
  if (ciphertext.byteLength > maxPayloadBytes) {
    throw new ProtocolError(413, "Encrypted envelope is too large");
  }

  const createdAt = validateCreatedAt(envelope.createdAt);

  return {
    v: ENVELOPE_VERSION,
    roomId,
    kind: envelope.kind,
    version,
    iv: iv.value,
    ciphertext: ciphertext.value,
    createdAt,
  };
}

export function isEnvelopeKind(value: unknown): value is EnvelopeKind {
  return typeof value === "string" && ENVELOPE_KINDS.includes(value as EnvelopeKind);
}

export function isProtocolError(error: unknown): error is ProtocolError {
  return error instanceof ProtocolError;
}

export class ProtocolError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

function validateBase64UrlField(value: unknown, fieldName: "iv" | "ciphertext", options: { maxChars?: number } = {}) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolError(400, `Invalid envelope ${fieldName}`);
  }

  if (options.maxChars !== undefined && value.length > options.maxChars) {
    throw new ProtocolError(400, `Invalid envelope ${fieldName}`);
  }

  if (!base64UrlPattern.test(value) || value.length % 4 === 1) {
    throw new ProtocolError(400, `Invalid envelope ${fieldName}`);
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== value) {
    throw new ProtocolError(400, `Invalid envelope ${fieldName}`);
  }

  return {
    value,
    byteLength: decoded.length,
  };
}

function validateCreatedAt(value: unknown) {
  if (typeof value !== "string" || !isoUtcTimestampPattern.test(value)) {
    throw new ProtocolError(400, "Invalid envelope timestamp");
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new ProtocolError(400, "Invalid envelope timestamp");
  }

  const expected = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (new Date(timestamp).toISOString() !== expected) {
    throw new ProtocolError(400, "Invalid envelope timestamp");
  }

  return value;
}
