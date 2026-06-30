import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { createAuthingVerifier } from "./auth/authing";
import { createDb } from "./db";
import { readEnv } from "./env";
import { DomainError, failure, statusForCode, success, toDomainFailure } from "./http/envelope";
import { readJsonObject, readLimit, readOptionalTenantCode, requireIdempotencyKey } from "./http/request";
import { getPublishedSnapshot, getVisibleActivity } from "./services/activity";
import { runCommand } from "./services/command";
import { requireActor } from "./services/identity";
import {
  createOperatorActivity,
  createOperatorActivityTemplate,
  createOperatorBlock,
  createOperatorExpoBooth,
  createOperatorLiveEntry,
  createOperatorNotification,
  createOperatorTenantResource,
  createOperatorSurvey,
  disableOperatorActivityGrant,
  disableOperatorStaffGrant,
  grantOperatorStaff,
  grantOperatorActivity,
  createOperatorSession,
  listOperatorActivities,
  listOperatorActivityTemplates,
  listOperatorActivityGrants,
  listOperatorNotifications,
  listOperatorRegistrationSubmissions,
  listOperatorSurveyAnswers,
  listOperatorSurveyResponses,
  listOperatorTenantResources,
  publishOperatorActivity,
  requireOperatorActivity,
  rollbackOperatorActivity,
  updateOperatorActivity,
  updateOperatorActivityTemplate,
  updateOperatorExpoBooth,
  updateOperatorLiveEntry,
  updateOperatorNotification,
  updateOperatorSession,
  updateOperatorSurvey,
  updateOperatorTenantResource,
  upsertOperatorActivityOrganizer,
  upsertOperatorRegistrationForm,
  upsertOperatorSessionSpeaker,
  upsertOperatorSurveyQuestion,
  upsertOperatorPageConfig,
} from "./services/operator";
import {
  addBoothToMyBooths,
  addSessionToMyAgenda,
  checkinBooth,
  checkinParticipant,
  getParticipantCenterState,
  getParticipantExpoState,
  listBoothCheckinsForActor,
  getQRPassForActor,
  getCurrentRegistrationForm,
  getRegistrationForActor,
  getVisibleSurvey,
  listMyBoothsForActor,
  listMyAgendaForActor,
  listLiveEntriesForActivity,
  listNotificationsForParticipant,
  listSurveyQuestionsForParticipant,
  listSurveysForActivity,
  registerForActivity,
  removeBoothFromMyBooths,
  removeSessionFromMyAgenda,
  submitRegistrationForm,
  submitSurveyResponse,
} from "./services/participation";
import { createRedisRealtimePublisher } from "./services/realtime";
import { createRepository } from "./services/repository";
import { getWechatConfig } from "./wechat";

const env = readEnv();
const database = createDb(env);
const verifier = createAuthingVerifier(env);
const realtime = createRedisRealtimePublisher(env);
const app = new Hono();
const fixedCmsOrigins = new Set(["http://127.0.0.1:5174", "http://localhost:5174"]);
const devCmsOriginPattern = /^http:\/\/(127\.0\.0\.1|localhost):51\d{2}$/;

function cmsCorsOrigin(origin: string) {
  if (fixedCmsOrigins.has(origin)) return origin;
  if (env.nodeEnv === "development" && devCmsOriginPattern.test(origin)) return origin;
  return undefined;
}

