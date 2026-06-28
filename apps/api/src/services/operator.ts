import type {
  Activity,
  ActivityOrganizer,
  ActivityTemplate,
  Block,
  BusinessResourceType,
  ExpoBooth,
  LiveEntry,
  Notification,
  Organizer,
  PageConfig,
  RegistrationForm,
  Session,
  SessionSpeaker,
  Speaker,
  Sponsor,
  Survey,
  SurveyQuestion,
} from "@eventos/contracts";
import type { RequestActor } from "../auth/authing";
import { DomainError } from "../http/envelope";
import { createId, stableHash } from "./ids";
import { resolveTenantFromActor } from "./identity";
import type { EventOsRepository } from "./repository";
import { writeAuditEvent } from "./audit";

type JsonRecord = Record<string, unknown>;

type RegistrationFormField = RegistrationForm["fields"][number];
type SurveyQuestionOption = NonNullable<SurveyQuestion["options"]>[number];

type PublicationSnapshot = {
  activity: Activity;
  activity_organizers: ActivityOrganizer[];
  organizers: Organizer[];
  sessions: Session[];
  session_speakers: SessionSpeaker[];
  speakers: Speaker[];
  page_configs: PageConfig[];
  expo_booths: ExpoBooth[];
  sponsors: Sponsor[];
  live_entries: LiveEntry[];
  surveys: Survey[];
  survey_questions: SurveyQuestion[];
  registration_forms: RegistrationForm[];
  generated_at: string;
};

const registrationFormFieldTypes = new Set<RegistrationFormField["type"]>(["text", "phone", "email", "select", "multi_select", "boolean"]);
const registrationOptionFieldTypes = new Set<RegistrationFormField["type"]>(["select", "multi_select"]);
const surveyQuestionTypes = new Set<SurveyQuestion["type"]>(["text", "single_choice", "multiple_choice", "rating", "boolean"]);
const surveyOptionQuestionTypes = new Set<SurveyQuestion["type"]>(["single_choice", "multiple_choice"]);
const publishableLiveEntryStatuses = new Set<LiveEntry["status"]>(["scheduled", "live", "ended"]);
const fieldKeyPattern = /^[A-Za-z][A-Za-z0-9_]*$/;
const templateBusinessFactKeys = new Set([
  "sessions",
  "speakers",
  "organizers",
  "sponsors",
  "expo_booths",
  "live_entries",
  "surveys",
  "registration_forms",
  "notifications",
  "participants",
  "registrations",
  "qr_passes",
  "my_agenda_items",
  "checkins",
]);

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

function assertActivityTemplateConfig(config: ActivityTemplate["config"]) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new DomainError("VALIDATION_FAILED", "Activity Template config must be an object", { status: 422 });
  }
  for (const key of Object.keys(config)) {
    if (templateBusinessFactKeys.has(key)) {
      throw new DomainError("VALIDATION_FAILED", "Activity Template config must not contain business facts", { status: 422, details: { key } });
    }
  }
}

export async function listOperatorActivityTemplates(input: { repo: EventOsRepository; actor: RequestActor }) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  return input.repo.listActivityTemplates(tenant.id);
}

export async function createOperatorActivityTemplate(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  body: { name: string; template_key: string; description?: string; config: ActivityTemplate["config"] };
}) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  assertActivityTemplateConfig(input.body.config);
  const template = await input.repo.createActivityTemplate({
    id: createId("tpl"),
    tenantId: tenant.id,
    name: input.body.name,
    templateKey: input.body.template_key,
    description: input.body.description,
    config: input.body.config,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "activity_template.created",
    resourceType: "activity_template",
    resourceId: template.id,
    metadata: { template_key: template.template_key },
  });

  return template;
}

export async function updateOperatorActivityTemplate(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  templateId: string;
  body: { name?: string; template_key?: string; description?: string | null; config?: ActivityTemplate["config"] };
}) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  const existing = await input.repo.getActivityTemplate(input.templateId);
  if (!existing || existing.tenant_id !== tenant.id) {
    throw new DomainError("TENANT_MISMATCH", "Activity Template belongs to a different Tenant or was not found", { status: 404 });
  }
  if (input.body.config) {
    assertActivityTemplateConfig(input.body.config);
  }
  const template = await input.repo.updateActivityTemplate({
    id: input.templateId,
    name: input.body.name,
    templateKey: input.body.template_key,
    description: input.body.description,
    config: input.body.config,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "activity_template.updated",
    resourceType: "activity_template",
    resourceId: input.templateId,
    metadata: { template_key: template?.template_key },
  });

  return template;
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

export async function disableOperatorStaffGrant(input: { repo: EventOsRepository; actor: RequestActor; staffGrantId: string }) {
  const existing = await input.repo.getStaffGrant(input.staffGrantId);
  if (!existing) {
    throw new DomainError("VALIDATION_FAILED", "Staff Grant was not found", { status: 404 });
  }
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: existing.activity_id });
  const grant = await input.repo.updateStaffGrantStatus({ id: existing.id, status: "disabled" });
  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "staff_grant.disabled",
    resourceType: "staff_grant",
    resourceId: existing.id,
    metadata: { staff_user_id: existing.user_id, staff_authing_user_id: existing.authing_user_id },
  });
  return grant;
}

