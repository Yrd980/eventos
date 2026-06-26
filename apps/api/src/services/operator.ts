import type { Activity, Block, BusinessResourceType, PageConfig, Session } from "@eventos/contracts";
import type { RequestActor } from "../auth/authing";
import { DomainError } from "../http/envelope";
import { createId, stableHash } from "./ids";
import { resolveTenantFromActor } from "./identity";
import type { EventOsRepository } from "./repository";
import { writeAuditEvent } from "./audit";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError("VALIDATION_FAILED", `${field} is required`, { status: 422 });
  }
  return value.trim();
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asDate(value: unknown, field: string) {
  const raw = asString(value, field);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw new DomainError("VALIDATION_FAILED", `${field} must be an ISO datetime`, { status: 422 });
  }
  return date;
}

function asOptionalDate(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  return asDate(value, field);
}

function asRecord(value: unknown, field: string, defaultValue: JsonRecord): JsonRecord {
  if (value === undefined) {
    return defaultValue;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("VALIDATION_FAILED", `${field} must be an object`, { status: 422 });
  }
  return value as JsonRecord;
}

function asBoolean(value: unknown, field: string, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "boolean") {
    throw new DomainError("VALIDATION_FAILED", `${field} must be a boolean`, { status: 422 });
  }
  return value;
}

function asOptionalNumber(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DomainError("VALIDATION_FAILED", `${field} must be a number`, { status: 422 });
  }
  return value;
}

function asStatus<T extends string>(value: unknown, allowed: readonly T[], field: string, defaultValue: T) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new DomainError("VALIDATION_FAILED", `${field} is invalid`, { status: 422 });
  }
  return value as T;
}

export async function requireTenantOperator(input: { repo: EventOsRepository; actor: RequestActor; activityId?: string }) {
  const tenant = await resolveTenantFromActor(input.repo, input.actor);
  const allowed = await input.repo.hasOperatorGrant({
    tenantId: tenant.id,
    userId: input.actor.user.id,
    activityId: input.activityId,
  });
  if (!allowed) {
    throw new DomainError("PERMISSION_DENIED", "Operator permission is required", { status: 403 });
  }
  return tenant;
}

export async function requireOperatorActivity(input: { repo: EventOsRepository; actor: RequestActor; activityId: string }) {
  const activity = await input.repo.getActivity(input.activityId);
  if (!activity) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }

  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  if (activity.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Activity belongs to a different Tenant", { status: 403 });
  }

  return { activity, tenant };
}

export async function listOperatorActivities(input: { repo: EventOsRepository; actor: RequestActor; limit: number; cursor?: string }) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  const rows = await input.repo.listTenantActivities({ tenantId: tenant.id, limit: input.limit, cursor: input.cursor });
  return { tenant, rows };
}

export async function listOperatorTenantResources(input: { repo: EventOsRepository; actor: RequestActor; resourceType: "organizer" | "sponsor" | "speaker" }) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  if (input.resourceType === "organizer") {
    return input.repo.listOrganizers(tenant.id);
  }
  if (input.resourceType === "sponsor") {
    return input.repo.listSponsors(tenant.id);
  }
  return input.repo.listSpeakers(tenant.id);
}

export async function createOperatorTenantResource(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  resourceType: "organizer" | "sponsor" | "speaker";
  body: JsonRecord;
}) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  const resource =
    input.resourceType === "organizer"
      ? await input.repo.createOrganizer({
          id: createId("org"),
          tenantId: tenant.id,
          name: asString(input.body.name, "name"),
          logoUrl: asOptionalString(input.body.logo_url),
          description: asOptionalString(input.body.description),
          websiteUrl: asOptionalString(input.body.website_url),
          contact: asOptionalString(input.body.contact),
        })
      : input.resourceType === "sponsor"
        ? await input.repo.createSponsor({
            id: createId("spn"),
            tenantId: tenant.id,
            name: asString(input.body.name, "name"),
            logoUrl: asOptionalString(input.body.logo_url),
            description: asOptionalString(input.body.description),
            websiteUrl: asOptionalString(input.body.website_url),
          })
        : await input.repo.createSpeaker({
            id: createId("spk"),
            tenantId: tenant.id,
            name: asString(input.body.name, "name"),
            title: asOptionalString(input.body.title),
            bio: asOptionalString(input.body.bio),
            avatarUrl: asOptionalString(input.body.avatar_url),
            organization: asOptionalString(input.body.organization),
          });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: `${input.resourceType}.created`,
    resourceType: input.resourceType,
    resourceId: resource.id,
  });

  return resource;
}