app.use(
  "*",
  cors({
    origin: cmsCorsOrigin,
    allowHeaders: ["content-type", "authorization", "idempotency-key"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

const checkinCommandBodySchema = z.object({
  session_id: z.string().min(1),
  qr_token: z.string().min(1),
  device_metadata: z.record(z.string(), z.unknown()).optional(),
});

const answersBodySchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

const boothCheckinBodySchema = z.object({
  device_metadata: z.record(z.string(), z.unknown()).optional(),
});

const activityOrganizerBodySchema = z.object({
  organizer_id: z.string().min(1),
  sort_order: z.number().int().min(0).default(0),
});

const activityTemplateConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((config) => !["sessions", "speakers", "organizers", "sponsors", "expo_booths", "booth_collections", "booth_checkins", "live_entries", "surveys", "registration_forms", "notifications"].some((key) => key in config), {
    message: "Activity Template config must not contain business facts",
  });

const activityTemplateCreateBodySchema = z.object({
  name: z.string().min(1),
  template_key: z.string().min(1),
  description: z.string().min(1).optional(),
  config: activityTemplateConfigSchema.default({}),
});

const activityTemplateUpdateBodySchema = activityTemplateCreateBodySchema
  .extend({
    description: z.string().min(1).nullable().optional(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

const sessionSpeakerBodySchema = z.object({
  speaker_id: z.string().min(1),
  role: z.enum(["host", "speaker", "panelist", "guest"]).default("speaker"),
  sort_order: z.number().int().min(0).default(0),
  title_override: z.string().min(1).optional(),
  bio_override: z.string().min(1).optional(),
});

const expoBoothCreateBodySchema = z.object({
  sponsor_id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  logo_url: z.string().min(1).optional(),
  status: z.enum(["visible", "hidden"]).default("visible"),
  sort_order: z.number().int().min(0).default(0),
});

const expoBoothUpdateBodySchema = expoBoothCreateBodySchema
  .extend({
    sponsor_id: z.string().min(1).nullable().optional(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

const nullableStringSchema = z.string().min(1).nullable().optional();

const liveEntryCreateBodySchema = z.object({
  session_id: z.string().min(1).optional(),
  title: z.string().min(1),
  provider: z.enum(["external_link", "miniapp_page", "embedded", "other"]),
  url: z.string().min(1).optional(),
  deep_link: z.string().min(1).optional(),
  access_policy: z.enum(["public", "confirmed_registration"]).default("public"),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  status: z.enum(["draft", "scheduled", "live", "ended", "hidden"]).default("draft"),
  sort_order: z.number().int().min(0).default(0),
});

const liveEntryUpdateBodySchema = liveEntryCreateBodySchema
  .extend({
    session_id: z.string().min(1).nullable().optional(),
    url: nullableStringSchema,
    deep_link: nullableStringSchema,
    start_time: z.string().datetime().nullable().optional(),
    end_time: z.string().datetime().nullable().optional(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

const registrationFormFieldSchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["text", "phone", "email", "select", "multi_select", "boolean"]),
    required: z.boolean().default(false),
    options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
  })
  .refine((field) => (field.type === "select" || field.type === "multi_select" ? Boolean(field.options?.length) : true), {
    message: "options are required for select fields",
    path: ["options"],
  });

const registrationFormBodySchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  fields: z.array(registrationFormFieldSchema).default([]),
});

const surveyCreateBodySchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    target_type: z.enum(["activity", "session", "expo_booth", "live_entry"]).default("activity"),
    target_id: z.string().min(1).optional(),
    access_policy: z.enum(["public", "confirmed_registration"]).default("confirmed_registration"),
    status: z.enum(["draft", "published", "closed"]).default("draft"),
  })
  .refine((body) => (body.target_type === "activity" ? body.target_id === undefined : body.target_id !== undefined), {
    message: "target_id must match target_type",
    path: ["target_id"],
  });

const surveyUpdateBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    description: nullableStringSchema,
    target_type: z.enum(["activity", "session", "expo_booth", "live_entry"]).optional(),
    target_id: nullableStringSchema,
    access_policy: z.enum(["public", "confirmed_registration"]).optional(),
    status: z.enum(["draft", "published", "closed"]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  })
  .refine((body) => (body.target_type === "activity" ? body.target_id === undefined || body.target_id === null : true), {
    message: "Activity-targeted Survey must not include target_id",
    path: ["target_id"],
  });

const surveyQuestionBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["text", "single_choice", "multiple_choice", "rating", "boolean"]),
    required: z.boolean().default(false),
    options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
    sort_order: z.number().int().min(0).default(0),
  })
  .refine((question) => (question.type === "single_choice" || question.type === "multiple_choice" ? Boolean(question.options?.length) : true), {
    message: "options are required for choice questions",
    path: ["options"],
  });

const notificationAudienceRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all_confirmed_participants") }),
  z.object({ type: z.literal("participants_with_session_in_my_agenda"), session_id: z.string().min(1) }),
  z.object({ type: z.literal("staff") }),
  z.object({ type: z.literal("custom_segment"), segment_id: z.string().min(1) }),
]);

const notificationBodyBaseSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  channel: z.enum(["miniapp", "sms", "email", "wechat"]).default("miniapp"),
  audience_rule: notificationAudienceRuleSchema,
  status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).default("draft"),
  scheduled_at: z.string().datetime().optional(),
});

const notificationCreateBodySchema = notificationBodyBaseSchema
  .refine((body) => (body.status === "scheduled" ? Boolean(body.scheduled_at) : true), {
    message: "scheduled_at is required when status is scheduled",
    path: ["scheduled_at"],
  });

const notificationUpdateBodySchema = notificationBodyBaseSchema
  .extend({
    scheduled_at: z.string().datetime().nullable().optional(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

function parseJsonBody<T>(schema: z.ZodType<T>, body: Record<string, unknown>) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", "Request body failed validation", {
      status: 422,
      details: { issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    });
  }

  return result.data;
}

type SortableRow = { id: string } & Record<string, unknown>;