export async function listOperatorActivityGrants(input: { repo: EventOsRepository; actor: RequestActor; activityId: string }) {
  const { tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  return input.repo.listOperatorGrants({ tenantId: tenant.id, activityId: input.activityId });
}

export async function grantOperatorActivity(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; body: JsonRecord }) {
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  const authingUserId = asString(input.body.authing_user_id, "authing_user_id");
  const operatorUser = await input.repo.upsertUser({
    id: createId("usr"),
    authingUserId,
    displayName: asOptionalString(input.body.display_name),
    avatarUrl: asOptionalString(input.body.avatar_url),
  });
  const grant = await input.repo.upsertOperatorGrant({
    id: createId("opg"),
    tenantId: tenant.id,
    userId: operatorUser.id,
    authingUserId,
    scope: "activity",
    activityId: activity.id,
  });
  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "operator_grant.upserted",
    resourceType: "operator_grant",
    resourceId: grant.id,
    metadata: { operator_user_id: operatorUser.id, operator_authing_user_id: authingUserId, scope: "activity" },
  });
  return { grant, user: operatorUser };
}

export async function disableOperatorActivityGrant(input: { repo: EventOsRepository; actor: RequestActor; operatorGrantId: string }) {
  const tenant = await requireTenantOperator({ repo: input.repo, actor: input.actor });
  const existing = (await input.repo.listOperatorGrants({ tenantId: tenant.id })).find((grant) => grant.id === input.operatorGrantId);
  if (!existing) {
    throw new DomainError("VALIDATION_FAILED", "Operator Grant was not found", { status: 404 });
  }
  if (existing.scope !== "activity" || !existing.activity_id) {
    throw new DomainError("VALIDATION_FAILED", "Only activity-scoped Operator Grants can be disabled through this endpoint", { status: 422 });
  }
  await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: existing.activity_id });
  const grant = await input.repo.updateOperatorGrantStatus({ id: existing.id, status: "disabled" });
  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: existing.activity_id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "operator_grant.disabled",
    resourceType: "operator_grant",
    resourceId: existing.id,
    metadata: { operator_user_id: existing.user_id, operator_authing_user_id: existing.authing_user_id, scope: existing.scope },
  });
  return grant;
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

async function assertSponsorTenantBoundary(input: { repo: EventOsRepository; sponsorId?: string | null; tenantId: string }) {
  if (!input.sponsorId) {
    return undefined;
  }

  const sponsor = await input.repo.getSponsor(input.sponsorId);
  if (!sponsor || sponsor.tenant_id !== input.tenantId) {
    throw new DomainError("TENANT_MISMATCH", "Sponsor belongs to a different Tenant or was not found", { status: 404 });
  }

  return sponsor;
}

async function assertSessionActivityBoundary(input: { repo: EventOsRepository; sessionId?: string | null; activityId: string }) {
  if (!input.sessionId) {
    return undefined;
  }

  const session = await input.repo.getSession(input.sessionId);
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
  }
  if (session.activity_id !== input.activityId) {
    throw new DomainError("SESSION_ACTIVITY_MISMATCH", "Session belongs to a different Activity", { status: 422 });
  }

  return session;
}

async function assertSurveyTargetBoundary(input: { repo: EventOsRepository; activityId: string; targetType: Survey["target_type"]; targetId?: string | null }) {
  if (input.targetType === "activity") {
    if (input.targetId) {
      throw new DomainError("VALIDATION_FAILED", "Activity-targeted Survey must not include target_id", { status: 422 });
    }
    return undefined;
  }

  if (!input.targetId) {
    throw new DomainError("VALIDATION_FAILED", "target_id is required for the selected Survey target_type", { status: 422 });
  }

  if (input.targetType === "session") {
    await assertSessionActivityBoundary({ repo: input.repo, activityId: input.activityId, sessionId: input.targetId });
    return input.targetId;
  }

  if (input.targetType === "expo_booth") {
    const booth = await input.repo.getExpoBooth(input.targetId);
    if (!booth) {
      throw new DomainError("EXPO_BOOTH_NOT_FOUND", "Expo Booth was not found", { status: 404 });
    }
    if (booth.activity_id !== input.activityId) {
      throw new DomainError("TENANT_MISMATCH", "Expo Booth belongs to a different Activity", { status: 422 });
    }
    return input.targetId;
  }

  const liveEntry = await input.repo.getLiveEntry(input.targetId);
  if (!liveEntry) {
    throw new DomainError("LIVE_ENTRY_NOT_FOUND", "Live Entry was not found", { status: 404 });
  }
  if (liveEntry.activity_id !== input.activityId) {
    throw new DomainError("TENANT_MISMATCH", "Live Entry belongs to a different Activity", { status: 422 });
  }
  return input.targetId;
}

