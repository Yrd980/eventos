import type { Context } from "hono";
import { DomainError } from "./envelope";

export function requireHeader(c: Context, name: string) {
  const value = c.req.header(name);
  if (!value) {
    throw new DomainError("VALIDATION_FAILED", `${name} header is required`, { status: 422 });
  }

  return value;
}

export function readOptionalTenantCode(c: Context) {
  return c.req.query("tenant_code") ?? c.req.header("x-tenant-code") ?? undefined;
}

export function requireIdempotencyKey(c: Context) {
  return requireHeader(c, "idempotency-key");
}

export async function readJsonObject(c: Context) {
  const body = await c.req.json().catch(() => undefined);
  if (body === undefined || body === null || Array.isArray(body) || typeof body !== "object") {
    throw new DomainError("VALIDATION_FAILED", "JSON object body is required", { status: 422 });
  }

  return body as Record<string, unknown>;
}

export function readLimit(raw: string | undefined, defaultValue = 20, maximum = 100) {
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new DomainError("VALIDATION_FAILED", `limit must be an integer between 1 and ${maximum}`, { status: 422 });
  }

  return value;
}