function readOperatorListQuery<TSortKey extends string>(
  raw: { limit?: string; cursor?: string; sortKey?: string; sortDirection?: string },
  allowedSortKeys: readonly TSortKey[],
  defaultSortKey: TSortKey,
) {
  const sortKey = raw.sortKey === undefined ? defaultSortKey : raw.sortKey;
  if (!allowedSortKeys.includes(sortKey as TSortKey)) {
    throw new DomainError("VALIDATION_FAILED", "sort_key is invalid for this endpoint", { status: 422, details: { sort_key: raw.sortKey, allowed_sort_keys: allowedSortKeys } });
  }

  if (raw.sortDirection !== undefined && raw.sortDirection !== "asc" && raw.sortDirection !== "desc") {
    throw new DomainError("VALIDATION_FAILED", "sort_direction must be asc or desc", { status: 422 });
  }
  const sortDirection: "asc" | "desc" = raw.sortDirection ?? "desc";

  return {
    limit: readLimit(raw.limit),
    cursor: raw.cursor,
    sort: { key: sortKey as TSortKey, direction: sortDirection },
  };
}

function compareSortableValue(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function operatorListPage<TRow extends SortableRow, TSortKey extends string>(input: {
  rows: TRow[];
  limit: number;
  cursor?: string;
  sort: { key: TSortKey; direction: "asc" | "desc" };
}) {
  const sorted = [...input.rows].sort((left, right) => {
    const value = compareSortableValue(left[input.sort.key], right[input.sort.key]);
    if (value !== 0) return input.sort.direction === "asc" ? value : -value;
    return left.id.localeCompare(right.id);
  });
  const start = input.cursor ? sorted.findIndex((row) => row.id === input.cursor) + 1 : 0;
  const safeStart = start > 0 ? start : 0;
  const page = sorted.slice(safeStart, safeStart + input.limit);
  const hasMore = sorted.length > safeStart + input.limit;
  return { page, hasMore, nextCursor: hasMore ? page.at(-1)?.id : undefined };
}

function operatorListMeta(input: {
  limit: number;
  cursor?: string;
  hasMore: boolean;
  nextCursor?: string;
  sort: { key: string; direction: "asc" | "desc"; allowedKeys: readonly string[] };
  filters?: Record<string, unknown>;
}) {
  return {
    limit: input.limit,
    cursor: input.cursor,
    has_more: input.hasMore,
    next_cursor: input.nextCursor,
    sort: {
      key: input.sort.key,
      direction: input.sort.direction,
      allowed_keys: input.sort.allowedKeys,
    },
    filters: input.filters ?? {},
  };
}

function operatorListResponse<TRow extends SortableRow, TSortKey extends string>(
  c: Parameters<typeof readOperatorListQuery<TSortKey>>[0],
  rows: TRow[],
  input: { allowedSortKeys: readonly TSortKey[]; defaultSortKey: TSortKey; filters?: Record<string, unknown> },
) {
  const query = readOperatorListQuery(c, input.allowedSortKeys, input.defaultSortKey);
  const page = operatorListPage({ rows, limit: query.limit, cursor: query.cursor, sort: query.sort });
  return success(
    page.page,
    operatorListMeta({
      limit: query.limit,
      cursor: query.cursor,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      sort: { key: query.sort.key, direction: query.sort.direction, allowedKeys: input.allowedSortKeys },
      filters: input.filters,
    }),
  );
}

async function withRepo<T>(callback: (repo: ReturnType<typeof createRepository>) => Promise<T>) {
  return callback(createRepository(database.db));
}

async function withTransaction<T>(callback: (repo: ReturnType<typeof createRepository>) => Promise<T>) {
  return database.transaction(async (tx) => callback(createRepository(tx)));
}

async function actorFromRequest(repo: ReturnType<typeof createRepository>, authorizationHeader: string | undefined) {
  return requireActor({
    repo,
    verifier,
    authorizationHeader,
  });
}

async function optionalActorFromRequest(repo: ReturnType<typeof createRepository>, authorizationHeader: string | undefined) {
  return authorizationHeader ? actorFromRequest(repo, authorizationHeader) : undefined;
}

app.onError((error, c) => {
  const domainFailure = toDomainFailure(error);
  return c.json(failure(domainFailure), (domainFailure.status ?? statusForCode(domainFailure.code)) as ContentfulStatusCode);
});

app.get("/health", (c) => c.json(success({ ok: true, service: "api" })));

app.get("/", (c) => c.json(success({ name: "Event OS API" })));

app.get("/config/wechat", (c) => {
  const wechat = getWechatConfig();

  return c.json(
    success({
      hasAppId: Boolean(wechat.appId),
      hasAppSecret: Boolean(wechat.appSecret),
      qrHmacSecretConfigured: Boolean(wechat.qrHmacSecret),
    }),
  );
});

app.get("/activities", async (c) =>
  withRepo(async (repo) => {
    const limit = readLimit(c.req.query("limit"));
    const rows = await repo.listActivities({
      tenantCode: readOptionalTenantCode(c),
      limit,
      cursor: c.req.query("cursor"),
    });
    const page = rows.slice(0, limit);
    const next = rows.length > limit ? page.at(-1)?.start_time : undefined;

    return c.json(success(page, { limit, has_more: rows.length > limit, next_cursor: next }));
  }),
);

app.get("/operator/activities", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const limit = readLimit(c.req.query("limit"));
    const { rows, tenant } = await listOperatorActivities({
      repo,
      actor,
      limit,
      cursor: c.req.query("cursor"),
    });
    const page = rows.slice(0, limit);
    const next = rows.length > limit ? page.at(-1)?.start_time : undefined;
    return c.json(success(page, { limit, has_more: rows.length > limit, next_cursor: next, tenant_id: tenant.id }));
  }),
);