export async function updateOperatorTenantResource(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  resourceType: "organizer" | "sponsor" | "speaker";
  resourceId: string;
  body: JsonRecord;
}) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  const resource =
    input.resourceType === "organizer"
      ? await input.repo.updateOrganizer({
          id: input.resourceId,
          name: input.body.name === undefined ? undefined : asString(input.body.name, "name"),
          logoUrl: asOptionalString(input.body.logo_url),
          description: asOptionalString(input.body.description),
          websiteUrl: asOptionalString(input.body.website_url),
          contact: asOptionalString(input.body.contact),
        })
      : input.resourceType === "sponsor"
        ? await input.repo.updateSponsor({
            id: input.resourceId,
            name: input.body.name === undefined ? undefined : asString(input.body.name, "name"),
            logoUrl: asOptionalString(input.body.logo_url),
            description: asOptionalString(input.body.description),
            websiteUrl: asOptionalString(input.body.website_url),
          })
        : await input.repo.updateSpeaker({
            id: input.resourceId,
            name: input.body.name === undefined ? undefined : asString(input.body.name, "name"),
            title: asOptionalString(input.body.title),
            bio: asOptionalString(input.body.bio),
            avatarUrl: asOptionalString(input.body.avatar_url),
            organization: asOptionalString(input.body.organization),
          });

  if (!resource || resource.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Resource belongs to a different Tenant or was not found", { status: 404 });
  }

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: `${input.resourceType}.updated`,
    resourceType: input.resourceType as BusinessResourceType,
    resourceId: resource.id,
  });

  return resource;
}

export async function createOperatorActivity(input: { repo: EventOsRepository; actor: RequestActor; body: JsonRecord }) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  const activity = await input.repo.createActivity({
    id: createId("act"),
    tenantId: tenant.id,
    name: asString(input.body.name, "name"),
    description: asOptionalString(input.body.description),
    startTime: asDate(input.body.start_time, "start_time"),
    endTime: asDate(input.body.end_time, "end_time"),
    timezone: asOptionalString(input.body.timezone) ?? "Asia/Shanghai",
    venue: asRecord(input.body.venue, "venue", { timezone: asOptionalString(input.body.timezone) ?? "Asia/Shanghai" }),
    theme: input.body.theme === undefined ? undefined : asRecord(input.body.theme, "theme", {}),
    themeName: asOptionalString(input.body.theme_name),
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "activity.created",
    resourceType: "activity",
    resourceId: activity.id,
  });

  return activity;
}

export async function updateOperatorActivity(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; body: JsonRecord }) {
  const existing = await input.repo.getActivity(input.activityId);
  if (!existing) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  if (existing.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Activity belongs to a different Tenant", { status: 403 });
  }

  const activity = await input.repo.updateActivity({
    id: input.activityId,
    name: input.body.name === undefined ? undefined : asString(input.body.name, "name"),
    description: asOptionalString(input.body.description),
    startTime: asOptionalDate(input.body.start_time, "start_time"),
    endTime: asOptionalDate(input.body.end_time, "end_time"),
    timezone: asOptionalString(input.body.timezone),
    venue: input.body.venue === undefined ? undefined : asRecord(input.body.venue, "venue", {}),
    theme: input.body.theme === undefined ? undefined : asRecord(input.body.theme, "theme", {}),
    themeName: asOptionalString(input.body.theme_name),
    status: input.body.status === undefined ? undefined : asStatus(input.body.status, ["draft", "published", "archived"] as const, "status", existing.status),
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: input.activityId,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "activity.updated",
    resourceType: "activity",
    resourceId: input.activityId,
  });

  return activity;
}

