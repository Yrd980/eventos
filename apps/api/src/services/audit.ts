import type { AuditEvent } from "@eventos/contracts";
import { createId } from "./ids";
import type { DomainAuditInput, EventOsRepository } from "./repository";

export async function writeAuditEvent(repo: EventOsRepository, input: DomainAuditInput) {
  await repo.createAuditEvent({
    id: createId("aud"),
    tenant_id: input.tenantId,
    activity_id: input.activityId,
    actor_user_id: input.actor?.user.id,
    actor_authing_user_id: input.actor?.authingUserId,
    actor_scope: input.actor?.scope as AuditEvent["actor_scope"] | undefined,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    metadata: input.metadata,
  });
}
