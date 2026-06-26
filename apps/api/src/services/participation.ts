import type { MyAgendaItem, StaffCheckinResult } from "@eventos/contracts";
import type { RequestActor } from "../auth/authing";
import { DomainError } from "../http/envelope";
import { getMutableParticipantActivity, getVisibleActivity } from "./activity";
import { writeAuditEvent } from "./audit";
import { createId, signQRToken, tokenFingerprint, verifyQRToken } from "./ids";
import type { EventOsRepository } from "./repository";

export type QRPassView = {
  id: string;
  activity_id: string;
  participant_id: string;
  registration_id: string;
  status: string;
  issued_at: string;
  invalidated_at?: string;
  expires_at?: string;
  token: string;
};

async function ensureParticipantForActor(repo: EventOsRepository, activityId: string, actor: RequestActor) {
  return repo.ensureParticipant({
    id: createId("par"),
    activityId,
    userId: actor.user.id,
    displayName: actor.user.display_name,
  });
}

function issueToken(input: { qrPassId: string; activityId: string; participantId: string; registrationId: string; secret: string }) {
  return signQRToken(
    {
      activity_id: input.activityId,
      participant_id: input.participantId,
      registration_id: input.registrationId,
      qr_pass_id: input.qrPassId,
    },
    input.secret,
  );
}

function toQRPassView(input: {
  qrPass: Awaited<ReturnType<EventOsRepository["getActiveQRPass"]>>;
  token: string;
}): QRPassView {
  if (!input.qrPass) {
    throw new DomainError("QR_PASS_INVALID", "QR Pass is not available");
  }

  return {
    id: input.qrPass.id,
    activity_id: input.qrPass.activity_id,
    participant_id: input.qrPass.participant_id,
    registration_id: input.qrPass.registration_id,
    status: input.qrPass.status,
    issued_at: input.qrPass.issued_at,
    invalidated_at: input.qrPass.invalidated_at,
    expires_at: input.qrPass.expires_at,
    token: input.token,
  };
}

export async function registerForActivity(input: {
  repo: EventOsRepository;
  activityId: string;
  actor: RequestActor;
  qrSecret: string;
}) {
  const activity = await getMutableParticipantActivity(input.repo, input.activityId);
  const participant = await ensureParticipantForActor(input.repo, input.activityId, input.actor);
  const registration = await input.repo.createRegistration({
    id: createId("reg"),
    activityId: input.activityId,
    participantId: participant.id,
    source: "miniapp",
  });

  const existingPass = await input.repo.getActiveQRPass(input.activityId, participant.id);
  const newQRPassId = createId("qrp");
  const token = issueToken({
    qrPassId: existingPass?.id ?? newQRPassId,
    activityId: input.activityId,
    participantId: participant.id,
    registrationId: registration.id,
    secret: input.qrSecret,
  });

  const qrPass = existingPass
    ? existingPass
    : await input.repo.createQRPass({
        id: newQRPassId,
        activityId: input.activityId,
        participantId: participant.id,
        registrationId: registration.id,
        tokenFingerprint: tokenFingerprint(token),
      });

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: input.activityId,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "registration.confirmed",
    resourceType: "registration",
    resourceId: registration.id,
    metadata: { qr_pass_id: qrPass.id },
  });

  return {
    registration,
    qr_pass: toQRPassView({ qrPass, token }),
  };
}

export async function getRegistrationForActor(input: { repo: EventOsRepository; activityId: string; actor: RequestActor }) {
  await getVisibleActivity(input.repo, input.activityId);
  const participant = await input.repo.findParticipant(input.activityId, input.actor.user.id);
  if (!participant) {
    throw new DomainError("REGISTRATION_REQUIRED", "Registration is required", { status: 404 });
  }

  const registration = await input.repo.getRegistration(input.activityId, participant.id);
  if (!registration) {
    throw new DomainError("REGISTRATION_REQUIRED", "Registration is required", { status: 404 });
  }

  return registration;
}

