import Taro from '@tarojs/taro'
import type {
  Activity,
  ActivityPublication,
  ApiError,
  ApiSuccess,
  BoothCheckin,
  BoothCollection,
  DomainErrorCode,
  ExpoBooth,
  LiveEntry,
  MyAgendaItem,
  Notification,
  ParticipantCenterState,
  ParticipantExpoState,
  ParticipantQRPass,
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

export type QRPassView = ParticipantQRPass

const API_BASE_KEY = 'eventos_api_base_url'
const AUTHING_TOKEN_KEY = 'eventos_authing_token'
const ACTIVITY_ID_KEY = 'eventos_activity_id'
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000'
const DEFAULT_AUTHING_TOKEN = process.env.EVENTOS_DEV_AUTH_TOKEN || 'dev-operator-token'
const READ_CACHE_TTL_MS = 15000

const readCache = new Map<string, { expiresAt: number; value: unknown }>()
const inflightReads = new Map<string, Promise<unknown>>()

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
    clearReadCache()
  } catch {
    // Storage can be unavailable during early mini program runtime init.
  }
}

export function getAuthingToken() {
  try {
    return (Taro.getStorageSync(AUTHING_TOKEN_KEY) as string | undefined) || DEFAULT_AUTHING_TOKEN
  } catch {
    return DEFAULT_AUTHING_TOKEN
  }
}