export async function createOperatorExpoBooth(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  activityId: string;
  body: {
    sponsor_id?: string | null;
    name: string;
    description?: string;
    category?: string;
    location?: string;
    logo_url?: string;
    status: ExpoBooth["status"];
    sort_order: number;
  };
}) {
  const { activity, tenant } = await requireOperatorActivity({
    repo: input.repo,
    actor: input.actor,
    activityId: input.activityId,
  });
  const sponsor = await assertSponsorTenantBoundary({ repo: input.repo, tenantId: tenant.id, sponsorId: input.body.sponsor_id });
  const booth = await input.repo.createExpoBooth({
    id: createId("exp"),
    activityId: activity.id,
    sponsorId: sponsor?.id,
    name: input.body.name,
    description: input.body.description,
    category: input.body.category,
    location: input.body.location,
    logoUrl: input.body.logo_url,
    status: input.body.status,
    sortOrder: input.body.sort_order,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "expo_booth.created",
    resourceType: "expo_booth",
    resourceId: booth.id,
    metadata: { sponsor_id: sponsor?.id },
  });

  return booth;
}

export async function updateOperatorExpoBooth(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  expoBoothId: string;
  body: {
    sponsor_id?: string | null;
    name?: string;
    description?: string;
    category?: string;
    location?: string;
    logo_url?: string;
    status?: ExpoBooth["status"];
    sort_order?: number;
  };
}) {
  const existing = await input.repo.getExpoBooth(input.expoBoothId);
  if (!existing) {
    throw new DomainError("EXPO_BOOTH_NOT_FOUND", "Expo Booth was not found", { status: 404 });
  }
  const { activity, tenant } = await requireOperatorActivity({
    repo: input.repo,
    actor: input.actor,
    activityId: existing.activity_id,
  });
  const hasSponsorUpdate = Object.hasOwn(input.body, "sponsor_id");
  const sponsor = await assertSponsorTenantBoundary({ repo: input.repo, tenantId: tenant.id, sponsorId: input.body.sponsor_id });
  const booth = await input.repo.updateExpoBooth({
    id: input.expoBoothId,
    sponsorId: hasSponsorUpdate ? (sponsor?.id ?? null) : undefined,
    name: input.body.name,
    description: input.body.description,
    category: input.body.category,
    location: input.body.location,
    logoUrl: input.body.logo_url,
    status: input.body.status,
    sortOrder: input.body.sort_order,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "expo_booth.updated",
    resourceType: "expo_booth",
    resourceId: input.expoBoothId,
    metadata: { sponsor_id: hasSponsorUpdate ? (sponsor?.id ?? null) : existing.sponsor_id },
  });

  return booth;
}

export async function createOperatorLiveEntry(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  activityId: string;
  body: {
    session_id?: string;
    title: string;
    provider: LiveEntry["provider"];
    url?: string;
    deep_link?: string;
    access_policy: LiveEntry["access_policy"];
    start_time?: string;
    end_time?: string;
    status: LiveEntry["status"];
    sort_order: number;
  };
}) {
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  const session = await assertSessionActivityBoundary({ repo: input.repo, activityId: activity.id, sessionId: input.body.session_id });
  const entry = await input.repo.createLiveEntry({
    id: createId("liv"),
    activityId: activity.id,
    sessionId: session?.id,
    title: input.body.title,
    provider: input.body.provider,
    url: input.body.url,
    deepLink: input.body.deep_link,
    accessPolicy: input.body.access_policy,
    startTime: input.body.start_time ? new Date(input.body.start_time) : undefined,
    endTime: input.body.end_time ? new Date(input.body.end_time) : undefined,
    status: input.body.status,
    sortOrder: input.body.sort_order,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "live_entry.created",
    resourceType: "live_entry",
    resourceId: entry.id,
    metadata: { session_id: session?.id },
  });

  return entry;
}

export async function updateOperatorLiveEntry(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  liveEntryId: string;
  body: {
    session_id?: string | null;
    title?: string;
    provider?: LiveEntry["provider"];
    url?: string | null;
    deep_link?: string | null;
    access_policy?: LiveEntry["access_policy"];
    start_time?: string | null;
    end_time?: string | null;
    status?: LiveEntry["status"];
    sort_order?: number;
  };
}) {
  const existing = await input.repo.getLiveEntry(input.liveEntryId);
  if (!existing) {
    throw new DomainError("LIVE_ENTRY_NOT_FOUND", "Live Entry was not found", { status: 404 });
  }
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: existing.activity_id });
  const hasSessionUpdate = Object.hasOwn(input.body, "session_id");
  const session = hasSessionUpdate
    ? await assertSessionActivityBoundary({ repo: input.repo, activityId: activity.id, sessionId: input.body.session_id })
    : undefined;

  const entry = await input.repo.updateLiveEntry({
    id: input.liveEntryId,
    sessionId: hasSessionUpdate ? (session?.id ?? null) : undefined,
    title: input.body.title,
    provider: input.body.provider,
    url: input.body.url,
    deepLink: input.body.deep_link,
    accessPolicy: input.body.access_policy,
    startTime: input.body.start_time === undefined ? undefined : input.body.start_time === null ? null : new Date(input.body.start_time),
    endTime: input.body.end_time === undefined ? undefined : input.body.end_time === null ? null : new Date(input.body.end_time),
    status: input.body.status,
    sortOrder: input.body.sort_order,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "live_entry.updated",
    resourceType: "live_entry",
    resourceId: input.liveEntryId,
    metadata: { session_id: hasSessionUpdate ? (session?.id ?? null) : existing.session_id },
  });

  return entry;
}

