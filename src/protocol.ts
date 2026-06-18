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

  if (!isBase64Url(envelope.iv) || envelope.iv.length > 512) {
    throw new ProtocolError(400, "Invalid envelope iv");
  }

  if (!isBase64Url(envelope.ciphertext)) {
    throw new ProtocolError(400, "Invalid envelope ciphertext");
  }

  const maxPayloadBytes = options.maxPayloadBytes ?? 1024 * 1024;
  if (estimateBase64UrlBytes(envelope.ciphertext) > maxPayloadBytes) {
    throw new ProtocolError(413, "Encrypted envelope is too large");
  }

  if (typeof envelope.createdAt !== "string" || Number.isNaN(Date.parse(envelope.createdAt))) {
    throw new ProtocolError(400, "Invalid envelope timestamp");
  }

  return {
    v: ENVELOPE_VERSION,
    roomId,
    kind: envelope.kind,
    version,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
    createdAt: envelope.createdAt,
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

function isBase64Url(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && base64UrlPattern.test(value);
}

function estimateBase64UrlBytes(value: string) {
  return Math.floor((value.length * 3) / 4);
}
