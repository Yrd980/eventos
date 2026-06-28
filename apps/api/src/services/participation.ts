import type {
  BoothCollection,
  LiveEntry,
  MyAgendaItem,
  Notification,
  ParticipantCenterState,
  ParticipantExpoState,
  ParticipantQRPass,
  RegistrationForm,
  StaffCheckinResult,
  Survey,
  SurveyQuestion,
} from "@eventos/contracts";
import type { RequestActor } from "../auth/authing";
import { DomainError } from "../http/envelope";
import { getMutableParticipantActivity, getPublishedSnapshot, getVisibleActivity } from "./activity";
import { writeAuditEvent } from "./audit";
import { createId, signQRToken, tokenFingerprint, verifyQRToken } from "./ids";
import type { EventOsRepository } from "./repository";

export type QRPassView = ParticipantQRPass;

type RegistrationAnswers = Record<string, unknown>;

const emptyAnswerValues = new Set<unknown>(["", null, undefined]);

function snapshotArray<T>(snapshot: Record<string, unknown>, key: string): T[] {
  const value = snapshot[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

async function getPublishedSnapshotRows(repo: EventOsRepository, activityId: string) {
  const publication = await getPublishedSnapshot(repo, activityId);
  return {
    liveEntries: snapshotArray<LiveEntry>(publication.snapshot, "live_entries"),
    registrationForms: snapshotArray<RegistrationForm>(publication.snapshot, "registration_forms"),
    surveys: snapshotArray<Survey>(publication.snapshot, "surveys"),
    surveyQuestions: snapshotArray<SurveyQuestion>(publication.snapshot, "survey_questions"),
  };
}

function ensureKnownAnswerKeys(input: { answers: RegistrationAnswers; allowedKeys: Set<string>; resource: string }) {
  for (const key of Object.keys(input.answers)) {
    if (!input.allowedKeys.has(key)) {
      throw new DomainError("VALIDATION_FAILED", `${input.resource} answer includes unknown key`, { status: 422, details: { key } });
    }
  }
}

function isEmptyAnswer(value: unknown) {
  return emptyAnswerValues.has(value) || (Array.isArray(value) && value.length === 0);
}

function optionValues(options: Array<{ label: string; value: string }> | undefined) {
  return new Set((options ?? []).map((option) => option.value));
}

function validateRegistrationAnswers(form: RegistrationForm, answers: RegistrationAnswers) {
  const fieldsByKey = new Map(form.fields.map((field) => [field.key, field]));
  ensureKnownAnswerKeys({ answers, allowedKeys: new Set(fieldsByKey.keys()), resource: "Registration Form" });

  for (const field of form.fields) {
    const value = answers[field.key];
    if (field.required && isEmptyAnswer(value)) {
      throw new DomainError("VALIDATION_FAILED", "Registration Form required field is missing", { status: 422, details: { key: field.key } });
    }
    if (isEmptyAnswer(value)) {
      continue;
    }

    if (field.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new DomainError("VALIDATION_FAILED", "Registration Form boolean answer must be boolean", { status: 422, details: { key: field.key } });
      }
      continue;
    }

    if (field.type === "multi_select") {
      const allowed = optionValues(field.options);
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && allowed.has(item))) {
        throw new DomainError("VALIDATION_FAILED", "Registration Form multi_select answer is invalid", { status: 422, details: { key: field.key } });
      }
      continue;
    }

    if (typeof value !== "string" || value.trim() === "") {
      throw new DomainError("VALIDATION_FAILED", "Registration Form answer must be a string", { status: 422, details: { key: field.key } });
    }

    if (field.type === "email" && !value.includes("@")) {
      throw new DomainError("VALIDATION_FAILED", "Registration Form email answer is invalid", { status: 422, details: { key: field.key } });
    }

    if (field.type === "select" && !optionValues(field.options).has(value)) {
      throw new DomainError("VALIDATION_FAILED", "Registration Form select answer is invalid", { status: 422, details: { key: field.key } });
    }
  }
}

function projectRegistrationAnswers(form: RegistrationForm, answers: RegistrationAnswers) {
  const projected: Record<string, string> = {};
  for (const field of form.fields) {
    const value = answers[field.key];
    if (typeof value === "string") {
      projected[field.key] = value;
    } else if (typeof value === "boolean") {
      projected[field.key] = String(value);
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      projected[field.key] = value.join(",");
    }
  }
  return projected;
}