export async function upsertOperatorRegistrationForm(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  activityId: string;
  body: {
    id?: string;
    title: string;
    fields: RegistrationForm["fields"];
  };
}) {
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  if (input.body.id) {
    const existing = await input.repo.getRegistrationForm(input.body.id);
    if (existing && existing.activity_id !== activity.id) {
      throw new DomainError("TENANT_MISMATCH", "Registration Form belongs to a different Activity", { status: 403 });
    }
  }

  const form = await input.repo.upsertRegistrationForm({
    id: input.body.id ?? createId("rgf"),
    activityId: activity.id,
    title: input.body.title,
    fields: input.body.fields,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "registration_form.upserted",
    resourceType: "registration_form",
    resourceId: form.id,
  });

  return form;
}

export async function createOperatorSurvey(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  activityId: string;
  body: {
    title: string;
    description?: string;
    target_type: Survey["target_type"];
    target_id?: string;
    access_policy: Survey["access_policy"];
    status: Survey["status"];
  };
}) {
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  const targetId = await assertSurveyTargetBoundary({
    repo: input.repo,
    activityId: activity.id,
    targetType: input.body.target_type,
    targetId: input.body.target_id,
  });
  const survey = await input.repo.createSurvey({
    id: createId("srv"),
    activityId: activity.id,
    title: input.body.title,
    description: input.body.description,
    targetType: input.body.target_type,
    targetId,
    accessPolicy: input.body.access_policy,
    status: input.body.status,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "survey.created",
    resourceType: "survey",
    resourceId: survey.id,
    metadata: { target_type: survey.target_type, target_id: survey.target_id },
  });

  return survey;
}

export async function updateOperatorSurvey(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  surveyId: string;
  body: {
    title?: string;
    description?: string | null;
    target_type?: Survey["target_type"];
    target_id?: string | null;
    access_policy?: Survey["access_policy"];
    status?: Survey["status"];
  };
}) {
  const existing = await input.repo.getSurvey(input.surveyId);
  if (!existing) {
    throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
  }
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: existing.activity_id });
  const targetType = input.body.target_type ?? existing.target_type;
  const hasTargetUpdate = Object.hasOwn(input.body, "target_type") || Object.hasOwn(input.body, "target_id");
  const targetId = hasTargetUpdate
    ? await assertSurveyTargetBoundary({
        repo: input.repo,
        activityId: activity.id,
        targetType,
        targetId: input.body.target_id,
      })
    : undefined;

  const survey = await input.repo.updateSurvey({
    id: input.surveyId,
    title: input.body.title,
    description: input.body.description,
    targetType: input.body.target_type,
    targetId: hasTargetUpdate ? (targetId ?? null) : undefined,
    accessPolicy: input.body.access_policy,
    status: input.body.status,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "survey.updated",
    resourceType: "survey",
    resourceId: input.surveyId,
    metadata: { target_type: survey.target_type, target_id: survey.target_id },
  });

  return survey;
}

export async function listOperatorRegistrationSubmissions(input: { repo: EventOsRepository; actor: RequestActor; activityId: string }) {
  await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  return input.repo.listRegistrationSubmissions(input.activityId);
}

export async function listOperatorSurveyResponses(input: { repo: EventOsRepository; actor: RequestActor; activityId: string; surveyId?: string }) {
  await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  if (input.surveyId) {
    const survey = await input.repo.getSurvey(input.surveyId);
    if (!survey) {
      throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
    }
    if (survey.activity_id !== input.activityId) {
      throw new DomainError("TENANT_MISMATCH", "Survey belongs to a different Activity", { status: 403 });
    }
  }
  return input.repo.listSurveyResponses({ activityId: input.activityId, surveyId: input.surveyId });
}

export async function listOperatorSurveyAnswers(input: { repo: EventOsRepository; actor: RequestActor; responseId: string }) {
  const response = await input.repo.getSurveyResponse(input.responseId);
  if (!response) {
    throw new DomainError("VALIDATION_FAILED", "Survey Response was not found", { status: 404 });
  }
  const survey = await input.repo.getSurvey(response.survey_id);
  if (!survey) {
    throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
  }
  await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: survey.activity_id });
  return { response, answers: await input.repo.listSurveyAnswers(input.responseId) };
}

export async function upsertOperatorSurveyQuestion(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  surveyId: string;
  body: {
    id?: string;
    key: string;
    label: string;
    type: SurveyQuestion["type"];
    required: boolean;
    options?: SurveyQuestion["options"];
    sort_order: number;
  };
}) {
  const survey = await input.repo.getSurvey(input.surveyId);
  if (!survey) {
    throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
  }
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: survey.activity_id });
  if (input.body.id) {
    const existing = await input.repo.getSurveyQuestion(input.body.id);
    if (existing && existing.survey_id !== survey.id) {
      throw new DomainError("TENANT_MISMATCH", "Survey Question belongs to a different Survey", { status: 403 });
    }
  }

  const question = await input.repo.upsertSurveyQuestion({
    id: input.body.id ?? createId("svq"),
    activityId: activity.id,
    surveyId: survey.id,
    key: input.body.key,
    label: input.body.label,
    type: input.body.type,
    required: input.body.required,
    options: input.body.options,
    sortOrder: input.body.sort_order,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "survey_question.upserted",
    resourceType: "survey",
    resourceId: survey.id,
    metadata: { question_id: question.id, key: question.key },
  });

  return question;
}