export async function getQRPassForActor(input: {
  repo: EventOsRepository;
  activityId: string;
  actor: RequestActor;
  qrSecret: string;
}) {
  await getVisibleActivity(input.repo, input.activityId);
  const participant = await input.repo.findParticipant(input.activityId, input.actor.user.id);
  if (!participant) {
    throw new DomainError("REGISTRATION_REQUIRED", "Registration is required", { status: 404 });
  }

  const registration = await input.repo.getRegistration(input.activityId, participant.id);
  if (!registration || registration.status !== "confirmed") {
    throw new DomainError("REGISTRATION_NOT_CONFIRMED", "Confirmed Registration is required", { status: 400 });
  }

  const qrPass = await input.repo.getActiveQRPass(input.activityId, participant.id);
  if (!qrPass) {
    throw new DomainError("QR_PASS_INVALID", "QR Pass is not available", { status: 404 });
  }

  const token = issueToken({
    qrPassId: qrPass.id,
    activityId: input.activityId,
    participantId: participant.id,
    registrationId: registration.id,
    secret: input.qrSecret,
  });

  return toQRPassView({ qrPass, token });
}

export async function requireConfirmedParticipant(input: { repo: EventOsRepository; activityId: string; actor: RequestActor }) {
  const participant = await input.repo.findParticipant(input.activityId, input.actor.user.id);
  if (!participant) {
    throw new DomainError("REGISTRATION_REQUIRED", "Registration is required", { status: 400 });
  }

  const registration = await input.repo.getRegistration(input.activityId, participant.id);
  if (!registration) {
    throw new DomainError("REGISTRATION_REQUIRED", "Registration is required", { status: 400 });
  }

  if (registration.status !== "confirmed") {
    throw new DomainError("REGISTRATION_NOT_CONFIRMED", "Confirmed Registration is required", { status: 400 });
  }

  return { participant, registration };
}

export async function addSessionToMyAgenda(input: {
  repo: EventOsRepository;
  sessionId: string;
  actor: RequestActor;
  source?: MyAgendaItem["source"];
}) {
  const session = await input.repo.getSession(input.sessionId);
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
  }

  const activity = await getMutableParticipantActivity(input.repo, session.activity_id);
  const { participant } = await requireConfirmedParticipant({ repo: input.repo, activityId: session.activity_id, actor: input.actor });

  const item = await input.repo.addMyAgendaItem({
    id: createId("mai"),
    activityId: session.activity_id,
    participantId: participant.id,
    sessionId: session.id,
    source: input.source ?? "manual",
  });

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "my_agenda.added",
    resourceType: "my_agenda_item",
    resourceId: item.id,
    metadata: { session_id: session.id },
  });

  return item;
}

export async function removeSessionFromMyAgenda(input: { repo: EventOsRepository; sessionId: string; actor: RequestActor }) {
  const session = await input.repo.getSession(input.sessionId);
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
  }

  const activity = await getMutableParticipantActivity(input.repo, session.activity_id);
  const { participant } = await requireConfirmedParticipant({ repo: input.repo, activityId: session.activity_id, actor: input.actor });
  const item = await input.repo.removeMyAgendaItem(session.activity_id, participant.id, session.id);

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "my_agenda.removed",
    resourceType: "my_agenda_item",
    resourceId: item?.id,
    metadata: { session_id: session.id },
  });

  return { removed: Boolean(item), item };
}

export async function listMyAgendaForActor(input: { repo: EventOsRepository; activityId: string; actor: RequestActor }) {
  await getVisibleActivity(input.repo, input.activityId);
  const { participant } = await requireConfirmedParticipant(input);
  return input.repo.listMyAgenda(input.activityId, participant.id);
}