export function setAuthingToken(value: string) {
  try {
    Taro.setStorageSync(AUTHING_TOKEN_KEY, value)
    clearReadCache()
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
    const nextValue = value.trim()
    if (nextValue) Taro.setStorageSync(ACTIVITY_ID_KEY, nextValue)
    else Taro.removeStorageSync(ACTIVITY_ID_KEY)
    clearReadCache()
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

function clearReadCache() {
  readCache.clear()
  inflightReads.clear()
}

async function cachedRead<T>(path: string, options: { auth?: boolean } = {}) {
  const tokenKey = options.auth === false ? 'public' : getAuthingToken()
  const cacheKey = `${getApiBaseUrl()}|${tokenKey}|${path}`
  const now = Date.now()
  const cached = readCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.value as T

  const inflight = inflightReads.get(cacheKey)
  if (inflight) return inflight as Promise<T>

  const request = apiRequest<T>(path, options)
    .then((value) => {
      readCache.set(cacheKey, { expiresAt: Date.now() + READ_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => {
      inflightReads.delete(cacheKey)
    })

  inflightReads.set(cacheKey, request)
  return request
}

export async function loadActivities() {
  return cachedRead<Activity[]>('/activities', { auth: false })
}

export async function resolveActivityId() {
  const storedId = getStoredActivityId()
  if (storedId) {
    try {
      await loadActivity(storedId)
      return storedId
    } catch {
      setStoredActivityId('')
    }
  }

  const activities = await loadActivities()
  const activityId = activities[0]?.id
  if (activityId) setStoredActivityId(activityId)
  return activityId ?? ''
}

export async function loadActivity(activityId: string) {
  return cachedRead<Activity>(`/activities/${activityId}`, { auth: false })
}

export async function loadPublication(activityId: string) {
  return cachedRead<ActivityPublication>(`/activities/${activityId}/publication`, { auth: false })
}

export async function loadSessions(activityId: string) {
  return cachedRead<Session[]>(`/activities/${activityId}/sessions`, { auth: false })
}

export async function loadLiveEntries(activityId: string) {
  return cachedRead<LiveEntry[]>(`/activities/${activityId}/live-entries`)
}

export async function loadNotifications(activityId: string) {
  return cachedRead<Notification[]>(`/activities/${activityId}/notifications`)
}

export async function register(activityId: string) {
  const result = await apiRequest<{ registration: Registration; qr_pass: QRPassView }>(`/activities/${activityId}/registration`, {
    method: 'POST',
    idempotency: true,
  })
  clearReadCache()
  return result
}

export async function loadRegistrationForm(activityId: string) {
  return cachedRead<RegistrationForm>(`/activities/${activityId}/registration-form`, { auth: false })
}

export async function submitRegistrationForm(activityId: string, answers: Record<string, unknown>) {
  const result = await apiRequest<{ form: RegistrationForm; submission: RegistrationSubmission }>(`/activities/${activityId}/registration-submissions`, {
    method: 'POST',
    idempotency: true,
    body: { answers },
  })
  clearReadCache()
  return result
}

export async function loadRegistration(activityId: string) {
  return cachedRead<Registration>(`/activities/${activityId}/registration`)
}

export async function loadQRPass(activityId: string) {
  return cachedRead<QRPassView>(`/activities/${activityId}/qr-pass`)
}

export async function addMyAgenda(sessionId: string) {
  const result = await apiRequest<MyAgendaItem>(`/sessions/${sessionId}/my-agenda`, { method: 'POST', idempotency: true })
  clearReadCache()
  return result
}

export async function removeMyAgenda(sessionId: string) {
  const result = await apiRequest<{ removed: boolean; item?: MyAgendaItem }>(`/sessions/${sessionId}/my-agenda`, { method: 'DELETE', idempotency: true })
  clearReadCache()
  return result
}

export async function loadMyAgenda(activityId: string) {
  return cachedRead<MyAgendaItem[]>(`/activities/${activityId}/my-agenda`)
}

export async function loadParticipantCenter(activityId: string) {
  return cachedRead<ParticipantCenterState>(`/activities/${activityId}/participant-center`)
}

export async function loadExpoBooths(activityId: string) {
  return cachedRead<ExpoBooth[]>(`/activities/${activityId}/expo-booths`, { auth: false })
}

export async function loadParticipantExpo(activityId: string) {
  return cachedRead<ParticipantExpoState>(`/activities/${activityId}/participant-expo`)
}

export async function loadMyBooths(activityId: string) {
  return cachedRead<BoothCollection[]>(`/activities/${activityId}/my-booths`)
}

export async function addMyBooth(expoBoothId: string) {
  const result = await apiRequest<BoothCollection>(`/expo-booths/${expoBoothId}/my-booths`, { method: 'POST', idempotency: true })
  clearReadCache()
  return result
}

export async function removeMyBooth(expoBoothId: string) {
  const result = await apiRequest<{ removed: boolean; item?: BoothCollection }>(`/expo-booths/${expoBoothId}/my-booths`, { method: 'DELETE', idempotency: true })
  clearReadCache()
  return result
}

export async function loadBoothCheckins(activityId: string) {
  return cachedRead<BoothCheckin[]>(`/activities/${activityId}/booth-checkins`)
}

export async function checkinBooth(expoBoothId: string) {
  const result = await apiRequest<BoothCheckin>(`/expo-booths/${expoBoothId}/checkin`, {
    method: 'POST',
    idempotency: true,
    body: { device_metadata: { entry: 'miniapp_expo' } },
  })
  clearReadCache()
  return result
}

export async function loadSurveys(activityId: string) {
  return cachedRead<Survey[]>(`/activities/${activityId}/surveys`)
}

export async function loadSurveyQuestions(surveyId: string) {
  return cachedRead<{ survey: Survey; questions: SurveyQuestion[] }>(`/surveys/${surveyId}/questions`)
}

export async function submitSurveyResponse(surveyId: string, answers: Record<string, unknown>) {
  const result = await apiRequest<{ response: SurveyResponse; answers: SurveyAnswer[] }>(`/surveys/${surveyId}/responses`, {
    method: 'POST',
    idempotency: true,
    body: { answers },
  })
  clearReadCache()
  return result
}

export async function checkinSession(input: { sessionId: string; qrToken: string; deviceMetadata?: Record<string, unknown> }) {
  const result = await apiRequest<StaffCheckinResult>('/checkin', {
    method: 'POST',
    idempotency: true,
    body: {
      session_id: input.sessionId,
      qr_token: input.qrToken,
      device_metadata: input.deviceMetadata,
    },
  })
  clearReadCache()
  return result
}

export async function loadCheckinCount(sessionId: string) {
  return cachedRead<{ session_id: string; count: number }>(`/sessions/${sessionId}/checkin-count`, { auth: false })
}
