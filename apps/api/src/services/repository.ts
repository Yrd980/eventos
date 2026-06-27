import type {
  Activity,
  ActivityOrganizer,
  ActivityPublication,
  AuditEvent,
  BusinessResourceType,
  Block,
  Checkin,
  CheckinAttempt,
  DomainErrorCode,
  ExpoBooth,
  LiveEntry,
  MyAgendaItem,
  Organizer,
  PageConfig,
  QRPass,
  Registration,
  RegistrationForm,
  Session,
  SessionSpeaker,
  Speaker,
  Sponsor,
  StaffGrant,
  Survey,
  SurveyQuestion,
  Tenant,
  User,
} from "@eventos/contracts";
import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { DbSession } from "../db";
import {
  activities,
  activityOrganizers,
  activityPublications,
  auditEvents,
  checkinAttempts,
  checkins,
  idempotencyRecords,
  expoBooths,
  liveEntries,
  myAgendaItems,
  blocks,
  operatorGrants,
  organizers,
  pageConfigs,
  participants,
  qrPasses,
  registrationForms,
  registrations,
  sessions,
  sessionSpeakers,
  sessionTracks,
  speakers,
  sponsors,
  staffGrants,
  surveyQuestions,
  surveys,
  tenants,
  users,
} from "../db/schema";

export type IdempotencyRecord = {
  id: string;
  command_name: string;
  resource_type: string;
  resource_id?: string;
  actor_authing_user_id?: string;
  idempotency_key: string;
  request_hash: string;
  status: "started" | "completed";
  response?: unknown;
};

export type EventOsRepository = ReturnType<typeof createRepository>;

function first<T>(rows: T[]) {
  return rows[0];
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function optional<T>(value: T | null | undefined) {
  return value === null ? undefined : value;
}

function mapTenant(row: typeof tenants.$inferSelect): Tenant {
  return {
    id: row.id,
    authing_org_id: row.authingOrgId,
    name: row.name,
    code: row.code,
    status: row.status as Tenant["status"],
    created_at: iso(row.createdAt),
  };
}

function mapUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    authing_user_id: row.authingUserId,
    display_name: optional(row.displayName),
    avatar_url: optional(row.avatarUrl),
    created_at: iso(row.createdAt),
  };
}

function mapActivity(row: typeof activities.$inferSelect): Activity {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    theme_name: optional(row.themeName),
    description: optional(row.description),
    start_time: iso(row.startTime),
    end_time: iso(row.endTime),
    timezone: row.timezone,
    venue: row.venue as Activity["venue"],
    status: row.status as Activity["status"],
    template_id: optional(row.templateId),
    theme: optional(row.theme as Activity["theme"] | null),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

function mapOrganizer(row: typeof organizers.$inferSelect): Organizer {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    logo_url: optional(row.logoUrl),
    description: optional(row.description),
    website_url: optional(row.websiteUrl),
    contact: optional(row.contact),
    created_at: iso(row.createdAt),
  };
}

function mapActivityOrganizer(row: typeof activityOrganizers.$inferSelect): ActivityOrganizer {
  return {
    activity_id: row.activityId,
    organizer_id: row.organizerId,
    sort_order: row.sortOrder,
  };
}

function mapSponsor(row: typeof sponsors.$inferSelect): Sponsor {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    logo_url: optional(row.logoUrl),
    description: optional(row.description),
    website_url: optional(row.websiteUrl),
    created_at: iso(row.createdAt),
  };
}

function mapSpeaker(row: typeof speakers.$inferSelect): Speaker {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    title: optional(row.title),
    bio: optional(row.bio),
    avatar_url: optional(row.avatarUrl),
    organization: optional(row.organization),
    created_at: iso(row.createdAt),
  };
}

function mapSessionSpeaker(row: typeof sessionSpeakers.$inferSelect): SessionSpeaker {
  return {
    session_id: row.sessionId,
    speaker_id: row.speakerId,
    role: row.role as SessionSpeaker["role"],
    sort_order: row.sortOrder,
    title_override: optional(row.titleOverride),
    bio_override: optional(row.bioOverride),
  };
}

function mapPublication(row: typeof activityPublications.$inferSelect): ActivityPublication {
  return {
    id: row.id,
    activity_id: row.activityId,
    version: row.version,
    status: row.status as ActivityPublication["status"],
    published_by_user_id: row.publishedByUserId,
    summary: optional(row.summary),
    snapshot: row.snapshot as Record<string, unknown>,
    etag: row.etag,
    published_at: iso(row.publishedAt),
  };
}

function mapSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    activity_id: row.activityId,
    track_id: optional(row.trackId),
    title: row.title,
    description: optional(row.description),
    start_time: iso(row.startTime),
    end_time: iso(row.endTime),
    timezone: row.timezone,
    room_name: optional(row.roomName),
    venue_area: optional(row.venueArea),
    status: row.status as Session["status"],
    capacity: optional(row.capacity),
    requires_reservation: row.requiresReservation,
    sort_order: row.sortOrder,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

function mapPageConfig(row: typeof pageConfigs.$inferSelect, blockRows: Array<typeof blocks.$inferSelect> = []): PageConfig {
  return {
    id: row.id,
    activity_id: row.activityId,
    page_key: row.pageKey as PageConfig["page_key"],
    enabled: row.enabled,
    blocks: blockRows.map(mapBlock),
  };
}

function mapBlock(row: typeof blocks.$inferSelect): Block {
  return {
    id: row.id,
    block_key: row.blockKey,
    enabled: row.enabled,
    sort_order: row.sortOrder,
    resource_refs: row.resourceRefs as Block["resource_refs"],
    config: row.config as Record<string, unknown>,
    display_snapshot: row.displaySnapshot as Record<string, unknown> | undefined,
  };
}