async function assertNotificationAudienceRule(input: { repo: EventOsRepository; activityId: string; rule: Notification["audience_rule"] }) {
  if (input.rule.type === "participants_with_session_in_my_agenda") {
    await assertSessionActivityBoundary({ repo: input.repo, activityId: input.activityId, sessionId: input.rule.session_id });
    return;
  }

  if (input.rule.type === "all_confirmed_participants" || input.rule.type === "staff" || input.rule.type === "custom_segment") {
    return;
  }

  throw new DomainError("VALIDATION_FAILED", "Notification audience_rule is invalid", { status: 422 });
}

export async function listOperatorNotifications(input: { repo: EventOsRepository; actor: RequestActor; activityId: string }) {
  await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  return input.repo.listNotifications(input.activityId);
}

export async function createOperatorNotification(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  activityId: string;
  body: {
    title: string;
    content: string;
    channel: Notification["channel"];
    audience_rule: Notification["audience_rule"];
    status: Notification["status"];
    scheduled_at?: string;
  };
}) {
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: input.activityId });
  await assertNotificationAudienceRule({ repo: input.repo, activityId: activity.id, rule: input.body.audience_rule });
  const scheduledAt = input.body.scheduled_at ? new Date(input.body.scheduled_at) : undefined;
  if (input.body.status === "scheduled" && !scheduledAt) {
    throw new DomainError("VALIDATION_FAILED", "scheduled_at is required for scheduled Notification", { status: 422 });
  }
  const notification = await input.repo.createNotification({
    id: createId("ntf"),
    activityId: activity.id,
    title: input.body.title,
    content: input.body.content,
    channel: input.body.channel,
    audienceRule: input.body.audience_rule,
    status: input.body.status,
    scheduledAt,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "notification.created",
    resourceType: "notification",
    resourceId: notification.id,
    metadata: { channel: notification.channel, status: notification.status, audience_rule: notification.audience_rule },
  });

  return notification;
}

export async function updateOperatorNotification(input: {
  repo: EventOsRepository;
  actor: RequestActor;
  notificationId: string;
  body: {
    title?: string;
    content?: string;
    channel?: Notification["channel"];
    audience_rule?: Notification["audience_rule"];
    status?: Notification["status"];
    scheduled_at?: string | null;
  };
}) {
  const existing = await input.repo.getNotification(input.notificationId);
  if (!existing) {
    throw new DomainError("VALIDATION_FAILED", "Notification was not found", { status: 404 });
  }
  const { activity, tenant } = await requireOperatorActivity({ repo: input.repo, actor: input.actor, activityId: existing.activity_id });
  const audienceRule = input.body.audience_rule ?? existing.audience_rule;
  await assertNotificationAudienceRule({ repo: input.repo, activityId: activity.id, rule: audienceRule });
  const scheduledAt = input.body.scheduled_at === undefined ? undefined : input.body.scheduled_at === null ? null : new Date(input.body.scheduled_at);
  const nextStatus = input.body.status ?? existing.status;
  const nextScheduledAt = scheduledAt === undefined ? existing.scheduled_at : scheduledAt?.toISOString();
  if (nextStatus === "scheduled" && !nextScheduledAt) {
    throw new DomainError("VALIDATION_FAILED", "scheduled_at is required for scheduled Notification", { status: 422 });
  }

  const notification = await input.repo.updateNotification({
    id: input.notificationId,
    title: input.body.title,
    content: input.body.content,
    channel: input.body.channel,
    audienceRule: input.body.audience_rule,
    status: input.body.status,
    scheduledAt,
  });

  await writeAuditEvent(input.repo, {
    tenantId: tenant.id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "tenant_operator" },
    action: "notification.updated",
    resourceType: "notification",
    resourceId: input.notificationId,
    metadata: { channel: notification?.channel, status: notification?.status, audience_rule: notification?.audience_rule },
  });

  return notification;
}

function requirePublishValidation(condition: boolean, message: string, details?: Record<string, unknown>) {
  if (!condition) {
    throw new DomainError("VALIDATION_FAILED", message, { status: 422, details });
  }
}

function hasNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function assertResourceActivity(value: { id: string; activity_id: string }, activityId: string, resourceType: BusinessResourceType) {
  requirePublishValidation(value.activity_id === activityId, `${resourceType} must belong to the published Activity`, {
    resource_type: resourceType,
    resource_id: value.id,
    activity_id: value.activity_id,
  });
}

function assertResourceTenant(value: { id: string; tenant_id: string }, tenantId: string, resourceType: BusinessResourceType) {
  requirePublishValidation(value.tenant_id === tenantId, `${resourceType} must belong to the Activity Tenant`, {
    resource_type: resourceType,
    resource_id: value.id,
    tenant_id: value.tenant_id,
  });
}

