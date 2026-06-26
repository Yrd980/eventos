import type { BusinessResourceType } from "@eventos/contracts";
import { DomainError } from "../http/envelope";
import { createId, stableHash } from "./ids";
import type { EventOsRepository } from "./repository";

export async function runCommand<T>(input: {
  repo: EventOsRepository;
  commandName: string;
  resourceType: BusinessResourceType;
  resourceId?: string;
  tenantId?: string;
  activityId?: string;
  actorUserId?: string;
  actorAuthingUserId: string;
  idempotencyKey: string;
  request: unknown;
  execute: () => Promise<T>;
}) {
  const requestHash = stableHash(input.request);
  const existing = await input.repo.getIdempotencyRecord({
    commandName: input.commandName,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    actorAuthingUserId: input.actorAuthingUserId,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new DomainError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with a different command request", { status: 409 });
    }

    if (existing.status === "completed") {
      return existing.response as T;
    }
  } else {
    await input.repo.startIdempotencyRecord({
      id: createId("idem"),
      tenantId: input.tenantId,
      activityId: input.activityId,
      actorUserId: input.actorUserId,
      actorAuthingUserId: input.actorAuthingUserId,
      commandName: input.commandName,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
  }

  const result = await input.execute();
  const record = await input.repo.getIdempotencyRecord({
    commandName: input.commandName,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    actorAuthingUserId: input.actorAuthingUserId,
    idempotencyKey: input.idempotencyKey,
  });

  if (record) {
    await input.repo.completeIdempotencyRecord(record.id, result);
  }

  return result;
}
