import { Hono } from "hono";
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
  createOperatorBlock,
  createOperatorTenantResource,
  grantOperatorStaff,
  createOperatorSession,
  listOperatorActivities,
  listOperatorTenantResources,
  publishOperatorActivity,
  requireOperatorActivity,
  rollbackOperatorActivity,
  updateOperatorActivity,
  updateOperatorSession,
  updateOperatorTenantResource,
  upsertOperatorActivityOrganizer,
  upsertOperatorSessionSpeaker,
  upsertOperatorPageConfig,
} from "./services/operator";
import {
  addSessionToMyAgenda,
  checkinParticipant,
  getQRPassForActor,
  getRegistrationForActor,
  listMyAgendaForActor,
  registerForActivity,
  removeSessionFromMyAgenda,
} from "./services/participation";
import { createRedisRealtimePublisher } from "./services/realtime";
import { createRepository } from "./services/repository";
import { getWechatConfig } from "./wechat";

const env = readEnv();
const database = createDb(env);
const verifier = createAuthingVerifier(env);
const realtime = createRedisRealtimePublisher(env);
const app = new Hono();

const checkinCommandBodySchema = z.object({
  session_id: z.string().min(1),
  qr_token: z.string().min(1),
  device_metadata: z.record(z.string(), z.unknown()).optional(),
});

const activityOrganizerBodySchema = z.object({
  organizer_id: z.string().min(1),
  sort_order: z.number().int().min(0).default(0),
});

const sessionSpeakerBodySchema = z.object({
  speaker_id: z.string().min(1),
  role: z.enum(["host", "speaker", "panelist", "guest"]).default("speaker"),
  sort_order: z.number().int().min(0).default(0),
  title_override: z.string().min(1).optional(),
  bio_override: z.string().min(1).optional(),
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

function operatorTenantResourceRoutes(resourceType: "organizer" | "sponsor" | "speaker", path: string) {
  app.get(path, async (c) =>
    withRepo(async (repo) => {
      const actor = await actorFromRequest(repo, c.req.header("authorization"));
      return c.json(success(await listOperatorTenantResources({ repo, actor, resourceType })));
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
    return c.json(success(await repo.listOperatorSessions(activityId)));
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
    return c.json(success(await repo.listStaffGrants(activityId)));
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

app.get("/operator/activities/:activityId/publications", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    const actor = await actorFromRequest(repo, c.req.header("authorization"));
    await requireOperatorActivity({ repo, actor, activityId });
    return c.json(success(await repo.listPublications(activityId)));
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

app.get("/activities/:activityId/expo-booths", async (c) =>
  withRepo(async (repo) => {
    const activityId = c.req.param("activityId");
    await getVisibleActivity(repo, activityId);
    return c.json(success(await repo.listExpoBooths(activityId)));
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
