import { useEffect, useMemo, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { DomainErrorCode, Session, StaffCheckinOutcome } from '@eventos/contracts'
import { ApiRequestError, checkinSession, getStoredActivityId, loadCheckinCount, loadSessions } from '../../utils/api'
import './index.css'

type CheckinDisplayState = {
  tone: 'idle' | 'success' | 'warning' | 'danger'
  title: string
  detail: string
  code?: DomainErrorCode
  outcome?: StaffCheckinOutcome
}

const initialState: CheckinDisplayState = {
  tone: 'idle',
  title: '等待 QR Pass',
  detail: '选择 Session 后扫码或粘贴 QR Pass 内容进行现场 Check-in。',
}

const codeCopy: Partial<Record<DomainErrorCode, Pick<CheckinDisplayState, 'tone' | 'title' | 'detail'>>> = {
  QR_PASS_INVALID: {
    tone: 'danger',
    title: 'QR Pass 无效',
    detail: '凭证无法验证，未创建 Check-in。',
  },
  QR_PASS_EXPIRED: {
    tone: 'danger',
    title: 'QR Pass 已过期',
    detail: '凭证过期，未创建 Check-in。',
  },
  QR_PASS_ACTIVITY_MISMATCH: {
    tone: 'danger',
    title: 'Activity 不匹配',
    detail: '该 QR Pass 不属于当前 Activity，未创建 Check-in。',
  },
  REGISTRATION_CANCELLED: {
    tone: 'danger',
    title: 'Registration 已取消',
    detail: '该参与记录已取消，未创建 Check-in。',
  },
  REGISTRATION_NOT_CONFIRMED: {
    tone: 'danger',
    title: 'Registration 未确认',
    detail: '只有 confirmed Registration 可以 Check-in。',
  },
  SESSION_NOT_CHECKINABLE: {
    tone: 'danger',
    title: 'Session 不可签到',
    detail: '当前 Session 状态不接受 Check-in。',
  },
  STAFF_UNAUTHORIZED_FOR_ACTIVITY: {
    tone: 'danger',
    title: 'Staff 未授权',
    detail: '当前 Authing identity 没有此 Activity 的 Staff grant。',
  },
  AUTHENTICATION_REQUIRED: {
    tone: 'danger',
    title: '需要 Staff 登录',
    detail: '请先在首页配置 Authing bearer token。',
  },
}

function timeRange(session: Session) {
  return `${session.start_time.slice(11, 16)} - ${session.end_time.slice(11, 16)}`
}

function readRouteSessionId() {
  const params = Taro.getCurrentInstance().router?.params
  return typeof params?.sessionId === 'string' ? params.sessionId : ''
}

export default function StaffCheckinPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState(readRouteSessionId())
  const [qrToken, setQrToken] = useState('')
  const [count, setCount] = useState<number>()
  const [status, setStatus] = useState('加载 Session 中')
  const [result, setResult] = useState<CheckinDisplayState>(initialState)
  const activityId = getStoredActivityId()
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? sessions[0],
    [selectedSessionId, sessions],
  )

  async function refreshCount(sessionId: string) {
    const snapshot = await loadCheckinCount(sessionId)
    setCount(snapshot.count)
  }

  async function load() {
    if (!activityId) {
      setStatus('请先在首页选择 Activity')
      return
    }

    try {
      const rows = await loadSessions(activityId)
      setSessions(rows)
      const nextSessionId = selectedSessionId || rows[0]?.id || ''
      setSelectedSessionId(nextSessionId)
      setStatus(rows.length ? 'Staff Check-in ready' : '暂无可签到 Session')
      if (nextSessionId) await refreshCount(nextSessionId)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function scan() {
    try {
      const scanResult = await Taro.scanCode({ onlyFromCamera: false })
      setQrToken(scanResult.result)
      setResult({ tone: 'idle', title: '已读取 QR Pass', detail: 'QR Pass 内容仅用于提交 Check-in，不在页面展示。' })
    } catch (error) {
      setResult({
        tone: 'warning',
        title: '扫码未完成',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function submit() {
    if (!selectedSession) {
      setResult({ tone: 'danger', title: '未选择 Session', detail: '请先选择一个 Session。' })
      return
    }
    if (!qrToken.trim()) {
      setResult({ tone: 'danger', title: '缺少 QR Pass', detail: '请扫码或粘贴 QR Pass 内容。' })
      return
    }

    try {
      const response = await checkinSession({
        sessionId: selectedSession.id,
        qrToken: qrToken.trim(),
        deviceMetadata: {
          entry: 'miniapp_staff_checkin',
          session_title: selectedSession.title,
        },
      })
      setCount(response.count)
      setQrToken('')
      setResult(
        response.outcome === 'duplicate'
          ? {
              tone: 'warning',
              title: '已签到',
              detail: '该 QR Pass 已完成本 Session Check-in，人数未重复增加。',
              outcome: response.outcome,
            }
          : {
              tone: 'success',
              title: 'Check-in 成功',
              detail: '签到已写入 PostgreSQL，并可通过 Realtime 更新人数。',
              outcome: response.outcome,
            },
      )
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const mapped = codeCopy[error.code]
        setResult({
          tone: mapped?.tone ?? 'danger',
          title: mapped?.title ?? error.code,
          detail: mapped?.detail ?? error.message,
          code: error.code,
        })
        return
      }

      setResult({ tone: 'danger', title: 'Check-in 失败', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  async function selectSession(session: Session) {
    setSelectedSessionId(session.id)
    setResult(initialState)
    try {
      await refreshCount(session.id)
    } catch (error) {
      setResult({ tone: 'warning', title: '人数快照未刷新', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <View className='page page--staff'>
      <View className='staff-topbar'>
        <Text className='staff-topbar__back' onClick={() => Taro.navigateBack()}>返回</Text>
        <Text className='staff-topbar__title'>Staff Check-in</Text>
        <Text className='staff-topbar__count'>{typeof count === 'number' ? count : '--'}</Text>
      </View>

      <View className='staff-status'>
        <Text className='staff-status__label'>{status}</Text>
        <Text className='staff-status__title'>{selectedSession?.title ?? '选择 Session'}</Text>
        <Text className='staff-status__meta'>{selectedSession ? `${timeRange(selectedSession)} · ${selectedSession.room_name ?? selectedSession.venue_area ?? 'Activity venue'}` : 'No Session'}</Text>
      </View>

      <View className='session-picker'>
        {sessions.map((session) => (
          <Text
            key={session.id}
            className={`session-picker__item${session.id === selectedSession?.id ? ' session-picker__item--active' : ''}`}
            onClick={() => void selectSession(session)}
          >
            {session.title}
          </Text>
        ))}
      </View>

      <View className='scan-panel'>
        <View className={`result result--${result.tone}`}>
          <Text className='result__title'>{result.title}</Text>
          <Text className='result__detail'>{result.detail}</Text>
          {(result.code || result.outcome) && <Text className='result__code'>{result.code ?? result.outcome}</Text>}
        </View>

        <View className='scan-panel__actions'>
          <Text className='scan-panel__button scan-panel__button--primary' onClick={() => void scan()}>扫码</Text>
          <Text className='scan-panel__button' onClick={() => void submit()}>提交</Text>
        </View>

        <Input
          className='token-input'
          password
          value={qrToken}
          placeholder='粘贴 QR Pass 内容'
          onInput={(event) => setQrToken(event.detail.value)}
        />
        <Text className='scan-panel__hint'>页面不显示 raw token；提交后仅展示结果、错误码和人数。</Text>
      </View>
    </View>
  )
}
