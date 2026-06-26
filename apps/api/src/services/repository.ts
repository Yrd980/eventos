import type {
  Activity,
  ActivityPublication,
  AuditEvent,
  BusinessResourceType,
  Checkin,
  CheckinAttempt,
  DomainErrorCode,
  MyAgendaItem,
  QRPass,
  Registration,
  Session,
  Tenant,
  User,
} from "@eventos/contracts";
import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { DbSession } from "../db";
import {
  activities,
  activityPublications,
  auditEvents,
  checkinAttempts,
  checkins,
  idempotencyRecords,
  myAgendaItems,
  participants,
  qrPasses,
  registrations,
  sessions,
  staffGrants,
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

    async getActivity(activityId: string) {
      return first((await db.select().from(activities).where(eq(activities.id, activityId)).limit(1)).map(mapActivity));
    },

    async getTenantById(tenantId: string) {
      return first((await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)).map(mapTenant));
    },

    async getTenantByAuthingOrgId(authingOrgId: string) {
      return first((await db.select().from(tenants).where(eq(tenants.authingOrgId, authingOrgId)).limit(1)).map(mapTenant));
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

    async getSession(sessionId: string) {
      return first((await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)).map(mapSession));
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
