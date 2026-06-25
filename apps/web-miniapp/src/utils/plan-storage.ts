import Taro from '@tarojs/taro'

export type Session = {
  id: string
  day: 'day1' | 'day2'
  time: string
  title: string
  place: string
  tag: string
  speaker: string
}

const storageKey = 'eventos_my_plan'
let cachedPlan: Session[] | null = null

function isSession(value: unknown): value is Session {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      'day' in value &&
      'time' in value &&
      'title' in value &&
      'place' in value &&
      'tag' in value &&
      'speaker' in value,
  )
}

export function readPlan(): Session[] {
  if (cachedPlan) {
    return cachedPlan
  }

  try {
    const raw = Taro.getStorageSync(storageKey)
    if (Array.isArray(raw)) {
      cachedPlan = raw.filter(isSession)
      return cachedPlan
    }
    if (typeof raw === 'string' && raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        cachedPlan = parsed.filter(isSession)
        return cachedPlan
      }
    }
    if (raw != null) {
      Taro.removeStorageSync(storageKey)
    }
    cachedPlan = []
    return []
  } catch {
    try {
      Taro.removeStorageSync(storageKey)
    } catch {
      // ignore storage cleanup failures
    }
    cachedPlan = []
    return []
  }
}

export function writePlan(nextPlan: Session[]) {
  cachedPlan = nextPlan
  Taro.setStorageSync(storageKey, nextPlan)
}