export async function createOperatorSession(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; body: JsonRecord }) {
  const activity = await input.repo.getActivity(input.activityId);
  if (!activity) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  if (activity.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Activity belongs to a different Tenant", { status: 403 });
  }

  const session = await input.repo.createSession({
    id: createId("ses"),
    activityId: input.activityId,
    trackId: asOptionalString(input.body.track_id),
    title: asString(input.body.title, "title"),
    description: asOptionalString(input.body.description),
    startTime: asDate(input.body.start_time, "start_time"),
    endTime: asDate(input.body.end_time, "end_time"),
    timezone: asOptionalString(input.body.timezone) ?? activity.timezone,
    roomName: asOptionalString(input.body.room_name),
    venueArea: asOptionalString(input.body.venue_area),
    status: asStatus(input.body.status, ["scheduled", "cancelled", "hidden"] as const, "status", "scheduled"),
    capacity: asOptionalNumber(input.body.capacity, "capacity"),
    requiresReservation: asBoolean(input.body.requires_reservation, "requires_reservation", false),
    sortOrder: asOptionalNumber(input.body.sort_order, "sort_order"),
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: input.activityId,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "session.created",
    resourceType: "session",
    resourceId: session.id,
  });

  return session;
}

export async function updateOperatorSession(input: { repo: EventOsRepository; actor: RequestActor; sessionId: string; body: JsonRecord }) {
  const existing = await input.repo.getSession(input.sessionId);
  if (!existing) {
    throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
  }
  const activity = await input.repo.getActivity(existing.activity_id);
  if (!activity) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: activity.id });

  const session = await input.repo.updateSession({
    id: input.sessionId,
    trackId: asOptionalString(input.body.track_id),
    title: input.body.title === undefined ? undefined : asString(input.body.title, "title"),
    description: asOptionalString(input.body.description),
    startTime: asOptionalDate(input.body.start_time, "start_time"),
    endTime: asOptionalDate(input.body.end_time, "end_time"),
    timezone: asOptionalString(input.body.timezone),
    roomName: asOptionalString(input.body.room_name),
    venueArea: asOptionalString(input.body.venue_area),
    status: input.body.status === undefined ? undefined : asStatus(input.body.status, ["scheduled", "cancelled", "hidden"] as const, "status", existing.status),
    capacity: asOptionalNumber(input.body.capacity, "capacity"),
    requiresReservation: input.body.requires_reservation === undefined ? undefined : asBoolean(input.body.requires_reservation, "requires_reservation", false),
    sortOrder: asOptionalNumber(input.body.sort_order, "sort_order"),
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "session.updated",
    resourceType: "session",
    resourceId: input.sessionId,
  });

  return session;
}

export async function upsertOperatorPageConfig(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; body: JsonRecord }) {
  const activity = await input.repo.getActivity(input.activityId);
  if (!activity) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  if (activity.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Activity belongs to a different Tenant", { status: 403 });
  }

  const pageKey = asStatus(input.body.page_key, ["home", "agenda", "assistant", "expo", "me"] as const, "page_key", "home");
  const page = await input.repo.upsertPageConfig({
    id: createId("pgc"),
    activityId: input.activityId,
    pageKey,
    enabled: asBoolean(input.body.enabled, "enabled", true),
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "page_config.upserted",
    resourceType: "page_config",
    resourceId: page.id,
  });

  return page;
}

