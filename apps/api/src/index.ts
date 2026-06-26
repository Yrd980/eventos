import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
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
  createOperatorSession,
  listOperatorActivities,
  publishOperatorActivity,
  requireOperatorActivity,
  rollbackOperatorActivity,
  updateOperatorActivity,
  updateOperatorSession,
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
import { createNoopRealtimePublisher } from "./services/realtime";
import { createRepository } from "./services/repository";
import { getWechatConfig } from "./wechat";

const env = readEnv();
const database = createDb(env);
const verifier = createAuthingVerifier(env);
const realtime = createNoopRealtimePublisher();
const app = new Hono();

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
    const body = await readJsonObject(c);
    const sessionId = typeof body.session_id === "string" ? body.session_id : undefined;
    const qrToken = typeof body.qr_token === "string" ? body.qr_token : undefined;

    if (!sessionId || !qrToken) {
      throw new DomainError("VALIDATION_FAILED", "session_id and qr_token are required", { status: 422 });
    }

    return runCommand({
      repo,
      commandName: "checkin.create",
      resourceType: "checkin",
      resourceId: sessionId,
      actorUserId: actor.user.id,
      actorAuthingUserId: actor.principal.authing_user_id,
      idempotencyKey: requireIdempotencyKey(c),
      request: { sessionId, qrToken },
      execute: () =>
        checkinParticipant({
          repo,
          sessionId,
          qrToken,
          actor,
          qrSecret: env.qrHmacSecret,
          deviceMetadata: typeof body.device_metadata === "object" && body.device_metadata !== null ? (body.device_metadata as Record<string, unknown>) : undefined,
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
