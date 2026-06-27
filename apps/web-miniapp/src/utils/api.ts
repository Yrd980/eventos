import Taro from '@tarojs/taro'
import type {
  Activity,
  ActivityPublication,
  ApiError,
  ApiSuccess,
  DomainErrorCode,
  ExpoBooth,
  LiveEntry,
  MyAgendaItem,
  Notification,
  QRPass,
  Registration,
  RegistrationForm,
  RegistrationSubmission,
  Session,
  StaffCheckinResult,
  Survey,
  SurveyAnswer,
  SurveyQuestion,
  SurveyResponse,
} from '@eventos/contracts'

export type QRPassView = QRPass & { token: string }

const API_BASE_KEY = 'eventos_api_base_url'
const AUTHING_TOKEN_KEY = 'eventos_authing_token'
const ACTIVITY_ID_KEY = 'eventos_activity_id'
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000'

export class ApiRequestError extends Error {
  code: DomainErrorCode
  details?: Record<string, unknown>

  constructor(error: ApiError['error']) {
    super(error.message)
    this.code = error.code
    this.details = error.details
  }
}

export function getApiBaseUrl() {
  try {
    return (Taro.getStorageSync(API_BASE_KEY) as string | undefined) || DEFAULT_API_BASE_URL
  } catch {
    return DEFAULT_API_BASE_URL
  }
}

export function setApiBaseUrl(value: string) {
  try {
    Taro.setStorageSync(API_BASE_KEY, value.trim() || DEFAULT_API_BASE_URL)
  } catch {
    // Storage can be unavailable during early mini program runtime init.
  }
}

export function getAuthingToken() {
  try {
    return (Taro.getStorageSync(AUTHING_TOKEN_KEY) as string | undefined) || ''
  } catch {
    return ''
  }
}

export function setAuthingToken(value: string) {
  try {
    Taro.setStorageSync(AUTHING_TOKEN_KEY, value)
  } catch {
    // Storage can be unavailable during early mini program runtime init.
  }
}

export function getStoredActivityId() {
  try {
    return (Taro.getStorageSync(ACTIVITY_ID_KEY) as string | undefined) || ''
  } catch {
    return ''
  }
}

export function setStoredActivityId(value: string) {
  try {
    Taro.setStorageSync(ACTIVITY_ID_KEY, value)
  } catch {
    // Storage can be unavailable during early mini program runtime init.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return isRecord(value) && 'data' in value
}

export async function apiRequest<T>(path: string, options: { method?: string; body?: Record<string, unknown>; idempotency?: boolean; auth?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (options.body) headers['content-type'] = 'application/json'
  if (options.idempotency) headers['idempotency-key'] = `miniapp_${Date.now()}_${Math.random().toString(16).slice(2)}`
  if (options.auth !== false) {
    const token = getAuthingToken()
    if (token) headers.authorization = `Bearer ${token}`
  }

  let response: Taro.request.SuccessCallbackResult<ApiSuccess<T> | ApiError>
  try {
    response = await Taro.request<ApiSuccess<T> | ApiError>({
      url: `${getApiBaseUrl()}${path}`,
      method: (options.method ?? 'GET') as keyof Taro.request.Method,
      header: headers,
      data: options.body,
      timeout: 8000,
    })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : `API request failed: ${path}`)
  }

  const payload = response.data
  if (isApiError(payload)) {
    throw new ApiRequestError(payload.error)
  }
  if (!isApiSuccess<T>(payload)) {
    throw new Error(`API returned an invalid envelope for ${path}`)
  }
  return payload.data
}

export async function loadActivities() {
  return apiRequest<Activity[]>('/activities', { auth: false })
}

export async function resolveActivityId() {
  const storedId = getStoredActivityId()
  if (storedId) return storedId

  const activities = await loadActivities()
  const activityId = activities[0]?.id
  if (activityId) setStoredActivityId(activityId)
  return activityId ?? ''
}

export async function loadActivity(activityId: string) {
  return apiRequest<Activity>(`/activities/${activityId}`, { auth: false })
}

export async function loadPublication(activityId: string) {
  return apiRequest<ActivityPublication>(`/activities/${activityId}/publication`, { auth: false })
}

export async function loadSessions(activityId: string) {
  return apiRequest<Session[]>(`/activities/${activityId}/sessions`, { auth: false })
}

export async function loadLiveEntries(activityId: string) {
  return apiRequest<LiveEntry[]>(`/activities/${activityId}/live-entries`)
}

export async function loadNotifications(activityId: string) {
  return apiRequest<Notification[]>(`/activities/${activityId}/notifications`)
}

export async function register(activityId: string) {
  return apiRequest<{ registration: Registration; qr_pass: QRPassView }>(`/activities/${activityId}/registration`, {
    method: 'POST',
    idempotency: true,
  })
}

export async function loadRegistrationForm(activityId: string) {
  return apiRequest<RegistrationForm>(`/activities/${activityId}/registration-form`, { auth: false })
}

export async function submitRegistrationForm(activityId: string, answers: Record<string, unknown>) {
  return apiRequest<{ form: RegistrationForm; submission: RegistrationSubmission }>(`/activities/${activityId}/registration-submissions`, {
    method: 'POST',
    idempotency: true,
    body: { answers },
  })
}

export async function loadRegistration(activityId: string) {
  return apiRequest<Registration>(`/activities/${activityId}/registration`)
}

export async function loadQRPass(activityId: string) {
  return apiRequest<QRPassView>(`/activities/${activityId}/qr-pass`)
}

export async function addMyAgenda(sessionId: string) {
  return apiRequest<MyAgendaItem>(`/sessions/${sessionId}/my-agenda`, { method: 'POST', idempotency: true })
}

export async function removeMyAgenda(sessionId: string) {
  return apiRequest<{ removed: boolean; item?: MyAgendaItem }>(`/sessions/${sessionId}/my-agenda`, { method: 'DELETE', idempotency: true })
}

export async function loadMyAgenda(activityId: string) {
  return apiRequest<MyAgendaItem[]>(`/activities/${activityId}/my-agenda`)
}

export async function loadExpoBooths(activityId: string) {
  return apiRequest<ExpoBooth[]>(`/activities/${activityId}/expo-booths`, { auth: false })
}

export async function loadSurveys(activityId: string) {
  return apiRequest<Survey[]>(`/activities/${activityId}/surveys`)
}

export async function loadSurveyQuestions(surveyId: string) {
  return apiRequest<{ survey: Survey; questions: SurveyQuestion[] }>(`/surveys/${surveyId}/questions`)
}

export async function submitSurveyResponse(surveyId: string, answers: Record<string, unknown>) {
  return apiRequest<{ response: SurveyResponse; answers: SurveyAnswer[] }>(`/surveys/${surveyId}/responses`, {
    method: 'POST',
    idempotency: true,
    body: { answers },
  })
}

export async function checkinSession(input: { sessionId: string; qrToken: string; deviceMetadata?: Record<string, unknown> }) {
  return apiRequest<StaffCheckinResult>('/checkin', {
    method: 'POST',
    idempotency: true,
    body: {
      session_id: input.sessionId,
      qr_token: input.qrToken,
      device_metadata: input.deviceMetadata,
    },
  })
}

export async function loadCheckinCount(sessionId: string) {
  return apiRequest<{ session_id: string; count: number }>(`/sessions/${sessionId}/checkin-count`, { auth: false })
}