app.get("/operator/activity-templates", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const rows = await listOperatorActivityTemplates({ repo, actor });
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at", "name"], defaultSortKey: "created_at" }));
  }),
);

app.post("/operator/activity-templates", async (c) =>
  withTransaction(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(activityTemplateCreateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.activity_template.create",
      resourceType: "activity_template",
      resourceId: body.template_key,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: body,
      execute: () => createOperatorActivityTemplate({ repo, actor, body }),
    });
    return c.json(success(result));
  }),
);

app.patch("/operator/activity-templates/:templateId", async (c) =>
  withTransaction(async (repo) => {
    const templateId = c.req.param("templateId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(activityTemplateUpdateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.activity_template.update",
      resourceType: "activity_template",
      resourceId: templateId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { templateId, body },
      execute: () => updateOperatorActivityTemplate({ repo, actor, templateId, body }),
    });
    return c.json(success(result));
  }),
);

function operatorTenantResourceRoutes(resourceType: "organizer" | "sponsor" | "speaker", path: string) {
  app.get(path, async (c) =>
    withRepo(async (repo) => {
      const actor = await actorFromRequest(repo, c.req.header("authorization"));
      const rows = await listOperatorTenantResources({ repo, actor, resourceType });
      return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at", "name"], defaultSortKey: "name" }));
    }),
  );

  app.post(path, async (c) =>
    withTransaction(async (repo) => {
      const actor = await actorFromRequest(repo, c.req.header("authorization"));
      const body = await readJsonObject(c);
      const result = await runCommand({
        repo,
        commandName: `operator.${resourceType}.create`,
        resourceType,
        actorUserId: actor.user.id,
        actorAuthingUserId: actor.principal.authing_user_id,
        idempotencyKey: requireIdempotencyKey(c),
        request: body,
        execute: () => createOperatorTenantResource({ repo, actor, resourceType, body }),
      });
      return c.json(success(result));
    }),
  );

  app.patch(`${path}/:resourceId`, async (c) =>
    withTransaction(async (repo) => {
      const resourceId = c.req.param("resourceId");
      const actor = await actorFromRequest(repo, c.req.header("authorization"));
      const body = await readJsonObject(c);
      const result = await runCommand({
        repo,
        commandName: `operator.${resourceType}.update`,
        resourceType,
        resourceId,
        actorUserId: actor.user.id,
        actorAuthingUserId: actor.principal.authing_user_id,
        idempotencyKey: requireIdempotencyKey(c),
        request: { resourceId, body },
        execute: () => updateOperatorTenantResource({ repo, actor, resourceType, resourceId, body }),
      });
      return c.json(success(result));
    }),
  );
}

operatorTenantResourceRoutes("organizer", "/operator/organizers");
operatorTenantResourceRoutes("sponsor", "/operator/sponsors");
operatorTenantResourceRoutes("speaker", "/operator/speakers");

app.post("/operator/activities", async (c) =>
  withTransaction(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.activity.create",
      resourceType: "activity",
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: body,
      execute: () => createOperatorActivity({ repo, actor, body }),
    });
    return c.json(success(result));
  }),
);

app.patch("/operator/activities/:activityId", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.activity.update",
      resourceType: "activity",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => updateOperatorActivity({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const { activity } = await requireOperatorActivity({ repo, actor, activityId });
    return c.json(success(activity));
  }),
);

app.get("/operator/activities/:activityId/sessions", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    const rows = await repo.listOperatorSessions(activityId);
    return c.json(
      operatorListResponse(c.req.query(), rows, {
        allowedSortKeys: ["start_time", "sort_order", "created_at"],
        defaultSortKey: "start_time",
        filters: { activity_id: activityId },
      }),
    );
  }),
);

app.get("/operator/activities/:activityId/organizers", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    return c.json(success(await repo.listActivityOrganizers(activityId)));
  }),
);