function mapRegistration(row: typeof registrations.$inferSelect): Registration {
  return {
    id: row.id,
    activity_id: row.activityId,
    participant_id: row.participantId,
    status: row.status as Registration["status"],
    source: row.source as Registration["source"],
    form_version_id: optional(row.formVersionId),
    submitted_at: row.submittedAt ? iso(row.submittedAt) : undefined,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

function mapQRPass(row: typeof qrPasses.$inferSelect): QRPass {
  return {
    id: row.id,
    activity_id: row.activityId,
    participant_id: row.participantId,
    registration_id: row.registrationId,
    status: row.status as QRPass["status"],
    token_fingerprint: row.tokenFingerprint,
    issued_at: iso(row.issuedAt),
    invalidated_at: row.invalidatedAt ? iso(row.invalidatedAt) : undefined,
    expires_at: row.expiresAt ? iso(row.expiresAt) : undefined,
  };
}

function mapMyAgendaItem(row: typeof myAgendaItems.$inferSelect): MyAgendaItem {
  return {
    id: row.id,
    activity_id: row.activityId,
    participant_id: row.participantId,
    session_id: row.sessionId,
    source: row.source as MyAgendaItem["source"],
    source_ref: optional(row.sourceRef),
    created_at: iso(row.createdAt),
  };
}

function mapCheckin(row: typeof checkins.$inferSelect): Checkin {
  return {
    id: row.id,
    activity_id: row.activityId,
    participant_id: row.participantId,
    session_id: row.sessionId,
    qr_pass_id: row.qrPassId,
    source: row.source as Checkin["source"],
    staff_user_id: optional(row.staffUserId),
    device_metadata: optional(row.deviceMetadata as Record<string, unknown> | null),
    created_at: iso(row.createdAt),
  };
}

function mapExpoBooth(row: typeof expoBooths.$inferSelect): ExpoBooth {
  return {
    id: row.id,
    activity_id: row.activityId,
    sponsor_id: optional(row.sponsorId),
    name: row.name,
    description: optional(row.description),
    category: optional(row.category),
    location: optional(row.location),
    logo_url: optional(row.logoUrl),
    status: row.status as ExpoBooth["status"],
    sort_order: row.sortOrder,
  };
}

function mapLiveEntry(row: typeof liveEntries.$inferSelect): LiveEntry {
  return {
    id: row.id,
    activity_id: row.activityId,
    session_id: optional(row.sessionId),
    title: row.title,
    provider: row.provider as LiveEntry["provider"],
    url: optional(row.url),
    deep_link: optional(row.deepLink),
    access_policy: row.accessPolicy as LiveEntry["access_policy"],
    start_time: row.startTime ? iso(row.startTime) : undefined,
    end_time: row.endTime ? iso(row.endTime) : undefined,
    status: row.status as LiveEntry["status"],
    sort_order: row.sortOrder,
  };
}

function mapRegistrationForm(row: typeof registrationForms.$inferSelect): RegistrationForm {
  return {
    id: row.id,
    activity_id: row.activityId,
    title: row.title,
    fields: row.fields as RegistrationForm["fields"],
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

function mapSurvey(row: typeof surveys.$inferSelect): Survey {
  return {
    id: row.id,
    activity_id: row.activityId,
    title: row.title,
    description: optional(row.description),
    target_type: row.targetType as Survey["target_type"],
    target_id: optional(row.targetId),
    access_policy: row.accessPolicy as Survey["access_policy"],
    status: row.status as Survey["status"],
  };
}

function mapSurveyQuestion(row: typeof surveyQuestions.$inferSelect): SurveyQuestion {
  return {
    id: row.id,
    survey_id: row.surveyId,
    key: row.key,
    label: row.label,
    type: row.type as SurveyQuestion["type"],
    required: row.required,
    options: optional(row.options as SurveyQuestion["options"] | null),
    sort_order: row.sortOrder,
  };
}

function mapStaffGrant(row: typeof staffGrants.$inferSelect): StaffGrant {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    activity_id: row.activityId,
    user_id: row.userId,
    authing_user_id: row.authingUserId,
    grant_source: "authing",
    created_at: iso(row.createdAt),
  };
}

export function createRepository(db: DbSession) {
  return {
    async listActivities(input: { tenantCode?: string; limit: number; cursor?: string }) {
      const filters = [inArray(activities.status, ["published", "archived"])];

      if (input.tenantCode) {
        filters.push(eq(tenants.code, input.tenantCode));
      }

      if (input.cursor) {
        filters.push(lt(activities.startTime, new Date(input.cursor)));
      }

      const rows = await db
        .select({ activity: activities })
        .from(activities)
        .innerJoin(tenants, eq(tenants.id, activities.tenantId))
        .where(and(...filters))
        .orderBy(desc(activities.startTime), desc(activities.id))
        .limit(input.limit + 1);

      return rows.map((row) => mapActivity(row.activity));
    },

    async listTenantActivities(input: { tenantId: string; limit: number; cursor?: string }) {
      const filters = [eq(activities.tenantId, input.tenantId)];
      if (input.cursor) {
        filters.push(lt(activities.startTime, new Date(input.cursor)));
      }

      return (
        await db
          .select()
          .from(activities)
          .where(and(...filters))
          .orderBy(desc(activities.startTime), desc(activities.id))
          .limit(input.limit + 1)
      ).map(mapActivity);
    },

    async getActivity(activityId: string) {
      return first((await db.select().from(activities).where(eq(activities.id, activityId)).limit(1)).map(mapActivity));
    },

    async getTenantById(tenantId: string) {
      return first((await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)).map(mapTenant));
    },

    async getTenantByAuthingOrgId(authingOrgId: string) {
      return first((await db.select().from(tenants).where(eq(tenants.authingOrgId, authingOrgId)).limit(1)).map(mapTenant));
    },

    async listOrganizers(tenantId: string) {
      return (await db.select().from(organizers).where(eq(organizers.tenantId, tenantId)).orderBy(desc(organizers.createdAt), organizers.id)).map(mapOrganizer);
    },

    async getOrganizer(organizerId: string) {
      return first((await db.select().from(organizers).where(eq(organizers.id, organizerId)).limit(1)).map(mapOrganizer));
    },

    async createOrganizer(input: { id: string; tenantId: string; name: string; logoUrl?: string; description?: string; websiteUrl?: string; contact?: string }) {
      const rows = await db
        .insert(organizers)
        .values({
          id: input.id,
          tenantId: input.tenantId,
          name: input.name,
          logoUrl: input.logoUrl,
          description: input.description,
          websiteUrl: input.websiteUrl,
          contact: input.contact,
        })
        .returning();
      return mapOrganizer(rows[0]);
    },

    async updateOrganizer(input: { id: string; name?: string; logoUrl?: string; description?: string; websiteUrl?: string; contact?: string }) {
      const rows = await db
        .update(organizers)
        .set({
          name: input.name,
          logoUrl: input.logoUrl,
          description: input.description,
          websiteUrl: input.websiteUrl,
          contact: input.contact,
        })
        .where(eq(organizers.id, input.id))
        .returning();
      return first(rows.map(mapOrganizer));
    },

    async listSponsors(tenantId: string) {
      return (await db.select().from(sponsors).where(eq(sponsors.tenantId, tenantId)).orderBy(desc(sponsors.createdAt), sponsors.id)).map(mapSponsor);
    },

    async getSponsor(sponsorId: string) {
      return first((await db.select().from(sponsors).where(eq(sponsors.id, sponsorId)).limit(1)).map(mapSponsor));
    },

    async createSponsor(input: { id: string; tenantId: string; name: string; logoUrl?: string; description?: string; websiteUrl?: string }) {
      const rows = await db
        .insert(sponsors)
        .values({
          id: input.id,
          tenantId: input.tenantId,
          name: input.name,
          logoUrl: input.logoUrl,
          description: input.description,
          websiteUrl: input.websiteUrl,
        })
        .returning();
      return mapSponsor(rows[0]);
    },

    async updateSponsor(input: { id: string; name?: string; logoUrl?: string; description?: string; websiteUrl?: string }) {
      const rows = await db
        .update(sponsors)
        .set({
          name: input.name,
          logoUrl: input.logoUrl,
          description: input.description,
          websiteUrl: input.websiteUrl,
        })
        .where(eq(sponsors.id, input.id))
        .returning();
      return first(rows.map(mapSponsor));
    },

    async listSpeakers(tenantId: string) {
      return (await db.select().from(speakers).where(eq(speakers.tenantId, tenantId)).orderBy(desc(speakers.createdAt), speakers.id)).map(mapSpeaker);
    },

    async getSpeaker(speakerId: string) {
      return first((await db.select().from(speakers).where(eq(speakers.id, speakerId)).limit(1)).map(mapSpeaker));
    },

    async createSpeaker(input: { id: string; tenantId: string; name: string; title?: string; bio?: string; avatarUrl?: string; organization?: string }) {
      const rows = await db
        .insert(speakers)
        .values({
          id: input.id,
          tenantId: input.tenantId,
          name: input.name,
          title: input.title,
          bio: input.bio,
          avatarUrl: input.avatarUrl,
          organization: input.organization,
        })
        .returning();
      return mapSpeaker(rows[0]);
    },

    async updateSpeaker(input: { id: string; name?: string; title?: string; bio?: string; avatarUrl?: string; organization?: string }) {
      const rows = await db
        .update(speakers)
        .set({
          name: input.name,
          title: input.title,
          bio: input.bio,
          avatarUrl: input.avatarUrl,
          organization: input.organization,
        })
        .where(eq(speakers.id, input.id))
        .returning();
      return first(rows.map(mapSpeaker));
    },

    async hasOperatorGrant(input: { tenantId: string; userId: string; activityId?: string }) {
      const rows = await db
        .select({ id: operatorGrants.id })
        .from(operatorGrants)
        .where(
          and(
            eq(operatorGrants.tenantId, input.tenantId),
            eq(operatorGrants.userId, input.userId),
            input.activityId
              ? or(eq(operatorGrants.scope, "tenant"), and(eq(operatorGrants.scope, "activity"), eq(operatorGrants.activityId, input.activityId)))
              : eq(operatorGrants.scope, "tenant"),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async listActivityOrganizers(activityId: string) {
      return (
        await db.select().from(activityOrganizers).where(eq(activityOrganizers.activityId, activityId)).orderBy(activityOrganizers.sortOrder, activityOrganizers.organizerId)
      ).map(mapActivityOrganizer);
    },

    async upsertActivityOrganizer(input: { activityId: string; organizerId: string; sortOrder: number }) {
      const rows = await db
        .insert(activityOrganizers)
        .values({
          activityId: input.activityId,
          organizerId: input.organizerId,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [activityOrganizers.activityId, activityOrganizers.organizerId],
          set: { sortOrder: input.sortOrder },
        })
        .returning();
      return mapActivityOrganizer(rows[0]);
    },

    async getCurrentPublication(activityId: string) {
      return first(
        (
          await db
            .select()
            .from(activityPublications)
            .where(and(eq(activityPublications.activityId, activityId), eq(activityPublications.status, "published")))
            .orderBy(desc(activityPublications.version))
            .limit(1)
        ).map(mapPublication),
      );
    },

    async listSessions(activityId: string) {
      return (
        await db
          .select()
          .from(sessions)
          .where(and(eq(sessions.activityId, activityId), inArray(sessions.status, ["scheduled", "cancelled"])))
          .orderBy(sessions.startTime, sessions.sortOrder, sessions.id)
      ).map(mapSession);
    },

    async listOperatorSessions(activityId: string) {
      return (
        await db
          .select()
          .from(sessions)
          .where(eq(sessions.activityId, activityId))
          .orderBy(sessions.startTime, sessions.sortOrder, sessions.id)
      ).map(mapSession);
    },

    async listExpoBooths(activityId: string) {
      return (
        await db
          .select()
          .from(expoBooths)
          .where(and(eq(expoBooths.activityId, activityId), eq(expoBooths.status, "visible")))
          .orderBy(expoBooths.sortOrder, expoBooths.name)
      ).map(mapExpoBooth);
    },

    async listOperatorExpoBooths(activityId: string) {
      return (
        await db
          .select()
          .from(expoBooths)
          .where(eq(expoBooths.activityId, activityId))
          .orderBy(expoBooths.sortOrder, expoBooths.name, expoBooths.id)
      ).map(mapExpoBooth);
    },

    async getExpoBooth(expoBoothId: string) {
      return first((await db.select().from(expoBooths).where(eq(expoBooths.id, expoBoothId)).limit(1)).map(mapExpoBooth));
    },

    async createExpoBooth(input: {
      id: string;
      activityId: string;
      sponsorId?: string;
      name: string;
      description?: string;
      category?: string;
      location?: string;
      logoUrl?: string;
      status: ExpoBooth["status"];
      sortOrder: number;
    }) {
      const rows = await db
        .insert(expoBooths)
        .values({
          id: input.id,
          activityId: input.activityId,
          sponsorId: input.sponsorId,
          name: input.name,
          description: input.description,
          category: input.category,
          location: input.location,
          logoUrl: input.logoUrl,
          status: input.status,
          sortOrder: input.sortOrder,
        })
        .returning();
      return mapExpoBooth(rows[0]);
    },

    async updateExpoBooth(input: {
      id: string;
      sponsorId?: string | null;
      name?: string;
      description?: string;
      category?: string;
      location?: string;
      logoUrl?: string;
      status?: ExpoBooth["status"];
      sortOrder?: number;
    }) {
      const rows = await db
        .update(expoBooths)
        .set({
          sponsorId: input.sponsorId === undefined ? undefined : input.sponsorId,
          name: input.name,
          description: input.description,
          category: input.category,
          location: input.location,
          logoUrl: input.logoUrl,
          status: input.status,
          sortOrder: input.sortOrder,
        })
        .where(eq(expoBooths.id, input.id))
        .returning();
      return first(rows.map(mapExpoBooth));
    },

    async listOperatorLiveEntries(activityId: string) {
      return (
        await db
          .select()
          .from(liveEntries)
          .where(eq(liveEntries.activityId, activityId))
          .orderBy(liveEntries.sortOrder, liveEntries.startTime, liveEntries.id)
      ).map(mapLiveEntry);
    },

    async getLiveEntry(liveEntryId: string) {
      return first((await db.select().from(liveEntries).where(eq(liveEntries.id, liveEntryId)).limit(1)).map(mapLiveEntry));
    },

    async createLiveEntry(input: {
      id: string;
      activityId: string;
      sessionId?: string;
      title: string;
      provider: LiveEntry["provider"];
      url?: string;
      deepLink?: string;
      accessPolicy: LiveEntry["access_policy"];
      startTime?: Date;
      endTime?: Date;
      status: LiveEntry["status"];
      sortOrder: number;
    }) {
      const rows = await db
        .insert(liveEntries)
        .values({
          id: input.id,
          activityId: input.activityId,
          sessionId: input.sessionId,
          title: input.title,
          provider: input.provider,
          url: input.url,
          deepLink: input.deepLink,
          accessPolicy: input.accessPolicy,
          startTime: input.startTime,
          endTime: input.endTime,
          status: input.status,
          sortOrder: input.sortOrder,
        })
        .returning();
      return mapLiveEntry(rows[0]);
    },

    async updateLiveEntry(input: {
      id: string;
      sessionId?: string | null;
      title?: string;
      provider?: LiveEntry["provider"];
      url?: string | null;
      deepLink?: string | null;
      accessPolicy?: LiveEntry["access_policy"];
      startTime?: Date | null;
      endTime?: Date | null;
      status?: LiveEntry["status"];
      sortOrder?: number;
    }) {
      const rows = await db
        .update(liveEntries)
        .set({
          sessionId: input.sessionId === undefined ? undefined : input.sessionId,
          title: input.title,
          provider: input.provider,
          url: input.url === undefined ? undefined : input.url,
          deepLink: input.deepLink === undefined ? undefined : input.deepLink,
          accessPolicy: input.accessPolicy,
          startTime: input.startTime === undefined ? undefined : input.startTime,
          endTime: input.endTime === undefined ? undefined : input.endTime,
          status: input.status,
          sortOrder: input.sortOrder,
        })
        .where(eq(liveEntries.id, input.id))
        .returning();
      return first(rows.map(mapLiveEntry));
    },

    async listRegistrationForms(activityId: string) {
      return (
        await db
          .select()
          .from(registrationForms)
          .where(eq(registrationForms.activityId, activityId))
          .orderBy(desc(registrationForms.updatedAt), registrationForms.id)
      ).map(mapRegistrationForm);
    },

    async getRegistrationForm(registrationFormId: string) {
      return first((await db.select().from(registrationForms).where(eq(registrationForms.id, registrationFormId)).limit(1)).map(mapRegistrationForm));
    },

    async upsertRegistrationForm(input: { id: string; activityId: string; title: string; fields: RegistrationForm["fields"] }) {
      const rows = await db
        .insert(registrationForms)
        .values({
          id: input.id,
          activityId: input.activityId,
          title: input.title,
          fields: input.fields,
        })
        .onConflictDoUpdate({
          target: registrationForms.id,
          set: {
            title: input.title,
            fields: input.fields,
            updatedAt: new Date(),
          },
        })
        .returning();
      return mapRegistrationForm(rows[0]);
    },

    async listSurveys(activityId: string) {
      return (
        await db
          .select()
          .from(surveys)
          .where(eq(surveys.activityId, activityId))
          .orderBy(surveys.status, surveys.title, surveys.id)
      ).map(mapSurvey);
    },

    async getSurvey(surveyId: string) {
      return first((await db.select().from(surveys).where(eq(surveys.id, surveyId)).limit(1)).map(mapSurvey));
    },

    async createSurvey(input: {
      id: string;
      activityId: string;
      title: string;
      description?: string;
      targetType: Survey["target_type"];
      targetId?: string;
      accessPolicy: Survey["access_policy"];
      status: Survey["status"];
    }) {
      const rows = await db
        .insert(surveys)
        .values({
          id: input.id,
          activityId: input.activityId,
          title: input.title,
          description: input.description,
          targetType: input.targetType,
          targetId: input.targetId,
          accessPolicy: input.accessPolicy,
          status: input.status,
        })
        .returning();
      return mapSurvey(rows[0]);
    },

    async updateSurvey(input: {
      id: string;
      title?: string;
      description?: string | null;
      targetType?: Survey["target_type"];
      targetId?: string | null;
      accessPolicy?: Survey["access_policy"];
      status?: Survey["status"];
    }) {
      const rows = await db
        .update(surveys)
        .set({
          title: input.title,
          description: input.description === undefined ? undefined : input.description,
          targetType: input.targetType,
          targetId: input.targetId === undefined ? undefined : input.targetId,
          accessPolicy: input.accessPolicy,
          status: input.status,
        })
        .where(eq(surveys.id, input.id))
        .returning();
      return first(rows.map(mapSurvey));
    },

    async listSurveyQuestions(surveyId: string) {
      return (
        await db
          .select()
          .from(surveyQuestions)
          .where(eq(surveyQuestions.surveyId, surveyId))
          .orderBy(surveyQuestions.sortOrder, surveyQuestions.id)
      ).map(mapSurveyQuestion);
    },

    async getSurveyQuestion(questionId: string) {
      return first((await db.select().from(surveyQuestions).where(eq(surveyQuestions.id, questionId)).limit(1)).map(mapSurveyQuestion));
    },

    async upsertSurveyQuestion(input: {
      id: string;
      activityId: string;
      surveyId: string;
      key: string;
      label: string;
      type: SurveyQuestion["type"];
      required: boolean;
      options?: SurveyQuestion["options"];
      sortOrder: number;
    }) {
      const rows = await db
        .insert(surveyQuestions)
        .values({
          id: input.id,
          activityId: input.activityId,
          surveyId: input.surveyId,
          key: input.key,
          label: input.label,
          type: input.type,
          required: input.required,
          options: input.options,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [surveyQuestions.surveyId, surveyQuestions.key],
          set: {
            label: input.label,
            type: input.type,
            required: input.required,
            options: input.options,
            sortOrder: input.sortOrder,
          },
        })
        .returning();
      return mapSurveyQuestion(rows[0]);
    },

    async countScheduledSessions(activityId: string) {
      const rows = await db.select({ value: count() }).from(sessions).where(and(eq(sessions.activityId, activityId), eq(sessions.status, "scheduled")));
      return rows[0]?.value ?? 0;
    },

    async getSession(sessionId: string) {
      return first((await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)).map(mapSession));
    },

    async createActivity(input: {
      id: string;
      tenantId: string;
      name: string;
      description?: string;
      startTime: Date;
      endTime: Date;
      timezone: string;
      venue: Record<string, unknown>;
      theme?: Record<string, unknown>;
      themeName?: string;
    }) {
      const rows = await db
        .insert(activities)
        .values({
          id: input.id,
          tenantId: input.tenantId,
          name: input.name,
          description: input.description,
          startTime: input.startTime,
          endTime: input.endTime,
          timezone: input.timezone,
          venue: input.venue,
          theme: input.theme,
          themeName: input.themeName,
          status: "draft",
        })
        .returning();
      return mapActivity(rows[0]);
    },

    async updateActivity(input: {
      id: string;
      name?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      timezone?: string;
      venue?: Record<string, unknown>;
      theme?: Record<string, unknown>;
      themeName?: string;
      status?: Activity["status"];
    }) {
      const rows = await db
        .update(activities)
        .set({
          name: input.name,
          description: input.description,
          startTime: input.startTime,
          endTime: input.endTime,
          timezone: input.timezone,
          venue: input.venue,
          theme: input.theme,
          themeName: input.themeName,
          status: input.status,
          updatedAt: new Date(),
        })
        .where(eq(activities.id, input.id))
        .returning();
      return first(rows.map(mapActivity));
    },

    async createSession(input: {
      id: string;
      activityId: string;
      trackId?: string;
      title: string;
      description?: string;
      startTime: Date;
      endTime: Date;
      timezone: string;
      roomName?: string;
      venueArea?: string;
      status?: Session["status"];
      capacity?: number;
      requiresReservation?: boolean;
      sortOrder?: number;
    }) {
      const rows = await db
        .insert(sessions)
        .values({
          id: input.id,
          activityId: input.activityId,
          trackId: input.trackId,
          title: input.title,
          description: input.description,
          startTime: input.startTime,
          endTime: input.endTime,
          timezone: input.timezone,
          roomName: input.roomName,
          venueArea: input.venueArea,
          status: input.status ?? "scheduled",
          capacity: input.capacity,
          requiresReservation: input.requiresReservation ?? false,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      return mapSession(rows[0]);
    },

    async updateSession(input: {
      id: string;
      trackId?: string;
      title?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      timezone?: string;
      roomName?: string;
      venueArea?: string;
      status?: Session["status"];
      capacity?: number;
      requiresReservation?: boolean;
      sortOrder?: number;
    }) {
      const rows = await db
        .update(sessions)
        .set({
          trackId: input.trackId,
          title: input.title,
          description: input.description,
          startTime: input.startTime,
          endTime: input.endTime,
          timezone: input.timezone,
          roomName: input.roomName,
          venueArea: input.venueArea,
          status: input.status,
          capacity: input.capacity,
          requiresReservation: input.requiresReservation,
          sortOrder: input.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, input.id))
        .returning();
      return first(rows.map(mapSession));
    },

    async listSessionSpeakers(sessionId: string) {
      return (
        await db.select().from(sessionSpeakers).where(eq(sessionSpeakers.sessionId, sessionId)).orderBy(sessionSpeakers.sortOrder, sessionSpeakers.speakerId)
      ).map(mapSessionSpeaker);
    },

    async upsertSessionSpeaker(input: {
      sessionId: string;
      speakerId: string;
      role: SessionSpeaker["role"];
      sortOrder: number;
      titleOverride?: string;
      bioOverride?: string;
    }) {
      const rows = await db
        .insert(sessionSpeakers)
        .values({
          sessionId: input.sessionId,
          speakerId: input.speakerId,
          role: input.role,
          sortOrder: input.sortOrder,
          titleOverride: input.titleOverride,
          bioOverride: input.bioOverride,
        })
        .onConflictDoUpdate({
          target: [sessionSpeakers.sessionId, sessionSpeakers.speakerId],
          set: {
            role: input.role,
            sortOrder: input.sortOrder,
            titleOverride: input.titleOverride,
            bioOverride: input.bioOverride,
          },
        })
        .returning();
      return mapSessionSpeaker(rows[0]);
    },

    async upsertSessionTrack(input: { id: string; activityId: string; name: string; color?: string; sortOrder?: number }) {
      const rows = await db
        .insert(sessionTracks)
        .values({
          id: input.id,
          activityId: input.activityId,
          name: input.name,
          color: input.color,
          sortOrder: input.sortOrder ?? 0,
        })
        .onConflictDoUpdate({
          target: [sessionTracks.activityId, sessionTracks.name],
          set: {
            color: input.color,
            sortOrder: input.sortOrder ?? 0,
          },
        })
        .returning();
      return rows[0];
    },

    async upsertUser(input: { id: string; authingUserId: string; displayName?: string; avatarUrl?: string }) {
      const rows = await db
        .insert(users)
        .values({
          id: input.id,
          authingUserId: input.authingUserId,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
        })
        .onConflictDoUpdate({
          target: users.authingUserId,
          set: {
            displayName: sql`COALESCE(EXCLUDED.display_name, ${users.displayName})`,
            avatarUrl: sql`COALESCE(EXCLUDED.avatar_url, ${users.avatarUrl})`,
          },
        })
        .returning();

      return mapUser(rows[0]);
    },

    async findParticipant(activityId: string, userId: string) {
      return first(await db.select().from(participants).where(and(eq(participants.activityId, activityId), eq(participants.userId, userId))).limit(1));
    },

    async ensureParticipant(input: { id: string; activityId: string; userId: string; displayName?: string }) {
      return first(
        await db
          .insert(participants)
          .values({
            id: input.id,
            activityId: input.activityId,
            userId: input.userId,
            displayName: input.displayName,
          })
          .onConflictDoUpdate({
            target: [participants.activityId, participants.userId],
            set: { displayName: sql`COALESCE(EXCLUDED.display_name, ${participants.displayName})` },
          })
          .returning(),
      );
    },

    async getRegistration(activityId: string, participantId: string) {
      return first(
        (
          await db
            .select()
            .from(registrations)
            .where(and(eq(registrations.activityId, activityId), eq(registrations.participantId, participantId)))
            .limit(1)
        ).map(mapRegistration),
      );
    },

    async getPageConfig(activityId: string, pageKey: PageConfig["page_key"]) {
      const page = first(await db.select().from(pageConfigs).where(and(eq(pageConfigs.activityId, activityId), eq(pageConfigs.pageKey, pageKey))).limit(1));
      if (!page) {
        return undefined;
      }

      const blockRows = await db.select().from(blocks).where(eq(blocks.pageConfigId, page.id)).orderBy(blocks.sortOrder, blocks.id);
      return mapPageConfig(page, blockRows);
    },

    async listPageConfigs(activityId: string) {
      const pages = await db.select().from(pageConfigs).where(eq(pageConfigs.activityId, activityId)).orderBy(pageConfigs.pageKey);
      const blockRows = await db.select().from(blocks).where(eq(blocks.activityId, activityId)).orderBy(blocks.sortOrder, blocks.id);
      return pages.map((page) => mapPageConfig(page, blockRows.filter((block) => block.pageConfigId === page.id)));
    },

    async upsertPageConfig(input: { id: string; activityId: string; pageKey: PageConfig["page_key"]; enabled: boolean }) {
      const rows = await db
        .insert(pageConfigs)
        .values({
          id: input.id,
          activityId: input.activityId,
          pageKey: input.pageKey,
          enabled: input.enabled,
        })
        .onConflictDoUpdate({
          target: [pageConfigs.activityId, pageConfigs.pageKey],
          set: {
            enabled: input.enabled,
            updatedAt: new Date(),
          },
        })
        .returning();
      return mapPageConfig(rows[0]);
    },

    async upsertBlock(input: {
      id: string;
      activityId: string;
      pageConfigId: string;
      blockKey: string;
      enabled: boolean;
      sortOrder: number;
      resourceRefs?: Block["resource_refs"];
      config: Record<string, unknown>;
      displaySnapshot?: Record<string, unknown>;
    }) {
      const rows = await db
        .insert(blocks)
        .values({
          id: input.id,
          activityId: input.activityId,
          pageConfigId: input.pageConfigId,
          blockKey: input.blockKey,
          enabled: input.enabled,
          sortOrder: input.sortOrder,
          resourceRefs: input.resourceRefs,
          config: input.config,
          displaySnapshot: input.displaySnapshot,
        })
        .returning();
      return mapBlock(rows[0]);
    },

    async supersedeCurrentPublication(activityId: string) {
      await db
        .update(activityPublications)
        .set({ status: "superseded" })
        .where(and(eq(activityPublications.activityId, activityId), eq(activityPublications.status, "published")));
    },

    async getNextPublicationVersion(activityId: string) {
      const rows = await db
        .select({ value: sql<number>`COALESCE(MAX(${activityPublications.version}), 0) + 1` })
        .from(activityPublications)
        .where(eq(activityPublications.activityId, activityId));
      return Number(rows[0]?.value ?? 1);
    },

    async createPublication(input: {
      id: string;
      activityId: string;
      version: number;
      publishedByUserId: string;
      summary?: string;
      snapshot: Record<string, unknown>;
      etag: string;
    }) {
      const rows = await db
        .insert(activityPublications)
        .values({
          id: input.id,
          activityId: input.activityId,
          version: input.version,
          status: "published",
          publishedByUserId: input.publishedByUserId,
          summary: input.summary,
          snapshot: input.snapshot,
          etag: input.etag,
        })
        .returning();
      return mapPublication(rows[0]);
    },

    async listPublications(activityId: string) {
      return (
        await db
          .select()
          .from(activityPublications)
          .where(eq(activityPublications.activityId, activityId))
          .orderBy(desc(activityPublications.version))
      ).map(mapPublication);
    },

    async getPublicationByVersion(activityId: string, version: number) {
      return first(
        (
          await db
            .select()
            .from(activityPublications)
            .where(and(eq(activityPublications.activityId, activityId), eq(activityPublications.version, version)))
            .limit(1)
        ).map(mapPublication),
      );
    },

    async createRegistration(input: { id: string; activityId: string; participantId: string; source: Registration["source"] }) {
      const rows = await db
        .insert(registrations)
        .values({
          id: input.id,
          activityId: input.activityId,
          participantId: input.participantId,
          status: "confirmed",
          source: input.source,
          submittedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [registrations.activityId, registrations.participantId],
          set: { updatedAt: sql`${registrations.updatedAt}` },
        })
        .returning();

      return mapRegistration(rows[0]);
    },

    async getActiveQRPass(activityId: string, participantId: string) {
      return first(
        (
          await db
            .select()
            .from(qrPasses)
            .where(and(eq(qrPasses.activityId, activityId), eq(qrPasses.participantId, participantId), eq(qrPasses.status, "active")))
            .orderBy(desc(qrPasses.issuedAt))
            .limit(1)
        ).map(mapQRPass),
      );
    },

    async getQRPassByFingerprint(fingerprint: string) {
      return first((await db.select().from(qrPasses).where(eq(qrPasses.tokenFingerprint, fingerprint)).limit(1)).map(mapQRPass));
    },

    async createQRPass(input: { id: string; activityId: string; participantId: string; registrationId: string; tokenFingerprint: string }) {
      const rows = await db
        .insert(qrPasses)
        .values({
          id: input.id,
          activityId: input.activityId,
          participantId: input.participantId,
          registrationId: input.registrationId,
          status: "active",
          tokenFingerprint: input.tokenFingerprint,
        })
        .onConflictDoUpdate({
          target: qrPasses.registrationId,
          targetWhere: eq(qrPasses.status, "active"),
          set: { issuedAt: sql`${qrPasses.issuedAt}` },
        })
        .returning();

      return mapQRPass(rows[0]);
    },

    async addMyAgendaItem(input: { id: string; activityId: string; participantId: string; sessionId: string; source: MyAgendaItem["source"] }) {
      const rows = await db
        .insert(myAgendaItems)
        .values({
          id: input.id,
          activityId: input.activityId,
          participantId: input.participantId,
          sessionId: input.sessionId,
          source: input.source,
        })
        .onConflictDoUpdate({
          target: [myAgendaItems.activityId, myAgendaItems.participantId, myAgendaItems.sessionId],
          set: { source: sql`${myAgendaItems.source}` },
        })
        .returning();

      return mapMyAgendaItem(rows[0]);
    },

    async removeMyAgendaItem(activityId: string, participantId: string, sessionId: string) {
      return first(
        (
          await db
            .delete(myAgendaItems)
            .where(and(eq(myAgendaItems.activityId, activityId), eq(myAgendaItems.participantId, participantId), eq(myAgendaItems.sessionId, sessionId)))
            .returning()
        ).map(mapMyAgendaItem),
      );
    },

    async listMyAgenda(activityId: string, participantId: string) {
      return (
        await db
          .select()
          .from(myAgendaItems)
          .where(and(eq(myAgendaItems.activityId, activityId), eq(myAgendaItems.participantId, participantId)))
          .orderBy(desc(myAgendaItems.createdAt))
      ).map(mapMyAgendaItem);
    },

    async hasStaffGrant(activityId: string, userId: string) {
      const rows = await db.select({ id: staffGrants.id }).from(staffGrants).where(and(eq(staffGrants.activityId, activityId), eq(staffGrants.userId, userId))).limit(1);
      return rows.length > 0;
    },

    async listStaffGrants(activityId: string) {
      return (
        await db
          .select()
          .from(staffGrants)
          .where(eq(staffGrants.activityId, activityId))
          .orderBy(desc(staffGrants.createdAt), staffGrants.id)
      ).map(mapStaffGrant);
    },

    async upsertStaffGrant(input: { id: string; tenantId: string; activityId: string; userId: string; authingUserId: string }) {
      const rows = await db
        .insert(staffGrants)
        .values({
          id: input.id,
          tenantId: input.tenantId,
          activityId: input.activityId,
          userId: input.userId,
          authingUserId: input.authingUserId,
          grantSource: "authing",
        })
        .onConflictDoUpdate({
          target: [staffGrants.activityId, staffGrants.userId],
          set: { grantSource: sql`${staffGrants.grantSource}` },
        })
        .returning();

      return mapStaffGrant(rows[0]);
    },

    async createCheckin(input: {
      id: string;
      activityId: string;
      participantId: string;
      sessionId: string;
      qrPassId: string;
      staffUserId: string;
      deviceMetadata?: Record<string, unknown>;
    }) {
      const rows = await db
        .insert(checkins)
        .values({
          id: input.id,
          activityId: input.activityId,
          participantId: input.participantId,
          sessionId: input.sessionId,
          qrPassId: input.qrPassId,
          source: "staff",
          staffUserId: input.staffUserId,
          deviceMetadata: input.deviceMetadata,
        })
        .onConflictDoUpdate({
          target: [checkins.activityId, checkins.participantId, checkins.sessionId],
          set: { id: sql`${checkins.id}` },
        })
        .returning();

      return mapCheckin(rows[0]);
    },

    async getCheckin(input: { activityId: string; participantId: string; sessionId: string }) {
      return first(
        (
          await db
            .select()
            .from(checkins)
            .where(
              and(
                eq(checkins.activityId, input.activityId),
                eq(checkins.participantId, input.participantId),
                eq(checkins.sessionId, input.sessionId),
              ),
            )
            .limit(1)
        ).map(mapCheckin),
      );
    },

    async getCheckinCount(sessionId: string) {
      const rows = await db.select({ value: count() }).from(checkins).where(eq(checkins.sessionId, sessionId));
      return rows[0]?.value ?? 0;
    },

    async recordCheckinAttempt(input: Omit<CheckinAttempt, "created_at">) {
      await db.insert(checkinAttempts).values({
        id: input.id,
        activityId: input.activity_id,
        sessionId: input.session_id,
        staffUserId: input.staff_user_id,
        result: input.result,
        failureCode: input.failure_code,
        metadata: input.metadata,
      });
    },

    async createAuditEvent(input: Omit<AuditEvent, "created_at">) {
      await db.insert(auditEvents).values({
        id: input.id,
        tenantId: input.tenant_id,
        activityId: input.activity_id,
        actorUserId: input.actor_user_id,
        actorAuthingUserId: input.actor_authing_user_id,
        actorScope: input.actor_scope,
        action: input.action,
        resourceType: input.resource_type,
        resourceId: input.resource_id,
        metadata: input.metadata,
      });
    },

    async getIdempotencyRecord(input: {
      commandName: string;
      resourceType: BusinessResourceType;
      resourceId?: string;
      actorAuthingUserId: string;
      idempotencyKey: string;
    }) {
      const rows = await db
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.commandName, input.commandName),
            eq(idempotencyRecords.resourceType, input.resourceType),
            input.resourceId ? eq(idempotencyRecords.resourceId, input.resourceId) : or(eq(idempotencyRecords.resourceId, ""), sql`${idempotencyRecords.resourceId} IS NULL`),
            eq(idempotencyRecords.actorAuthingUserId, input.actorAuthingUserId),
            eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);

      const row = first(rows);
      if (!row) {
        return undefined;
      }

      return {
        id: row.id,
        command_name: row.commandName,
        resource_type: row.resourceType,
        resource_id: optional(row.resourceId),
        actor_authing_user_id: optional(row.actorAuthingUserId),
        idempotency_key: row.idempotencyKey,
        request_hash: row.requestHash,
        status: row.status as IdempotencyRecord["status"],
        response: row.response,
      };
    },

    async startIdempotencyRecord(input: {
      id: string;
      tenantId?: string;
      activityId?: string;
      actorUserId?: string;
      actorAuthingUserId: string;
      commandName: string;
      resourceType: BusinessResourceType;
      resourceId?: string;
      idempotencyKey: string;
      requestHash: string;
    }) {
      await db.insert(idempotencyRecords).values({
        id: input.id,
        tenantId: input.tenantId,
        activityId: input.activityId,
        actorUserId: input.actorUserId,
        actorAuthingUserId: input.actorAuthingUserId,
        commandName: input.commandName,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        status: "started",
      });
    },

    async completeIdempotencyRecord(recordId: string, response: unknown) {
      await db
        .update(idempotencyRecords)
        .set({ status: "completed", response, completedAt: new Date() })
        .where(eq(idempotencyRecords.id, recordId));
    },

    async getRegistrationById(registrationId: string) {
      return first((await db.select().from(registrations).where(eq(registrations.id, registrationId)).limit(1)).map(mapRegistration));
    },
  };
}

export type RegistrationResult = {
  registration: Registration;
  qr_pass: QRPass;
};

export type CheckinResult = {
  checkin: Checkin;
  count: number;
};

export type TenantResolved = {
  tenant: Tenant;
};

export type DomainAuditInput = {
  action: string;
  resourceType: BusinessResourceType;
  resourceId?: string;
  tenantId?: string;
  activityId?: string;
  actor?: { user: User; authingUserId: string; scope: AuditEvent["actor_scope"] };
  metadata?: Record<string, unknown>;
};

export type CheckinAttemptFailure = {
  activityId?: string;
  sessionId?: string;
  staffUserId?: string;
  failureCode: DomainErrorCode;
  metadata?: Record<string, unknown>;
};
