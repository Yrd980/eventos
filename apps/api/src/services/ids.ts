import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export function createId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function tokenFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function unbase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export type QRTokenPayload = {
  activity_id: string;
  participant_id: string;
  registration_id: string;
  qr_pass_id: string;
};

export function signQRToken(payload: QRTokenPayload, secret: string) {
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyQRToken(token: string, secret: string): QRTokenPayload | undefined {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) {
      return undefined;
    }

    const expected = createHmac("sha256", secret).update(body).digest("base64url");
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return undefined;
    }

    const parsed = JSON.parse(unbase64Url(body)) as Partial<QRTokenPayload>;
    if (!parsed.activity_id || !parsed.participant_id || !parsed.registration_id || !parsed.qr_pass_id) {
      return undefined;
    }

    return parsed as QRTokenPayload;
  } catch {
    return undefined;
  }
}