function validateSurveyAnswers(questions: SurveyQuestion[], answers: RegistrationAnswers) {
  const questionsByKey = new Map(questions.map((question) => [question.key, question]));
  ensureKnownAnswerKeys({ answers, allowedKeys: new Set(questionsByKey.keys()), resource: "Survey" });

  for (const question of questions) {
    const value = answers[question.key];
    if (question.required && isEmptyAnswer(value)) {
      throw new DomainError("VALIDATION_FAILED", "Survey required answer is missing", { status: 422, details: { key: question.key } });
    }
    if (isEmptyAnswer(value)) {
      continue;
    }

    if (question.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new DomainError("VALIDATION_FAILED", "Survey boolean answer must be boolean", { status: 422, details: { key: question.key } });
      }
      continue;
    }

    if (question.type === "rating") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
        throw new DomainError("VALIDATION_FAILED", "Survey rating answer must be an integer from 1 to 5", { status: 422, details: { key: question.key } });
      }
      continue;
    }

    const allowed = optionValues(question.options);
    if (question.type === "single_choice") {
      if (typeof value !== "string" || !allowed.has(value)) {
        throw new DomainError("VALIDATION_FAILED", "Survey single_choice answer is invalid", { status: 422, details: { key: question.key } });
      }
      continue;
    }

    if (question.type === "multiple_choice") {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && allowed.has(item))) {
        throw new DomainError("VALIDATION_FAILED", "Survey multiple_choice answer is invalid", { status: 422, details: { key: question.key } });
      }
      continue;
    }

    if (typeof value !== "string" || value.trim() === "") {
      throw new DomainError("VALIDATION_FAILED", "Survey text answer must be a string", { status: 422, details: { key: question.key } });
    }
  }
}

async function hasConfirmedRegistration(input: { repo: EventOsRepository; activityId: string; actor?: RequestActor }) {
  if (!input.actor) {
    return false;
  }
  const participant = await input.repo.findParticipant(input.activityId, input.actor.user.id);
  if (!participant) {
    return false;
  }
  const registration = await input.repo.getRegistration(input.activityId, participant.id);
  return registration?.status === "confirmed";
}

function filterByAccessPolicy<T extends { access_policy: "public" | "confirmed_registration" }>(rows: T[], confirmed: boolean) {
  return rows.filter((row) => row.access_policy === "public" || confirmed);
}

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

async function requireConfirmedParticipantWithQRPass(input: { repo: EventOsRepository; activityId: string; actor: RequestActor }) {
  const confirmed = await requireConfirmedParticipant(input);
  const qrPass = await input.repo.getActiveQRPass(input.activityId, confirmed.participant.id);
  if (!qrPass) {
    throw new DomainError("QR_PASS_INVALID", "Active QR Pass is required", { status: 400 });
  }
  return { ...confirmed, qrPass };
}

export async function listLiveEntriesForActivity(input: { repo: EventOsRepository; activityId: string; actor?: RequestActor }) {
  await getVisibleActivity(input.repo, input.activityId);
  const confirmed = await hasConfirmedRegistration(input);
  const snapshot = await getPublishedSnapshotRows(input.repo, input.activityId);
  return filterByAccessPolicy(snapshot.liveEntries, confirmed);
}

export async function getCurrentRegistrationForm(input: { repo: EventOsRepository; activityId: string }) {
  await getVisibleActivity(input.repo, input.activityId);
  const snapshot = await getPublishedSnapshotRows(input.repo, input.activityId);
  const form = snapshot.registrationForms[0];
  if (!form) {
    throw new DomainError("REGISTRATION_FORM_NOT_FOUND", "Registration Form was not found", { status: 404 });
  }
  return form;
}

