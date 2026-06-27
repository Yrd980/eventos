import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  authingOrgId: text("authing_org_id").notNull().unique(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  authingUserId: text("authing_user_id").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityTemplates = pgTable(
  "activity_templates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    templateKey: text("template_key").notNull(),
    description: text("description"),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("activity_templates_tenant_key_unique").on(table.tenantId, table.templateKey)],
);

export const organizers = pgTable("organizers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  description: text("description"),
  websiteUrl: text("website_url"),
  contact: text("contact"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sponsors = pgTable("sponsors", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  description: text("description"),
  websiteUrl: text("website_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  themeName: text("theme_name"),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  venue: jsonb("venue").notNull().default({ timezone: "Asia/Shanghai" }),
  status: text("status").notNull(),
  templateId: text("template_id").references(() => activityTemplates.id),
  theme: jsonb("theme"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityOrganizers = pgTable(
  "activity_organizers",
  {
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => organizers.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.activityId, table.organizerId] })],
);

export const activityPublications = pgTable(
  "activity_publications",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    publishedByUserId: text("published_by_user_id")
      .notNull()
      .references(() => users.id),
    summary: text("summary"),
    snapshot: jsonb("snapshot").notNull(),
    etag: text("etag").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("activity_publications_activity_version_unique").on(table.activityId, table.version),
    unique("activity_publications_activity_etag_unique").on(table.activityId, table.etag),
  ],
);

export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(),
  checksum: text("checksum").notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionTracks = pgTable("session_tracks", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  name: text("name").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const speakers = pgTable("speakers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  title: text("title"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  organization: text("organization"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  trackId: text("track_id").references(() => sessionTracks.id),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  roomName: text("room_name"),
  venueArea: text("venue_area"),
  status: text("status").notNull(),
  capacity: integer("capacity"),
  requiresReservation: boolean("requires_reservation").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionSpeakers = pgTable(
  "session_speakers",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    speakerId: text("speaker_id")
      .notNull()
      .references(() => speakers.id),
    role: text("role").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    titleOverride: text("title_override"),
    bioOverride: text("bio_override"),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.speakerId] })],
);

export const participants = pgTable(
  "participants",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("participants_activity_user_unique").on(table.activityId, table.userId)],
);

export const registrationForms = pgTable("registration_forms", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  title: text("title").notNull(),
  fields: jsonb("fields").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrations = pgTable(
  "registrations",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    status: text("status").notNull(),
    source: text("source").notNull(),
    formVersionId: text("form_version_id").references(() => registrationForms.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("registrations_activity_participant_unique").on(table.activityId, table.participantId)],
);

export const registrationSubmissions = pgTable("registration_submissions", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  registrationId: text("registration_id")
    .notNull()
    .references(() => registrations.id),
  formVersionId: text("form_version_id")
    .notNull()
    .references(() => registrationForms.id),
  answers: jsonb("answers").notNull().default({}),
  projectedFields: jsonb("projected_fields"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const qrPasses = pgTable(
  "qr_passes",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    registrationId: text("registration_id")
      .notNull()
      .references(() => registrations.id),
    status: text("status").notNull(),
    tokenFingerprint: text("token_fingerprint").notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("qr_passes_active_registration_idx").on(table.registrationId).where(sql`${table.status} = 'active'`)],
);

export const myAgendaItems = pgTable(
  "my_agenda_items",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("my_agenda_items_activity_participant_session_unique").on(table.activityId, table.participantId, table.sessionId)],
);

export const checkins = pgTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    qrPassId: text("qr_pass_id")
      .notNull()
      .references(() => qrPasses.id),
    source: text("source").notNull(),
    staffUserId: text("staff_user_id").references(() => users.id),
    deviceMetadata: jsonb("device_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("checkins_activity_participant_session_unique").on(table.activityId, table.participantId, table.sessionId)],
);

export const checkinAttempts = pgTable("checkin_attempts", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").references(() => activities.id),
  sessionId: text("session_id").references(() => sessions.id),
  staffUserId: text("staff_user_id").references(() => users.id),
  result: text("result").notNull(),
  failureCode: text("failure_code"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expoBooths = pgTable("expo_booths", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  sponsorId: text("sponsor_id"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  location: text("location"),
  logoUrl: text("logo_url"),
  status: text("status").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const liveEntries = pgTable("live_entries", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  sessionId: text("session_id").references(() => sessions.id),
  title: text("title").notNull(),
  provider: text("provider").notNull(),
  url: text("url"),
  deepLink: text("deep_link"),
  accessPolicy: text("access_policy").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  status: text("status").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const surveys = pgTable("surveys", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  title: text("title").notNull(),
  description: text("description"),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  accessPolicy: text("access_policy").notNull(),
  status: text("status").notNull(),
});

export const surveyQuestions = pgTable(
  "survey_questions",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    required: boolean("required").notNull().default(false),
    options: jsonb("options"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [unique("survey_questions_survey_key_unique").on(table.surveyId, table.key)],
);

export const surveyResponses = pgTable("survey_responses", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  surveyId: text("survey_id")
    .notNull()
    .references(() => surveys.id),
  participantId: text("participant_id").references(() => participants.id),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const surveyAnswers = pgTable("survey_answers", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  responseId: text("response_id")
    .notNull()
    .references(() => surveyResponses.id),
  questionId: text("question_id")
    .notNull()
    .references(() => surveyQuestions.id),
  value: jsonb("value").notNull(),
});

export const pageConfigs = pgTable(
  "page_configs",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    pageKey: text("page_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("page_configs_activity_page_unique").on(table.activityId, table.pageKey)],
);

export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  pageConfigId: text("page_config_id")
    .notNull()
    .references(() => pageConfigs.id),
  blockKey: text("block_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  resourceRefs: jsonb("resource_refs"),
  config: jsonb("config").notNull().default({}),
  displaySnapshot: jsonb("display_snapshot"),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  channel: text("channel").notNull().default("miniapp"),
  audienceRule: jsonb("audience_rule").notNull(),
  status: text("status").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenants.id),
  activityId: text("activity_id").references(() => activities.id),
  actorUserId: text("actor_user_id").references(() => users.id),
  actorAuthingUserId: text("actor_authing_user_id"),
  actorScope: text("actor_scope"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const idempotencyRecords = pgTable("idempotency_records", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenants.id),
  activityId: text("activity_id").references(() => activities.id),
  actorUserId: text("actor_user_id").references(() => users.id),
  actorAuthingUserId: text("actor_authing_user_id"),
  commandName: text("command_name").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull(),
  response: jsonb("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const staffGrants = pgTable(
  "staff_grants",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    authingUserId: text("authing_user_id").notNull(),
    grantSource: text("grant_source").notNull().default("authing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("staff_grants_activity_user_unique").on(table.activityId, table.userId)],
);

export const operatorGrants = pgTable("operator_grants", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  authingUserId: text("authing_user_id").notNull(),
  scope: text("scope").notNull(),
  activityId: text("activity_id").references(() => activities.id),
  grantSource: text("grant_source").notNull().default("authing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