function assertOptionSet(options: SurveyQuestionOption[] | undefined, context: Record<string, unknown>) {
  const optionValues = new Set<string>();
  for (const option of options ?? []) {
    requirePublishValidation(hasNonEmptyText(option.label), "Option label is required", context);
    requirePublishValidation(hasNonEmptyText(option.value), "Option value is required", context);
    requirePublishValidation(!optionValues.has(option.value), "Option value must be unique", { ...context, option_value: option.value });
    optionValues.add(option.value);
  }
}

function assertRegistrationFormFields(form: RegistrationForm) {
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const field of form.fields) {
    requirePublishValidation(hasNonEmptyText(field.id), "Registration Form field id is required", { form_id: form.id });
    requirePublishValidation(!ids.has(field.id), "Registration Form field id must be unique", { form_id: form.id, field_id: field.id });
    ids.add(field.id);

    requirePublishValidation(hasNonEmptyText(field.key), "Registration Form field key is required", { form_id: form.id, field_id: field.id });
    requirePublishValidation(fieldKeyPattern.test(field.key), "Registration Form field key is invalid", { form_id: form.id, field_key: field.key });
    requirePublishValidation(!keys.has(field.key), "Registration Form field key must be unique", { form_id: form.id, field_key: field.key });
    keys.add(field.key);

    requirePublishValidation(hasNonEmptyText(field.label), "Registration Form field label is required", { form_id: form.id, field_key: field.key });
    requirePublishValidation(registrationFormFieldTypes.has(field.type), "Registration Form field type is invalid", { form_id: form.id, field_key: field.key });

    const options = field.options ?? [];
    if (registrationOptionFieldTypes.has(field.type)) {
      requirePublishValidation(options.length > 0, "Registration Form select fields require options", { form_id: form.id, field_key: field.key });
    } else {
      requirePublishValidation(options.length === 0, "Registration Form non-select fields must not include options", { form_id: form.id, field_key: field.key });
    }

    assertOptionSet(options, { form_id: form.id, field_key: field.key });
  }
}

function assertSurveyQuestions(input: { surveys: Survey[]; surveyQuestions: SurveyQuestion[] }) {
  const surveyIds = new Set(input.surveys.map((survey) => survey.id));
  const keysBySurvey = new Map<string, Set<string>>();
  for (const question of input.surveyQuestions) {
    requirePublishValidation(surveyIds.has(question.survey_id), "Survey Question must belong to a published Survey", {
      survey_id: question.survey_id,
      question_id: question.id,
    });
    requirePublishValidation(hasNonEmptyText(question.key), "Survey Question key is required", { survey_id: question.survey_id, question_id: question.id });
    requirePublishValidation(fieldKeyPattern.test(question.key), "Survey Question key is invalid", {
      survey_id: question.survey_id,
      question_id: question.id,
      question_key: question.key,
    });
    requirePublishValidation(hasNonEmptyText(question.label), "Survey Question label is required", {
      survey_id: question.survey_id,
      question_id: question.id,
    });
    requirePublishValidation(surveyQuestionTypes.has(question.type), "Survey Question type is invalid", {
      survey_id: question.survey_id,
      question_id: question.id,
      question_type: question.type,
    });

    const keys = keysBySurvey.get(question.survey_id) ?? new Set<string>();
    requirePublishValidation(!keys.has(question.key), "Survey Question key must be unique", {
      survey_id: question.survey_id,
      question_key: question.key,
    });
    keys.add(question.key);
    keysBySurvey.set(question.survey_id, keys);

    const options = question.options ?? [];
    if (surveyOptionQuestionTypes.has(question.type)) {
      requirePublishValidation(options.length > 0, "Survey choice questions require options", {
        survey_id: question.survey_id,
        question_key: question.key,
      });
    } else {
      requirePublishValidation(options.length === 0, "Survey non-choice questions must not include options", {
        survey_id: question.survey_id,
        question_key: question.key,
      });
    }
    assertOptionSet(options, { survey_id: question.survey_id, question_key: question.key });
  }
}

function assertBlockResourceRefs(input: {
  block: Block;
  activity: Activity;
  activityOrganizerIds: Set<string>;
  sessionIds: Set<string>;
  speakerIds: Set<string>;
  registrationFormIds: Set<string>;
  expoBoothIds: Set<string>;
  sponsorIds: Set<string>;
  liveEntryIds: Set<string>;
  surveyIds: Set<string>;
}) {
  for (const ref of input.block.resource_refs ?? []) {
    const details = { block_id: input.block.id, resource_type: ref.resource_type, resource_id: ref.resource_id };
    if (ref.resource_type === "activity") {
      requirePublishValidation(ref.resource_id === input.activity.id, "Block Activity reference must point to the published Activity", details);
      continue;
    }
    if (ref.resource_type === "organizer") {
      requirePublishValidation(input.activityOrganizerIds.has(ref.resource_id), "Block Organizer reference must be linked to the Activity", details);
      continue;
    }
    if (ref.resource_type === "session") {
      requirePublishValidation(input.sessionIds.has(ref.resource_id), "Block Session reference must belong to the Activity and be publishable", details);
      continue;
    }
    if (ref.resource_type === "speaker") {
      requirePublishValidation(input.speakerIds.has(ref.resource_id), "Block Speaker reference must be linked to an Activity Session", details);
      continue;
    }
    if (ref.resource_type === "registration_form") {
      requirePublishValidation(input.registrationFormIds.has(ref.resource_id), "Block Registration Form reference must belong to the Activity", details);
      continue;
    }
    if (ref.resource_type === "expo_booth") {
      requirePublishValidation(input.expoBoothIds.has(ref.resource_id), "Block Expo Booth reference must belong to the Activity and be visible", details);
      continue;
    }
    if (ref.resource_type === "sponsor") {
      requirePublishValidation(input.sponsorIds.has(ref.resource_id), "Block Sponsor reference must be used by an Activity Expo Booth", details);
      continue;
    }
    if (ref.resource_type === "live_entry") {
      requirePublishValidation(input.liveEntryIds.has(ref.resource_id), "Block Live Entry reference must belong to the Activity and be participant-visible", details);
      continue;
    }
    if (ref.resource_type === "survey") {
      requirePublishValidation(input.surveyIds.has(ref.resource_id), "Block Survey reference must belong to the Activity and be published", details);
      continue;
    }

    throw new DomainError("VALIDATION_FAILED", "Block resource reference type cannot be published from Page Config", { status: 422, details });
  }
}