export async function submitRegistrationForm(input: {
  repo: EventOsRepository;
  activityId: string;
  actor: RequestActor;
  answers: RegistrationAnswers;
}) {
  const activity = await getMutableParticipantActivity(input.repo, input.activityId);
  const form = await getCurrentRegistrationForm({ repo: input.repo, activityId: input.activityId });
  validateRegistrationAnswers(form, input.answers);
  const { registration, qrPass } = await requireConfirmedParticipantWithQRPass(input);

  const submission = await input.repo.createRegistrationSubmission({
    id: createId("rgs"),
    activityId: input.activityId,
    registrationId: registration.id,
    formVersionId: form.id,
    answers: input.answers,
    projectedFields: projectRegistrationAnswers(form, input.answers),
  });

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: input.activityId,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "registration_form.submitted",
    resourceType: "registration_form",
    resourceId: form.id,
    metadata: { submission_id: submission.id, registration_id: registration.id, qr_pass_id: qrPass.id },
  });

  return { form, submission };
}

export async function listSurveysForActivity(input: { repo: EventOsRepository; activityId: string; actor?: RequestActor }) {
  await getVisibleActivity(input.repo, input.activityId);
  const confirmed = await hasConfirmedRegistration(input);
  const snapshot = await getPublishedSnapshotRows(input.repo, input.activityId);
  return filterByAccessPolicy(snapshot.surveys.filter((survey) => survey.status === "published"), confirmed);
}

export async function listNotificationsForParticipant(input: { repo: EventOsRepository; activityId: string; actor?: RequestActor }) {
  await getVisibleActivity(input.repo, input.activityId);
  const confirmed = await hasConfirmedRegistration(input);
  const myAgendaSessionIds =
    input.actor && confirmed
      ? new Set((await input.repo.listMyAgenda(input.activityId, (await input.repo.findParticipant(input.activityId, input.actor.user.id))?.id ?? "")).map((item) => item.session_id))
      : new Set<string>();

  const now = Date.now();
  return (await input.repo.listNotifications(input.activityId)).filter((notification) => {
    if (notification.channel !== "miniapp") return false;
    if (notification.status === "scheduled" && (!notification.scheduled_at || new Date(notification.scheduled_at).getTime() > now)) return false;
    if (!["scheduled", "sending", "sent"].includes(notification.status)) return false;
    return isNotificationVisible(notification, { confirmed, myAgendaSessionIds });
  });
}

function isNotificationVisible(notification: Notification, input: { confirmed: boolean; myAgendaSessionIds: Set<string> }) {
  const rule = notification.audience_rule;
  if (rule.type === "all_confirmed_participants") return input.confirmed;
  if (rule.type === "participants_with_session_in_my_agenda") return input.confirmed && input.myAgendaSessionIds.has(rule.session_id);
  return false;
}

export async function getVisibleSurvey(input: { repo: EventOsRepository; surveyId: string; actor?: RequestActor }) {
  const survey = await input.repo.getSurvey(input.surveyId);
  if (!survey) {
    throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
  }
  await getVisibleActivity(input.repo, survey.activity_id);
  if (survey.status !== "published" && survey.status !== "closed") {
    throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
  }
  const snapshot = await getPublishedSnapshotRows(input.repo, survey.activity_id);
  const publishedSurvey = snapshot.surveys.find((item) => item.id === survey.id);
  if (!publishedSurvey || publishedSurvey.status !== "published") {
    throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
  }
  if (publishedSurvey.access_policy === "confirmed_registration" && !(await hasConfirmedRegistration({ repo: input.repo, activityId: publishedSurvey.activity_id, actor: input.actor }))) {
    throw new DomainError("REGISTRATION_REQUIRED", "Confirmed Registration is required", { status: 403 });
  }
  return publishedSurvey;
}

export async function listSurveyQuestionsForParticipant(input: { repo: EventOsRepository; surveyId: string; actor?: RequestActor }) {
  const survey = await getVisibleSurvey(input);
  const snapshot = await getPublishedSnapshotRows(input.repo, survey.activity_id);
  return {
    survey,
    questions: snapshot.surveyQuestions.filter((question) => question.survey_id === survey.id),
  };
}