export async function createOperatorBlock(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; body: JsonRecord }) {
  const pageKey = asStatus(input.body.page_key, ["home", "agenda", "assistant", "expo", "me"] as const, "page_key", "home");
  const page = await input.repo.getPageConfig(input.activityId, pageKey);
  if (!page) {
    throw new DomainError("VALIDATION_FAILED", "Page Config must exist before adding Blocks", { status: 422 });
  }

  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  const block = await input.repo.upsertBlock({
    id: createId("blk"),
    activityId: input.activityId,
    pageConfigId: page.id,
    blockKey: asString(input.body.block_key, "block_key"),
    enabled: asBoolean(input.body.enabled, "enabled", true),
    sortOrder: asOptionalNumber(input.body.sort_order, "sort_order") ?? 0,
    resourceRefs: input.body.resource_refs as Block["resource_refs"],
    config: asRecord(input.body.config, "config", {}),
    displaySnapshot: input.body.display_snapshot === undefined ? undefined : asRecord(input.body.display_snapshot, "display_snapshot", {}),
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: input.activityId,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "block.created",
    resourceType: "block",
    resourceId: block.id,
  });

  return block;
}

export async function grantOperatorStaff(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; body: JsonRecord }) {
  const { activity, tenant } = await requireOperatorActivity({
    repo: input.repo,
    actor: input.actor,
    activityId: input.activityId,
  });
  const authingUserId = asString(input.body.authing_user_id, "authing_user_id");
  const displayName = asOptionalString(input.body.display_name);
  const avatarUrl = asOptionalString(input.body.avatar_url);
  const staffUser = await input.repo.upsertUser({
    id: createId("usr"),
    authingUserId,
    displayName,
    avatarUrl,
  });
  const grant = await input.repo.upsertStaffGrant({
    id: createId("sfg"),
    tenantId: tenant.id,
    activityId: activity.id,
    userId: staffUser.id,
    authingUserId,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "staff_grant.upserted",
    resourceType: "staff_grant",
    resourceId: grant.id,
    metadata: { staff_user_id: staffUser.id, staff_authing_user_id: authingUserId },
  });

  return { grant, user: staffUser };
}

export async function upsertOperatorActivityOrganizer(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  activityId: string;
  body: { organizer_id: string; sort_order: number };
}) {
  const { activity, tenant } = await requireOperatorActivity({
    repo: input.repo,
    actor: input.actor,
    activityId: input.activityId,
  });
  const organizer = await input.repo.getOrganizer(input.body.organizer_id);
  if (!organizer || organizer.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Organizer belongs to a different Tenant or was not found", { status: 404 });
  }

  const link = await input.repo.upsertActivityOrganizer({
    activityId: activity.id,
    organizerId: organizer.id,
    sortOrder: input.body.sort_order,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "activity_organizer.upserted",
    resourceType: "organizer",
    resourceId: organizer.id,
    metadata: { sort_order: link.sort_order },
  });

  return link;
}

export async function upsertOperatorSessionSpeaker(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  sessionId: string;
  body: { speaker_id: string; role: "host" | "speaker" | "panelist" | "guest"; sort_order: number; title_override?: string; bio_override?: string };
}) {
  const session = await input.repo.getSession(input.sessionId);
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
  }
  const { activity, tenant } = await requireOperatorActivity({
    repo: input.repo,
    actor: input.actor,
    activityId: session.activity_id,
  });
  const speaker = await input.repo.getSpeaker(input.body.speaker_id);
  if (!speaker || speaker.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Speaker belongs to a different Tenant or was not found", { status: 404 });
  }

  const link = await input.repo.upsertSessionSpeaker({
    sessionId: session.id,
    speakerId: speaker.id,
    role: input.body.role,
    sortOrder: input.body.sort_order,
    titleOverride: input.body.title_override,
    bioOverride: input.body.bio_override,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "session_speaker.upserted",
    resourceType: "speaker",
    resourceId: speaker.id,
    metadata: { session_id: session.id, role: link.role, sort_order: link.sort_order },
  });

  return link;
}