app.post("/operator/activities/:activityId/organizers", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(activityOrganizerBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.activity_organizer.upsert",
      resourceType: "organizer",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => upsertOperatorActivityOrganizer({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/expo-booths", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    const rows = await repo.listOperatorExpoBooths(activityId);
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at", "name"], defaultSortKey: "name", filters: { activity_id: activityId } }));
  }),
);

app.post("/operator/activities/:activityId/expo-booths", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(expoBoothCreateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.expo_booth.create",
      resourceType: "expo_booth",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => createOperatorExpoBooth({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.patch("/operator/expo-booths/:expoBoothId", async (c) =>
  withTransaction(async (repo) => {
    const expoBoothId = c.req.param("expoBoothId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(expoBoothUpdateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.expo_booth.update",
      resourceType: "expo_booth",
      resourceId: expoBoothId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { expoBoothId, body },
      execute: () => updateOperatorExpoBooth({ repo, actor, expoBoothId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/live-entries", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    const rows = await repo.listOperatorLiveEntries(activityId).then((entries) => entries.map((entry) => ({ ...entry, name: entry.title })));
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at", "name"], defaultSortKey: "name", filters: { activity_id: activityId } }));
  }),
);

app.post("/operator/activities/:activityId/live-entries", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(liveEntryCreateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.live_entry.create",
      resourceType: "live_entry",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => createOperatorLiveEntry({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.patch("/operator/live-entries/:liveEntryId", async (c) =>
  withTransaction(async (repo) => {
    const liveEntryId = c.req.param("liveEntryId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(liveEntryUpdateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.live_entry.update",
      resourceType: "live_entry",
      resourceId: liveEntryId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { liveEntryId, body },
      execute: () => updateOperatorLiveEntry({ repo, actor, liveEntryId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/registration-forms", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    return c.json(success(await repo.listRegistrationForms(activityId)));
  }),
);

app.put("/operator/activities/:activityId/registration-forms", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(registrationFormBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.registration_form.upsert",
      resourceType: "registration_form",
      resourceId: body.id ?? activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => upsertOperatorRegistrationForm({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.post("/operator/activities/:activityId/registration-forms", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(registrationFormBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.registration_form.upsert",
      resourceType: "registration_form",
      resourceId: body.id ?? activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => upsertOperatorRegistrationForm({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/registration-submissions", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const rows = await listOperatorRegistrationSubmissions({ repo, actor, activityId });
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at"], defaultSortKey: "created_at", filters: { activity_id: activityId } }));
  }),
);

app.get("/operator/activities/:activityId/surveys", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    const rows = (await repo.listSurveys(activityId)).map((survey) => ({ ...survey, name: survey.title }));
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at", "name"], defaultSortKey: "name", filters: { activity_id: activityId } }));
  }),
);

app.get("/operator/activities/:activityId/survey-responses", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const surveyId = c.req.query("survey_id");
    const rows = (await listOperatorSurveyResponses({ repo, actor, activityId, surveyId })).map((response) => ({ ...response, created_at: response.submitted_at }));
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at"], defaultSortKey: "created_at", filters: { activity_id: activityId, survey_id: surveyId } }));
  }),
);

app.get("/operator/survey-responses/:responseId/answers", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listOperatorSurveyAnswers({ repo, actor, responseId: c.req.param("responseId") })));
  }),
);

app.post("/operator/activities/:activityId/surveys", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(surveyCreateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.survey.create",
      resourceType: "survey",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => createOperatorSurvey({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.patch("/operator/surveys/:surveyId", async (c) =>
  withTransaction(async (repo) => {
    const surveyId = c.req.param("surveyId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(surveyUpdateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.survey.update",
      resourceType: "survey",
      resourceId: surveyId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { surveyId, body },
      execute: () => updateOperatorSurvey({ repo, actor, surveyId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/surveys/:surveyId/questions", async (c) =>
  withRepo(async (repo) => {
    const surveyId = c.req.param("surveyId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const survey = await repo.getSurvey(surveyId);
    if (!survey) {
      throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
    }
    await requireOperatorActivity({ repo, actor, activityId: survey.activity_id });
    return c.json(success(await repo.listSurveyQuestions(surveyId)));
  }),
);

app.post("/operator/surveys/:surveyId/questions", async (c) =>
  withTransaction(async (repo) => {
    const surveyId = c.req.param("surveyId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(surveyQuestionBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.survey_question.upsert",
      resourceType: "survey",
      resourceId: surveyId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { surveyId, body },
      execute: () => upsertOperatorSurveyQuestion({ repo, actor, surveyId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/notifications", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const rows = (await listOperatorNotifications({ repo, actor, activityId })).map((notification) => ({ ...notification, name: notification.title }));
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at", "name"], defaultSortKey: "created_at", filters: { activity_id: activityId } }));
  }),
);

app.post("/operator/activities/:activityId/notifications", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(notificationCreateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.notification.create",
      resourceType: "notification",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => createOperatorNotification({ repo, actor, activityId, body }),
    });

    return c.json(success(result));
  }),
);

app.patch("/operator/notifications/:notificationId", async (c) =>
  withTransaction(async (repo) => {
    const notificationId = c.req.param("notificationId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(notificationUpdateBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.notification.update",
      resourceType: "notification",
      resourceId: notificationId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { notificationId, body },
      execute: () => updateOperatorNotification({ repo, actor, notificationId, body }),
    });

    return c.json(success(result));
  }),
);

app.post("/operator/activities/:activityId/sessions", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.session.create",
      resourceType: "session",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => createOperatorSession({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/sessions/:sessionId/speakers", async (c) =>
  withRepo(async (repo) => {
    const sessionId = c.req.param("sessionId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const session = await repo.getSession(sessionId);
    if (!session) {
      throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
    }
    await requireOperatorActivity({ repo, actor, activityId: session.activity_id });
    return c.json(success(await repo.listSessionSpeakers(sessionId)));
  }),
);

app.post("/operator/sessions/:sessionId/speakers", async (c) =>
  withTransaction(async (repo) => {
    const sessionId = c.req.param("sessionId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(sessionSpeakerBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "operator.session_speaker.upsert",
      resourceType: "speaker",
      resourceId: sessionId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { sessionId, body },
      execute: () => upsertOperatorSessionSpeaker({ repo, actor, sessionId, body }),
    });
    return c.json(success(result));
  }),
);

app.patch("/operator/sessions/:sessionId", async (c) =>
  withTransaction(async (repo) => {
    const sessionId = c.req.param("sessionId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.session.update",
      resourceType: "session",
      resourceId: sessionId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { sessionId, body },
      execute: () => updateOperatorSession({ repo, actor, sessionId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/page-configs", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    return c.json(success(await repo.listPageConfigs(activityId)));
  }),
);

app.put("/operator/activities/:activityId/page-configs", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.page_config.upsert",
      resourceType: "page_config",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => upsertOperatorPageConfig({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.post("/operator/activities/:activityId/blocks", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.block.create",
      resourceType: "block",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => createOperatorBlock({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/staff-grants", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    const rows = await repo.listStaffGrants(activityId);
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at"], defaultSortKey: "created_at", filters: { activity_id: activityId } }));
  }),
);

app.post("/operator/activities/:activityId/staff-grants", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.staff_grant.upsert",
      resourceType: "staff_grant",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => grantOperatorStaff({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.post("/operator/staff-grants/:staffGrantId/disable", async (c) =>
  withTransaction(async (repo) => {
    const staffGrantId = c.req.param("staffGrantId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const result = await runCommand({
      repo,
      commandName: "operator.staff_grant.disable",
      resourceType: "staff_grant",
      resourceId: staffGrantId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { staffGrantId },
      execute: () => disableOperatorStaffGrant({ repo, actor, staffGrantId }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/operator-grants", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const rows = await listOperatorActivityGrants({ repo, actor, activityId });
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at"], defaultSortKey: "created_at", filters: { activity_id: activityId } }));
  }),
);

app.post("/operator/activities/:activityId/operator-grants", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const result = await runCommand({
      repo,
      commandName: "operator.operator_grant.upsert",
      resourceType: "operator_grant",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => grantOperatorActivity({ repo, actor, activityId, body }),
    });
    return c.json(success(result));
  }),
);

app.post("/operator/operator-grants/:operatorGrantId/disable", async (c) =>
  withTransaction(async (repo) => {
    const operatorGrantId = c.req.param("operatorGrantId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const result = await runCommand({
      repo,
      commandName: "operator.operator_grant.disable",
      resourceType: "operator_grant",
      resourceId: operatorGrantId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { operatorGrantId },
      execute: () => disableOperatorActivityGrant({ repo, actor, operatorGrantId }),
    });
    return c.json(success(result));
  }),
);

app.get("/operator/activities/:activityId/publications", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    const rows = (await repo.listPublications(activityId)).map((publication) => ({ ...publication, created_at: publication.published_at }));
    return c.json(operatorListResponse(c.req.query(), rows, { allowedSortKeys: ["created_at"], defaultSortKey: "created_at", filters: { activity_id: activityId } }));
  }),
);

app.post("/operator/activities/:activityId/publish", async (c) => {
  const publication = await withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body: Record<string, unknown> = await readJsonObject(c).catch(() => ({}));
    return runCommand({
      repo,
      commandName: "operator.activity.publish",
      resourceType: "activity_publication",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () =>
        publishOperatorActivity({
          repo,
          actor,
          activityId,
          summary: typeof body.summary === "string" ? body.summary : undefined,
        }),
    });
  });

  await realtime.publish({
    name: "activity.publication_updated",
    activity_id: publication.activity_id,
    publication_id: publication.id,
    version: publication.version,
    etag: publication.etag,
    occurred_at: new Date().toISOString(),
  });

  return c.json(success(publication));
});

app.post("/operator/activities/:activityId/rollback", async (c) => {
  const publication = await withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c);
    const version = typeof body.version === "number" ? body.version : undefined;
    if (!version) {
      throw new DomainError("VALIDATION_FAILED", "version is required", { status: 422 });
    }

    return runCommand({
      repo,
      commandName: "operator.activity.rollback",
      resourceType: "activity_publication",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () =>
        rollbackOperatorActivity({
          repo,
          actor,
          activityId,
          version,
          summary: typeof body.summary === "string" ? body.summary : undefined,
        }),
    });
  });

  await realtime.publish({
    name: "activity.publication_updated",
    activity_id: publication.activity_id,
    publication_id: publication.id,
    version: publication.version,
    etag: publication.etag,
    occurred_at: new Date().toISOString(),
  });

  return c.json(success(publication));
});

app.get("/activities/:activityId", async (c) =>
  withRepo(async (repo) => {
    const activity = await getVisibleActivity(repo, c.req.param("activityId"));
    return c.json(success(activity));
  }),
);

app.get("/activities/:activityId/publication", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    await getVisibleActivity(repo, activityId);
    return c.json(success(await getPublishedSnapshot(repo, activityId)));
  }),
);

app.get("/activities/:activityId/sessions", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    await getVisibleActivity(repo, activityId);
    return c.json(success(await repo.listSessions(activityId)));
  }),
);

app.get("/activities/:activityId/speakers", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    await getVisibleActivity(repo, activityId);
    return c.json(success(await repo.listActivitySessionLinkedSpeakers(activityId)));
  }),
);

app.get("/sessions/:sessionId/speakers", async (c) =>
  withRepo(async (repo) => {
    const sessionId = c.req.param("sessionId");
    const session = await repo.getSession(sessionId);
    if (!session) {
      throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
    }
    await getVisibleActivity(repo, session.activity_id);
    return c.json(success(await repo.listSessionSpeakers(sessionId)));
  }),
);

app.get("/activities/:activityId/referral-count", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    await getVisibleActivity(repo, activityId);
    return c.json(success({ referral_count: 0 }));
  }),
);

app.get("/activities/:activityId/expo-booths", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    await getVisibleActivity(repo, activityId);
    return c.json(success(await repo.listExpoBooths(activityId)));
  }),
);

app.get("/activities/:activityId/participant-expo", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await optionalActorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await getParticipantExpoState({ repo, activityId, actor })));
  }),
);

app.get("/activities/:activityId/my-booths", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listMyBoothsForActor({ repo, activityId: c.req.param("activityId"), actor })));
  }),
);

app.get("/activities/:activityId/booth-checkins", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listBoothCheckinsForActor({ repo, activityId: c.req.param("activityId"), actor })));
  }),
);

app.get("/activities/:activityId/live-entries", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await optionalActorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listLiveEntriesForActivity({ repo, activityId, actor })));
  }),
);