export async function submitSurveyResponse(input: {
  repo: EventOsRepository;
  surveyId: string;
  actor: RequestActor;
  answers: RegistrationAnswers;
}) {
  const currentSurvey = await input.repo.getSurvey(input.surveyId);
  if (!currentSurvey) {
    throw new DomainError("SURVEY_NOT_FOUND", "Survey was not found", { status: 404 });
  }
  const activity = await getMutableParticipantActivity(input.repo, currentSurvey.activity_id);
  const snapshot = await getPublishedSnapshotRows(input.repo, currentSurvey.activity_id);
  const survey = snapshot.surveys.find((item) => item.id === currentSurvey.id);
  if (!survey || survey.status !== "published") {
    throw new DomainError("VALIDATION_FAILED", "Survey is not open for responses", { status: 422, details: { status: currentSurvey.status } });
  }
  const { participant } = await requireConfirmedParticipant({ repo: input.repo, activityId: survey.activity_id, actor: input.actor });
  const existing = await input.repo.getSurveyResponseForParticipant(survey.id, participant.id);
  if (existing) {
    throw new DomainError("SURVEY_RESPONSE_ALREADY_EXISTS", "Survey response already submitted", {
      status: 409,
      details: {
        response_id: existing.id,
        idempotency: "Retry the original command with the same idempotency-key to receive the stored response.",
      },
    });
  }

  const questions = snapshot.surveyQuestions.filter((question) => question.survey_id === survey.id);
  validateSurveyAnswers(questions, input.answers);

  const questionByKey = new Map(questions.map((question) => [question.key, question]));
  const persistedAnswers = Object.entries(input.answers)
    .filter(([, value]) => !isEmptyAnswer(value))
    .map(([key, value]) => {
      const question = questionByKey.get(key);
      if (!question) {
        throw new DomainError("SURVEY_QUESTION_NOT_FOUND", "Survey Question was not found", { status: 404, details: { key } });
      }
      return { id: createId("sva"), questionId: question.id, value };
    });

  const result = await input.repo.createSurveyResponse({
    id: createId("svr"),
    activityId: survey.activity_id,
    surveyId: survey.id,
    participantId: participant.id,
    targetType: survey.target_type,
    targetId: survey.target_id,
    answers: persistedAnswers,
  });

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: survey.activity_id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "survey_response.submitted",
    resourceType: "survey",
    resourceId: survey.id,
    metadata: { response_id: result.response.id, target_type: survey.target_type, target_id: survey.target_id },
  });

  return result;
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

export async function getParticipantExpoState(input: { repo: EventOsRepository; activityId: string; actor?: RequestActor }): Promise<ParticipantExpoState> {
  await getVisibleActivity(input.repo, input.activityId);
  const expoBooths = await input.repo.listExpoBooths(input.activityId);
  const participant = input.actor ? await input.repo.findParticipant(input.activityId, input.actor.user.id) : undefined;
  const registration = participant ? await input.repo.getRegistration(input.activityId, participant.id) : undefined;
  const hasPersonalState = Boolean(participant && registration?.status === "confirmed");
  const [myBooths, boothCheckins] = hasPersonalState
    ? await Promise.all([
        input.repo.listBoothCollections(input.activityId, participant!.id),
        input.repo.listBoothCheckins(input.activityId, participant!.id),
      ])
    : [[], []];

  return {
    expo_booths: expoBooths,
    my_booths: myBooths,
    booth_checkins: boothCheckins,
  };
}

export async function getParticipantCenterState(input: {
  repo: EventOsRepository;
  activityId: string;
  actor: RequestActor;
  qrSecret: string;
}): Promise<ParticipantCenterState> {
  await getVisibleActivity(input.repo, input.activityId);
  const { participant, registration } = await requireConfirmedParticipant(input);
  const [sessions, myAgenda, expoBooths, myBooths, notifications, qrPass] = await Promise.all([
    input.repo.listSessions(input.activityId),
    input.repo.listMyAgenda(input.activityId, participant.id),
    input.repo.listExpoBooths(input.activityId),
    input.repo.listBoothCollections(input.activityId, participant.id),
    listNotificationsForParticipant(input),
    input.repo.getActiveQRPass(input.activityId, participant.id),
  ]);

  return {
    sessions,
    my_agenda: myAgenda,
    expo_booths: expoBooths,
    my_booths: myBooths,
    notifications,
    registration,
    qr_pass: qrPass
      ? toQRPassView({
          qrPass,
          token: issueToken({
            qrPassId: qrPass.id,
            activityId: input.activityId,
            participantId: participant.id,
            registrationId: registration.id,
            secret: input.qrSecret,
          }),
        })
      : undefined,
  };
}

