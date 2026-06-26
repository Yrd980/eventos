import Taro from '@tarojs/taro'
import type { Activity, ApiError, ApiSuccess, DomainErrorCode, ExpoBooth, MyAgendaItem, QRPass, Registration, Session, StaffCheckinResult } from '@eventos/contracts'

export type QRPassView = QRPass & { token: string }

const API_BASE_KEY = 'eventos_api_base_url'
const AUTHING_TOKEN_KEY = 'eventos_authing_token'
const ACTIVITY_ID_KEY = 'eventos_activity_id'

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
  return (Taro.getStorageSync(API_BASE_KEY) as string | undefined) || process.env.TARO_APP_API_BASE_URL || 'http://localhost:3000'
}

export function setApiBaseUrl(value: string) {
  Taro.setStorageSync(API_BASE_KEY, value)
}

export function getAuthingToken() {
  return (Taro.getStorageSync(AUTHING_TOKEN_KEY) as string | undefined) || ''
}

export function setAuthingToken(value: string) {
  Taro.setStorageSync(AUTHING_TOKEN_KEY, value)
}

export function getStoredActivityId() {
  return (Taro.getStorageSync(ACTIVITY_ID_KEY) as string | undefined) || ''
}

export function setStoredActivityId(value: string) {
  Taro.setStorageSync(ACTIVITY_ID_KEY, value)
}

function isApiError<T>(value: ApiSuccess<T> | ApiError): value is ApiError {
  return 'error' in value
}

export async function apiRequest<T>(path: string, options: { method?: string; body?: Record<string, unknown>; idempotency?: boolean; auth?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (options.body) headers['content-type'] = 'application/json'
  if (options.idempotency) headers['idempotency-key'] = `miniapp_${Date.now()}_${Math.random().toString(16).slice(2)}`
  if (options.auth !== false) {
    const token = getAuthingToken()
    if (token) headers.authorization = `Bearer ${token}`
  }

  const response = await Taro.request<ApiSuccess<T> | ApiError>({
    url: `${getApiBaseUrl()}${path}`,
    method: (options.method ?? 'GET') as keyof Taro.request.Method,
    header: headers,
    data: options.body,
  })

  const payload = response.data
  if (isApiError(payload)) {
    throw new ApiRequestError(payload.error)
  }
  return payload.data
}

export async function loadActivities() {
  return apiRequest<Activity[]>('/activities', { auth: false })
}

export async function loadActivity(activityId: string) {
  return apiRequest<Activity>(`/activities/${activityId}`, { auth: false })
}

export async function loadSessions(activityId: string) {
  return apiRequest<Session[]>(`/activities/${activityId}/sessions`, { auth: false })
}

export async function register(activityId: string) {
  return apiRequest<{ registration: Registration; qr_pass: QRPassView }>(`/activities/${activityId}/registration`, {
    method: 'POST',
    idempotency: true,
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