export async function checkinParticipant(input: {
  repo: EventOsRepository;
  sessionId: string;
  qrToken: string;
  actor: RequestActor;
  qrSecret: string;
  deviceMetadata?: Record<string, unknown>;
}): Promise<StaffCheckinResult> {
  const session = await input.repo.getSession(input.sessionId);
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Session was not found", { status: 404 });
  }

  async function fail(code: ConstructorParameters<typeof DomainError>[0], message: string, status = 400): Promise<never> {
    await input.repo.recordCheckinAttempt({
      id: createId("cha"),
      activity_id: session?.activity_id,
      session_id: session?.id,
      staff_user_id: input.actor.user.id,
      result: "failed",
      failure_code: code,
      metadata: { reason: message },
    });
    throw new DomainError(code, message, { status });
  }

  const activity = await getMutableParticipantActivity(input.repo, session.activity_id);
  if (session.status !== "scheduled") {
    return fail("SESSION_NOT_CHECKINABLE", "Session cannot accept Check-in");
  }

  const hasGrant = await input.repo.hasStaffGrant(activity.id, input.actor.user.id);
  if (!hasGrant) {
    return fail("STAFF_UNAUTHORIZED_FOR_ACTIVITY", "Staff is not authorized for this Activity", 403);
  }

  const payload = verifyQRToken(input.qrToken, input.qrSecret);
  if (!payload) {
    return fail("QR_PASS_INVALID", "QR Pass token is invalid");
  }

  if (payload.activity_id !== activity.id) {
    return fail("QR_PASS_ACTIVITY_MISMATCH", "QR Pass belongs to a different Activity");
  }

  const qrPass = await input.repo.getQRPassByFingerprint(tokenFingerprint(input.qrToken));
  if (!qrPass || qrPass.id !== payload.qr_pass_id || qrPass.status !== "active") {
    return fail("QR_PASS_INVALID", "QR Pass is invalid");
  }

  if (qrPass.expires_at && new Date(qrPass.expires_at).getTime() < Date.now()) {
    return fail("QR_PASS_EXPIRED", "QR Pass is expired");
  }

  const registration = await input.repo.getRegistrationById(qrPass.registration_id);
  if (!registration) {
    return fail("REGISTRATION_NOT_CONFIRMED", "Confirmed Registration is required");
  }
  if (registration.status === "cancelled") {
    return fail("REGISTRATION_CANCELLED", "Registration is cancelled");
  }
  if (registration.status !== "confirmed") {
    return fail("REGISTRATION_NOT_CONFIRMED", "Confirmed Registration is required");
  }

  const existingCheckin = await input.repo.getCheckin({
    activityId: activity.id,
    participantId: qrPass.participant_id,
    sessionId: session.id,
  });

  if (existingCheckin) {
    const count = await input.repo.getCheckinCount(session.id);
    await input.repo.recordCheckinAttempt({
      id: createId("cha"),
      activity_id: activity.id,
      session_id: session.id,
      staff_user_id: input.actor.user.id,
      result: "success",
      metadata: { outcome: "duplicate" },
    });

    return { outcome: "duplicate", checkin: existingCheckin, count };
  }

  const checkin = await input.repo.createCheckin({
    id: createId("chk"),
    activityId: activity.id,
    participantId: qrPass.participant_id,
    sessionId: session.id,
    qrPassId: qrPass.id,
    staffUserId: input.actor.user.id,
    deviceMetadata: input.deviceMetadata,
  });
  const count = await input.repo.getCheckinCount(session.id);

  await input.repo.recordCheckinAttempt({
    id: createId("cha"),
    activity_id: activity.id,
    session_id: session.id,
    staff_user_id: input.actor.user.id,
    result: "success",
  });

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "staff" },
    action: "checkin.recorded",
    resourceType: "checkin",
    resourceId: checkin.id,
    metadata: { session_id: session.id, participant_id: qrPass.participant_id, qr_pass_id: qrPass.id },
  });

  return { outcome: "success", checkin, count };
}