app.get("/activities/:activityId/registration-form", async (c) =>
  withRepo(async (repo) => c.json(success(await getCurrentRegistrationForm({ repo, activityId: c.req.param("activityId") })))),
);

app.get("/activities/:activityId/registration-forms/current", async (c) =>
  withRepo(async (repo) => c.json(success(await getCurrentRegistrationForm({ repo, activityId: c.req.param("activityId") })))),
);

app.post("/activities/:activityId/registration-submissions", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(answersBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "registration_form.submit",
      resourceType: "registration_form",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => submitRegistrationForm({ repo, activityId, actor, answers: body.answers }),
    });

    return c.json(success(result));
  }),
);

app.get("/activities/:activityId/surveys", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await optionalActorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listSurveysForActivity({ repo, activityId, actor })));
  }),
);

app.get("/activities/:activityId/notifications", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await optionalActorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listNotificationsForParticipant({ repo, activityId, actor })));
  }),
);

app.get("/surveys/:surveyId", async (c) =>
  withRepo(async (repo) => {
    const actor = await optionalActorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await getVisibleSurvey({ repo, surveyId: c.req.param("surveyId"), actor })));
  }),
);

app.get("/surveys/:surveyId/questions", async (c) =>
  withRepo(async (repo) => {
    const actor = await optionalActorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listSurveyQuestionsForParticipant({ repo, surveyId: c.req.param("surveyId"), actor })));
  }),
);