function assertLiveEntries(input: { liveEntries: LiveEntry[]; sessionIds: Set<string> }) {
  for (const entry of input.liveEntries) {
    requirePublishValidation(hasNonEmptyText(entry.title), "Live Entry title is required", { live_entry_id: entry.id });
    requirePublishValidation(publishableLiveEntryStatuses.has(entry.status), "Live Entry status is not publishable", {
      live_entry_id: entry.id,
      status: entry.status,
    });
    if (entry.provider === "external_link" || entry.provider === "embedded") {
      requirePublishValidation(hasNonEmptyText(entry.url), "Live Entry url is required for this provider", {
        live_entry_id: entry.id,
        provider: entry.provider,
      });
    }
    if (entry.provider === "miniapp_page") {
      requirePublishValidation(hasNonEmptyText(entry.deep_link), "Live Entry deep_link is required for miniapp_page provider", {
        live_entry_id: entry.id,
        provider: entry.provider,
      });
    }
    if (entry.session_id) {
      requirePublishValidation(input.sessionIds.has(entry.session_id), "Live Entry session_id must belong to the Activity", {
        live_entry_id: entry.id,
        session_id: entry.session_id,
      });
    }
  }
}

function assertSnapshotBoundaries(snapshot: PublicationSnapshot) {
  for (const organizer of snapshot.organizers) {
    assertResourceTenant(organizer, snapshot.activity.tenant_id, "organizer");
  }
  for (const speaker of snapshot.speakers) {
    assertResourceTenant(speaker, snapshot.activity.tenant_id, "speaker");
  }
  for (const sponsor of snapshot.sponsors) {
    assertResourceTenant(sponsor, snapshot.activity.tenant_id, "sponsor");
  }
  for (const session of snapshot.sessions) {
    assertResourceActivity(session, snapshot.activity.id, "session");
  }
  for (const page of snapshot.page_configs) {
    assertResourceActivity(page, snapshot.activity.id, "page_config");
  }
  for (const booth of snapshot.expo_booths) {
    assertResourceActivity(booth, snapshot.activity.id, "expo_booth");
  }
  for (const entry of snapshot.live_entries) {
    assertResourceActivity(entry, snapshot.activity.id, "live_entry");
  }
  for (const survey of snapshot.surveys) {
    assertResourceActivity(survey, snapshot.activity.id, "survey");
  }
  for (const form of snapshot.registration_forms) {
    assertResourceActivity(form, snapshot.activity.id, "registration_form");
  }
}

function assertSurveys(input: { surveys: Survey[]; sessionIds: Set<string>; expoBoothIds: Set<string>; liveEntryIds: Set<string> }) {
  for (const survey of input.surveys) {
    if (survey.target_type === "activity") {
      requirePublishValidation(!survey.target_id, "Activity-targeted Survey must not include target_id", { survey_id: survey.id });
      continue;
    }

    const targetId = survey.target_id;
    if (!hasNonEmptyText(targetId)) {
      throw new DomainError("VALIDATION_FAILED", "Survey target_id is required", {
        status: 422,
        details: { survey_id: survey.id, target_type: survey.target_type },
      });
    }
    if (survey.target_type === "session") {
      requirePublishValidation(input.sessionIds.has(targetId), "Survey Session target must belong to the Activity", {
        survey_id: survey.id,
        target_id: targetId,
      });
      continue;
    }
    if (survey.target_type === "expo_booth") {
      requirePublishValidation(input.expoBoothIds.has(targetId), "Survey Expo Booth target must belong to the Activity", {
        survey_id: survey.id,
        target_id: targetId,
      });
      continue;
    }
    requirePublishValidation(input.liveEntryIds.has(targetId), "Survey Live Entry target must belong to the Activity", {
      survey_id: survey.id,
      target_id: targetId,
    });
  }
}