async function requireVisibleExpoBooth(input: { repo: EventOsRepository; expoBoothId: string }) {
  const booth = await input.repo.getExpoBooth(input.expoBoothId);
  if (!booth) {
    throw new DomainError("EXPO_BOOTH_NOT_FOUND", "Expo Booth was not found", { status: 404 });
  }
  if (booth.status !== "visible") {
    throw new DomainError("EXPO_BOOTH_NOT_FOUND", "Expo Booth was not found", { status: 404 });
  }
  return booth;
}

export async function addBoothToMyBooths(input: {
  repo: EventOsRepository;
  expoBoothId: string;
  actor: RequestActor;
  source?: BoothCollection["source"];
}) {
  const booth = await requireVisibleExpoBooth({ repo: input.repo, expoBoothId: input.expoBoothId });
  const activity = await getMutableParticipantActivity(input.repo, booth.activity_id);
  const { participant } = await requireConfirmedParticipant({ repo: input.repo, activityId: booth.activity_id, actor: input.actor });

  const item = await input.repo.addBoothCollection({
    id: createId("bcl"),
    activityId: booth.activity_id,
    participantId: participant.id,
    expoBoothId: booth.id,
    source: input.source ?? "manual",
  });

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "booth_collection.added",
    resourceType: "booth_collection",
    resourceId: item.id,
    metadata: { expo_booth_id: booth.id },
  });

  return item;
}

export async function removeBoothFromMyBooths(input: { repo: EventOsRepository; expoBoothId: string; actor: RequestActor }) {
  const booth = await requireVisibleExpoBooth({ repo: input.repo, expoBoothId: input.expoBoothId });
  const activity = await getMutableParticipantActivity(input.repo, booth.activity_id);
  const { participant } = await requireConfirmedParticipant({ repo: input.repo, activityId: booth.activity_id, actor: input.actor });
  const item = await input.repo.removeBoothCollection(booth.activity_id, participant.id, booth.id);

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "booth_collection.removed",
    resourceType: "booth_collection",
    resourceId: item?.id,
    metadata: { expo_booth_id: booth.id },
  });

  return { removed: Boolean(item), item };
}

export async function listMyBoothsForActor(input: { repo: EventOsRepository; activityId: string; actor: RequestActor }) {
  await getVisibleActivity(input.repo, input.activityId);
  const { participant } = await requireConfirmedParticipant(input);
  return input.repo.listBoothCollections(input.activityId, participant.id);
}

export async function checkinBooth(input: { repo: EventOsRepository; expoBoothId: string; actor: RequestActor; deviceMetadata?: Record<string, unknown> }) {
  const booth = await requireVisibleExpoBooth({ repo: input.repo, expoBoothId: input.expoBoothId });
  const activity = await getMutableParticipantActivity(input.repo, booth.activity_id);
  const { participant } = await requireConfirmedParticipant({ repo: input.repo, activityId: booth.activity_id, actor: input.actor });
  const qrPass = await input.repo.getActiveQRPass(booth.activity_id, participant.id);

  const checkin = await input.repo.createBoothCheckin({
    id: createId("bci"),
    activityId: booth.activity_id,
    participantId: participant.id,
    expoBoothId: booth.id,
    qrPassId: qrPass?.id,
    deviceMetadata: input.deviceMetadata,
  });

  await writeAuditEvent(input.repo, {
    tenantId: activity.tenant_id,
    activityId: activity.id,
    actor: { user: input.actor.user, authingUserId: input.actor.principal.authing_user_id, scope: "participant" },
    action: "booth_checkin.recorded",
    resourceType: "booth_checkin",
    resourceId: checkin.id,
    metadata: { expo_booth_id: booth.id, qr_pass_id: qrPass?.id },
  });

  return checkin;
}

export async function listBoothCheckinsForActor(input: { repo: EventOsRepository; activityId: string; actor: RequestActor }) {
  await getVisibleActivity(input.repo, input.activityId);
  const { participant } = await requireConfirmedParticipant(input);
  return input.repo.listBoothCheckins(input.activityId, participant.id);
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