app.post("/surveys/:surveyId/responses", async (c) =>
  withTransaction(async (repo) => {
    const surveyId = c.req.param("surveyId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(answersBodySchema, await readJsonObject(c));
    const result = await runCommand({
      repo,
      commandName: "survey_response.submit",
      resourceType: "survey",
      resourceId: surveyId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { surveyId, body },
      execute: () => submitSurveyResponse({ repo, surveyId, actor, answers: body.answers }),
    });

    return c.json(success(result));
  }),
);

app.get("/sessions/:sessionId", async (c) =>
  withRepo(async (repo) => {
    const session = await repo.getSession(c.req.param("sessionId"));
    if (!session) {
      throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
    }
    await getVisibleActivity(repo, session.activity_id);
    return c.json(success(session));
  }),
);

app.post("/activities/:activityId/registration", async (c) =>
  withTransaction(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = await readJsonObject(c).catch(() => ({}));

    const result = await runCommand({
      repo,
      commandName: "registration.create",
      resourceType: "registration",
      resourceId: activityId,
      activityId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { activityId, body },
      execute: () => registerForActivity({ repo, activityId, actor, qrSecret: env.qrHmacSecret }),
    });

    return c.json(success(result));
  }),
);

app.get("/activities/:activityId/registration", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await getRegistrationForActor({ repo, activityId: c.req.param("activityId"), actor })));
  }),
);