async function buildPublicationSnapshot(repo: EventOsRepository, activity: Activity): Promise<PublicationSnapshot> {
  const activityOrganizers = await repo.listActivityOrganizers(activity.id);
  const organizers = await repo.listActivityLinkedOrganizers(activity.id);
  const sessions = await repo.listSessions(activity.id);
  const sessionSpeakers = await repo.listActivitySessionSpeakers(activity.id);
  const speakers = await repo.listActivitySessionLinkedSpeakers(activity.id);
  const pageConfigs = await repo.listPageConfigs(activity.id);
  const expoBooths = await repo.listExpoBooths(activity.id);
  const sponsors = await repo.listActivityReferencedSponsors(activity.id);
  const liveEntries = await repo.listPublishedLiveEntries(activity.id);
  const surveys = (await repo.listSurveys(activity.id)).filter((survey) => survey.status === "published");
  const surveyQuestions = (await Promise.all(surveys.map((survey) => repo.listSurveyQuestions(survey.id)))).flat();
  const registrationForms = await repo.listRegistrationForms(activity.id);
  return {
    activity,
    activity_organizers: activityOrganizers,
    organizers,
    sessions,
    session_speakers: sessionSpeakers,
    speakers,
    page_configs: pageConfigs,
    expo_booths: expoBooths,
    sponsors,
    live_entries: liveEntries,
    surveys,
    survey_questions: surveyQuestions,
    registration_forms: registrationForms,
    generated_at: new Date().toISOString(),
  };
}

function assertPublishable(activity: Activity, snapshot: PublicationSnapshot) {
  if (!activity.name || !activity.start_time || !activity.end_time || !activity.venue?.timezone) {
    throw new DomainError("VALIDATION_FAILED", "Activity basic information is incomplete", { status: 422 });
  }
  assertSnapshotBoundaries(snapshot);

  const home = snapshot.page_configs.find((page) => page.page_key === "home");
  const agenda = snapshot.page_configs.find((page) => page.page_key === "agenda");
  if (!home?.enabled) {
    throw new DomainError("VALIDATION_FAILED", "Home page must be enabled before publishing", { status: 422 });
  }
  if (!agenda?.enabled) {
    throw new DomainError("VALIDATION_FAILED", "Agenda page must be enabled before publishing", { status: 422 });
  }

  if (snapshot.sessions.filter((session) => session.status === "scheduled").length < 1) {
    throw new DomainError("VALIDATION_FAILED", "At least one scheduled Session is required before publishing", { status: 422 });
  }

  const activityOrganizerIds = new Set(snapshot.activity_organizers.map((link) => link.organizer_id));
  const sessionIds = new Set(snapshot.sessions.map((session) => session.id));
  const speakerIds = new Set(snapshot.speakers.map((speaker) => speaker.id));
  const registrationFormIds = new Set(snapshot.registration_forms.map((form) => form.id));
  const expoBoothIds = new Set(snapshot.expo_booths.map((booth) => booth.id));
  const sponsorIds = new Set(snapshot.sponsors.map((sponsor) => sponsor.id));
  const liveEntryIds = new Set(snapshot.live_entries.map((entry) => entry.id));
  const surveyIds = new Set(snapshot.surveys.map((survey) => survey.id));

  assertLiveEntries({ liveEntries: snapshot.live_entries, sessionIds });
  assertSurveys({ surveys: snapshot.surveys, sessionIds, expoBoothIds, liveEntryIds });

  for (const form of snapshot.registration_forms) {
    assertRegistrationFormFields(form);
  }
  assertSurveyQuestions({ surveys: snapshot.surveys, surveyQuestions: snapshot.survey_questions });

  for (const page of snapshot.page_configs) {
    for (const block of page.blocks) {
      if (!block.block_key || !block.config || typeof block.config !== "object") {
        throw new DomainError("VALIDATION_FAILED", "Block configuration is invalid", { status: 422 });
      }
      assertBlockResourceRefs({
        block,
        activity,
        activityOrganizerIds,
        sessionIds,
        speakerIds,
        registrationFormIds,
        expoBoothIds,
        sponsorIds,
        liveEntryIds,
        surveyIds,
      });
    }
  }
}

function publicationSnapshotMetadata(snapshot: PublicationSnapshot) {
  return {
    activity_id: snapshot.activity.id,
    generated_at: snapshot.generated_at,
    organizers: snapshot.organizers.length,
    sessions: snapshot.sessions.length,
    speakers: snapshot.speakers.length,
    page_configs: snapshot.page_configs.length,
    blocks: snapshot.page_configs.reduce((count, page) => count + page.blocks.length, 0),
    expo_booths: snapshot.expo_booths.length,
    sponsors: snapshot.sponsors.length,
    live_entries: snapshot.live_entries.length,
    surveys: snapshot.surveys.length,
    survey_questions: snapshot.survey_questions.length,
    registration_forms: snapshot.registration_forms.length,
  };
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

  const snapshot = await buildPublicationSnapshot(input.repo, activity);
  assertPublishable(activity, snapshot);
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
    metadata: { version, etag: publication.etag, snapshot: publicationSnapshotMetadata(snapshot) },
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
    metadata: { from_version: previous.version, version: nextVersion, etag: publication.etag },
  });

  return publication;
}

export type OperatorSessionBody = Pick<Session, "title">;
export type OperatorPageConfigBody = Pick<PageConfig, "page_key" | "enabled">;