async function buildPublicationSnapshot(repo: EventOsRepository, activity: Activity) {
  const sessions = await repo.listSessions(activity.id);
  const pageConfigs = await repo.listPageConfigs(activity.id);
  return {
    activity,
    sessions,
    page_configs: pageConfigs,
    generated_at: new Date().toISOString(),
  };
}

async function assertPublishable(repo: EventOsRepository, activity: Activity) {
  if (!activity.name || !activity.start_time || !activity.end_time || !activity.venue?.timezone) {
    throw new DomainError("VALIDATION_FAILED", "Activity basic information is incomplete", { status: 422 });
  }

  const home = await repo.getPageConfig(activity.id, "home");
  const agenda = await repo.getPageConfig(activity.id, "agenda");
  if (!home?.enabled) {
    throw new DomainError("VALIDATION_FAILED", "Home page must be enabled before publishing", { status: 422 });
  }
  if (!agenda?.enabled) {
    throw new DomainError("VALIDATION_FAILED", "Agenda page must be enabled before publishing", { status: 422 });
  }

  if ((await repo.countScheduledSessions(activity.id)) < 1) {
    throw new DomainError("VALIDATION_FAILED", "At least one scheduled Session is required before publishing", { status: 422 });
  }

  for (const page of await repo.listPageConfigs(activity.id)) {
    for (const block of page.blocks) {
      if (!block.block_key || !block.config || typeof block.config !== "object") {
        throw new DomainError("VALIDATION_FAILED", "Block configuration is invalid", { status: 422 });
      }
    }
  }
}

export async function publishOperatorActivity(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; summary?: string }) {
  const activity = await input.repo.getActivity(input.activityId);
  if (!activity) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  if (activity.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Activity belongs to a different Tenant", { status: 403 });
  }

  await assertPublishable(input.repo, activity);
  const snapshot = await buildPublicationSnapshot(input.repo, activity);
  const version = await input.repo.getNextPublicationVersion(activity.id);
  await input.repo.supersedeCurrentPublication(activity.id);
  const publication = await input.repo.createPublication({
    id: createId("pub"),
    activityId: activity.id,
    version,
    publishedByUserId: input.actor.user.id,
    summary: input.summary,
    snapshot,
    etag: stableHash(snapshot),
  });
  await input.repo.updateActivity({ id: activity.id, status: "published" });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "activity.published",
    resourceType: "activity_publication",
    resourceId: publication.id,
    metadata: { version },
  });

  return publication;
}

export async function rollbackOperatorActivity(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; version: number; summary?: string }) {
  const activity = await input.repo.getActivity(input.activityId);
  if (!activity) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  const previous = await input.repo.getPublicationByVersion(input.activityId, input.version);
  if (!previous) {
    throw new DomainError("VALIDATION_FAILED", "Publication version was not found", { status: 422 });
  }

  const nextVersion = await input.repo.getNextPublicationVersion(input.activityId);
  const snapshot = {
    ...(previous.snapshot as Record<string, unknown>),
    rollback_from_version: previous.version,
    generated_at: new Date().toISOString(),
  };
  await input.repo.supersedeCurrentPublication(input.activityId);
  const publication = await input.repo.createPublication({
    id: createId("pub"),
    activityId: input.activityId,
    version: nextVersion,
    publishedByUserId: input.actor.user.id,
    summary: input.summary ?? `Rollback from version ${previous.version}`,
    snapshot,
    etag: stableHash(snapshot),
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: input.activityId,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "activity.rollback_published",
    resourceType: "activity_publication",
    resourceId: publication.id,
    metadata: { from_version: previous.version, version: nextVersion },
  });

  return publication;
}

export type OperatorSessionBody = Pick<Session, "title">;
export type OperatorPageConfigBody = Pick<PageConfig, "page_key" | "enabled">;