app.get("/activities/:activityId/qr-pass", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await getQRPassForActor({ repo, activityId: c.req.param("activityId"), actor, qrSecret: env.qrHmacSecret })));
  }),
);

app.get("/activities/:activityId/participant-center", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await getParticipantCenterState({ repo, activityId, actor, qrSecret: env.qrHmacSecret })));
  }),
);

app.post("/sessions/:sessionId/my-agenda", async (c) =>
  withTransaction(async (repo) => {
    const sessionId = c.req.param("sessionId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const result = await runCommand({
      repo,
      commandName: "my_agenda.add",
      resourceType: "my_agenda_item",
      resourceId: sessionId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { sessionId },
      execute: () => addSessionToMyAgenda({ repo, sessionId, actor }),
    });

    return c.json(success(result));
  }),
);

app.delete("/sessions/:sessionId/my-agenda", async (c) =>
  withTransaction(async (repo) => {
    const sessionId = c.req.param("sessionId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const result = await runCommand({
      repo,
      commandName: "my_agenda.remove",
      resourceType: "my_agenda_item",
      resourceId: sessionId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { sessionId },
      execute: () => removeSessionFromMyAgenda({ repo, sessionId, actor }),
    });

    return c.json(success(result));
  }),
);

app.get("/activities/:activityId/my-agenda", async (c) =>
  withRepo(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    return c.json(success(await listMyAgendaForActor({ repo, activityId: c.req.param("activityId"), actor })));
  }),
);

app.post("/expo-booths/:expoBoothId/my-booths", async (c) =>
  withTransaction(async (repo) => {
    const expoBoothId = c.req.param("expoBoothId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const result = await runCommand({
      repo,
      commandName: "booth_collection.add",
      resourceType: "booth_collection",
      resourceId: expoBoothId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { expoBoothId },
      execute: () => addBoothToMyBooths({ repo, expoBoothId, actor }),
    });

    return c.json(success(result));
  }),
);

app.delete("/expo-booths/:expoBoothId/my-booths", async (c) =>
  withTransaction(async (repo) => {
    const expoBoothId = c.req.param("expoBoothId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const result = await runCommand({
      repo,
      commandName: "booth_collection.remove",
      resourceType: "booth_collection",
      resourceId: expoBoothId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { expoBoothId },
      execute: () => removeBoothFromMyBooths({ repo, expoBoothId, actor }),
    });

    return c.json(success(result));
  }),
);

app.post("/expo-booths/:expoBoothId/checkin", async (c) =>
  withTransaction(async (repo) => {
    const expoBoothId = c.req.param("expoBoothId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(boothCheckinBodySchema, await readJsonObject(c).catch(() => ({})));
    const result = await runCommand({
      repo,
      commandName: "booth_checkin.create",
      resourceType: "booth_checkin",
      resourceId: expoBoothId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { expoBoothId, body },
      execute: () => checkinBooth({ repo, expoBoothId, actor, deviceMetadata: body.device_metadata }),
    });

    return c.json(success(result));
  }),
);

app.post("/checkin", async (c) => {
  const result = await withTransaction(async (repo) => {
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    const body = parseJsonBody(checkinCommandBodySchema, await readJsonObject(c));

    return runCommand({
      repo,
      commandName: "checkin.create",
      resourceType: "checkin",
      resourceId: body.session_id,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: body,
      execute: () =>
        checkinParticipant({
          repo,
          sessionId: body.session_id,
          qrToken: body.qr_token,
          actor,
          qrSecret: env.qrHmacSecret,
          deviceMetadata: body.device_metadata,
        }),
    });
  });

  await realtime.publish({
    name: "session.checkin_count_updated",
    activity_id: result.checkin.activity_id,
    session_id: result.checkin.session_id,
    count: result.count,
    occurred_at: new Date().toISOString(),
  });

  return c.json(success(result));
});

app.get("/sessions/:sessionId/checkin-count", async (c) =>
  withRepo(async (repo) => {
    const session = await repo.getSession(c.req.param("sessionId"));
    if (!session) {
      throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
    }

    await getVisibleActivity(repo, session.activity_id);
    return c.json(success({ session_id: session.id, count: await repo.getCheckinCount(session.id) }));
  }),
);

export default {
  port: env.port,
  fetch: app.fetch,
};
