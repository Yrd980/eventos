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
  title: '等待入场凭证',
  detail: '选择日程后扫码或粘贴入场凭证内容进行现场签到。',
}

const codeCopy: Partial<Record<DomainErrorCode, Pick<CheckinDisplayState, 'tone' | 'title' | 'detail'>>> = {
  QR_PASS_INVALID: {
    tone: 'danger',
    title: '入场凭证无效',
    detail: '凭证无法验证，未创建签到记录。',
  },
  QR_PASS_EXPIRED: {
    tone: 'danger',
    title: '入场凭证已过期',
    detail: '凭证过期，未创建签到记录。',
  },
  QR_PASS_ACTIVITY_MISMATCH: {
    tone: 'danger',
    title: '活动不匹配',
    detail: '该入场凭证不属于当前活动，未创建签到记录。',
  },
  REGISTRATION_CANCELLED: {
    tone: 'danger',
    title: '报名已取消',
    detail: '该参与记录已取消，未创建签到记录。',
  },
  REGISTRATION_NOT_CONFIRMED: {
    tone: 'danger',
    title: '报名未确认',
    detail: '只有已确认报名可以签到。',
  },
  SESSION_NOT_CHECKINABLE: {
    tone: 'danger',
    title: '日程不可签到',
    detail: '当前日程状态不接受签到。',
  },
  STAFF_UNAUTHORIZED_FOR_ACTIVITY: {
    tone: 'danger',
    title: '工作人员未授权',
    detail: '当前 Authing 身份没有此活动的工作人员授权。',
  },
  AUTHENTICATION_REQUIRED: {
    tone: 'danger',
    title: '需要工作人员登录',
    detail: '请先完成 Authing 登录，或在开发构建中启用 dev auth 配置。',
  },
}

function timeRange(session: Session) {
  return `${session.start_time.slice(11, 16)} - ${session.end_time.slice(11, 16)}`
}

function outcomeLabel(value?: StaffCheckinOutcome) {
  if (value === 'duplicate') return '重复签到'
  if (value === 'success') return '签到成功'
  return value
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
  const [status, setStatus] = useState('加载日程中')
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
      setStatus('请先在首页选择活动')
      return
    }

    try {
      const rows = await loadSessions(activityId)
      setSessions(rows)
      const nextSessionId = selectedSessionId || rows[0]?.id || ''
      setSelectedSessionId(nextSessionId)
      setStatus(rows.length ? '工作人员签到已就绪' : '暂无可签到日程')
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
      setResult({ tone: 'idle', title: '已读取入场凭证', detail: '入场凭证内容仅用于提交签到，不在页面展示。' })
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
      setResult({ tone: 'danger', title: '未选择日程', detail: '请先选择一个日程。' })
      return
    }
    if (!qrToken.trim()) {
      setResult({ tone: 'danger', title: '缺少入场凭证', detail: '请扫码或粘贴入场凭证内容。' })
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
              detail: '该入场凭证已完成本日程签到，人数未重复增加。',
              outcome: response.outcome,
            }
          : {
              tone: 'success',
              title: '签到成功',
              detail: '签到已写入系统，并可通过实时服务更新人数。',
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

      setResult({ tone: 'danger', title: '签到失败', detail: error instanceof Error ? error.message : String(error) })
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
        <Text className='staff-topbar__title'>工作人员签到</Text>
        <Text className='staff-topbar__count'>{typeof count === 'number' ? count : '--'}</Text>
      </View>

      <View className='staff-status'>
        <Text className='staff-status__label'>{status}</Text>
        <Text className='staff-status__title'>{selectedSession?.title ?? '选择日程'}</Text>
        <Text className='staff-status__meta'>{selectedSession ? `${timeRange(selectedSession)} · ${selectedSession.room_name ?? selectedSession.venue_area ?? '活动场地'}` : '暂无日程'}</Text>
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
          {(result.code || result.outcome) && <Text className='result__code'>{result.code ?? outcomeLabel(result.outcome)}</Text>}
        </View>

        <View className='scan-panel__actions'>
          <Text className='scan-panel__button scan-panel__button--primary' onClick={() => void scan()}>扫码</Text>
          <Text className='scan-panel__button' onClick={() => void submit()}>提交</Text>
        </View>

        <Input
          className='token-input'
          password
          value={qrToken}
          placeholder='粘贴入场凭证内容'
          onInput={(event) => setQrToken(event.detail.value)}
        />
        <Text className='scan-panel__hint'>页面不显示原始凭证；提交后仅展示结果、错误码和人数。</Text>
      </View>
    </View>
  )
}
