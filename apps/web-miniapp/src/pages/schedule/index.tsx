import { useMemo, useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { LiveEntry, MyAgendaItem, Session, SessionSpeaker, Speaker, Survey } from '@eventos/contracts'
import {
  addMyAgenda,
  loadMyAgenda,
  loadSessionLiveEntries,
  loadSessionSpeakers,
  loadSessionSurveys,
  loadSessions,
  loadSpeakers,
  resolveActivityId,
} from '../../utils/api'
import './index.css'

function timeRange(session: Session) {
  return `${session.start_time.slice(11, 16)} - ${session.end_time.slice(11, 16)}`
}

const MAX_VISIBLE_SESSIONS = 20
const ALL_DAYS = 'all'
const VIEW_ALL = 'all'
const VIEW_MY = 'my'

function dayKey(session: Session) {
  return session.start_time.slice(0, 10)
}

function dayLabel(value: string) {
  return value.slice(5).replace('-', '.')
}

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    scheduled: '已排期',
    hidden: '隐藏',
    cancelled: '已取消',
    published: '已发布',
  }
  return value ? labels[value] ?? value : '未设置'
}

export default function SchedulePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [agenda, setAgenda] = useState<MyAgendaItem[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [sessionSpeakersMap, setSessionSpeakersMap] = useState<Record<string, SessionSpeaker[]>>({})
  const [sessionLiveEntries, setSessionLiveEntries] = useState<Record<string, LiveEntry[]>>({})
  const [sessionSurveys, setSessionSurveys] = useState<Record<string, Survey[]>>({})
  const [selected, setSelected] = useState<string>()
  const [activeDay, setActiveDay] = useState(ALL_DAYS)
  const [activeView, setActiveView] = useState<typeof VIEW_ALL | typeof VIEW_MY>(VIEW_ALL)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [status, setStatus] = useState('加载日程中')
  const loadRef = useRef<Promise<void> | null>(null)
  const loadedRef = useRef(false)
  const days = useMemo(() => Array.from(new Set(sessions.map(dayKey))), [sessions])
  const agendaSet = useMemo(() => new Set(agenda.map((item) => item.session_id)), [agenda])
  const filteredSessions = useMemo(() => {
    const byView = activeView === VIEW_MY ? sessions.filter((item) => agendaSet.has(item.id)) : sessions
    return activeDay === ALL_DAYS ? byView : byView.filter((item) => dayKey(item) === activeDay)
  }, [activeDay, activeView, agendaSet, sessions])
  const selectedSession = filteredSessions.find((item) => item.id === selected) ?? filteredSessions[0]
  const visibleSessions = filteredSessions.slice(0, MAX_VISIBLE_SESSIONS)

  async function load() {
    if (loadRef.current) return loadRef.current
    if (loadedRef.current) return

    const request = (async () => {
      const resolvedActivityId = await resolveActivityId()
      if (!resolvedActivityId) {
        setStatus('请先在首页选择活动')
        return
      }
      try {
        const [rows, agendaRows, speakerRows] = await Promise.all([
          loadSessions(resolvedActivityId),
          loadMyAgenda(resolvedActivityId).catch(() => []),
          loadSpeakers(resolvedActivityId).catch(() => []),
        ])
        setSessions(rows)
        setAgenda(agendaRows)
        setSpeakers(speakerRows)

        const sessionSpeakersResult: Record<string, SessionSpeaker[]> = {}
        const liveMap: Record<string, LiveEntry[]> = {}
        const surveyMap: Record<string, Survey[]> = {}
        for (const session of rows.slice(0, 10)) {
          try {
            sessionSpeakersResult[session.id] = await loadSessionSpeakers(session.id)
          } catch { /* ignore */ }
          try {
            liveMap[session.id] = await loadSessionLiveEntries(session.id)
          } catch { /* ignore */ }
          try {
            surveyMap[session.id] = await loadSessionSurveys(session.id)
          } catch { /* ignore */ }
        }
        setSessionSpeakersMap(sessionSpeakersResult)
        setSessionLiveEntries(liveMap)
        setSessionSurveys(surveyMap)
        const nextDays = Array.from(new Set(rows.map(dayKey)))
        const nextActiveDay = activeDay === ALL_DAYS || nextDays.includes(activeDay) ? activeDay : ALL_DAYS
        setActiveDay(nextActiveDay)
        const nextRows = nextActiveDay === ALL_DAYS ? rows : rows.filter((item) => dayKey(item) === nextActiveDay)
        setSelected((current) => (current && nextRows.some((item) => item.id === current) ? current : nextRows[0]?.id))
        setStatus(rows.length ? '日程已加载' : '暂无日程')
        loadedRef.current = true
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })()

    loadRef.current = request
    try {
      await request
    } finally {
      if (loadRef.current === request) loadRef.current = null
    }
  }

  Taro.useDidShow(() => {
    void load()
  })

  async function add(session: Session) {
    try {
      const item = await addMyAgenda(session.id)
      setAgenda((current) => (current.some((existing) => existing.session_id === item.session_id) ? current : [...current, item]))
      Taro.showToast({ title: '已加入我的日程', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  function watchOnline(sessionId: string) {
    const entries = sessionLiveEntries[sessionId]
    if (entries && entries.length > 0) {
      const entry = entries[0]
      if (entry.url) {
        Taro.setClipboardData({ data: entry.url })
        Taro.showToast({ title: '直播链接已复制', icon: 'none' })
      } else {
        Taro.showToast({ title: '暂无直播链接', icon: 'none' })
      }
    } else {
      Taro.showToast({ title: '暂无线上观看入口', icon: 'none' })
    }
  }

  function openSurvey(sessionId: string) {
    const surveys = sessionSurveys[sessionId]
    if (surveys && surveys.length > 0) {
      Taro.switchTab({ url: '/pages/assistant/index' })
    } else {
      Taro.showToast({ title: '暂无问卷', icon: 'none' })
    }
  }

  function addManualSchedule() {
    if (!manualTitle.trim()) {
      Taro.showToast({ title: '请输入日程标题', icon: 'none' })
      return
    }
    Taro.showToast({ title: `已添加: ${manualTitle}`, icon: 'none' })
    setShowManualAdd(false)
    setManualTitle('')
  }

  return (
    <View className='page page--schedule'>
      <View className='mini-topbar'>
        <Text className='mini-topbar__back' onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>首页</Text>
        <Text className='mini-topbar__title'>日程</Text>
        <View className='mini-topbar__menu' onClick={() => Taro.switchTab({ url: '/pages/me/index' })}>
          <Text>我的</Text>
        </View>
      </View>

      <View className='seg'>
        <Text className={`seg__item${activeView === VIEW_ALL ? ' seg__item--active' : ''}`} onClick={() => setActiveView(VIEW_ALL)}>全部日程</Text>
        <Text className={`seg__item${activeView === VIEW_MY ? ' seg__item--active' : ''}`} onClick={() => setActiveView(VIEW_MY)}>我的日程</Text>
      </View>

      {days.length > 1 && (
        <View className='filter-strip'>
          <Text className={`filter-chip${activeDay === ALL_DAYS ? ' filter-chip--active' : ''}`} onClick={() => setActiveDay(ALL_DAYS)}>全部</Text>
          {days.map((item) => (
            <Text
              key={item}
              className={`filter-chip${item === activeDay ? ' filter-chip--active' : ''}`}
              onClick={() => {
                setActiveDay(item)
                const first = sessions.find((session) => dayKey(session) === item)
                setSelected(first?.id)
              }}
            >
              {dayLabel(item)}
            </Text>
          ))}
        </View>
      )}

      <View className='session-banner'>
        <Text className='session-banner__title'>{status}</Text>
        <Text className='session-banner__sub'>{filteredSessions.length} 场日程 · {agenda.length} 场已加入我的日程</Text>
      </View>

      {activeView === VIEW_MY && (
        <View className='my-agenda-banner'>
          <Text className='my-agenda-banner__icon'>📋</Text>
          <Text className='my-agenda-banner__text'>精彩议程陆续上新中!</Text>
          <Text className='my-agenda-banner__hint'>已收藏的日程会自动同步更新，敬请期待。</Text>
        </View>
      )}

      {selectedSession && (
        <View className='session-card session-card--spotlight'>
          <View className='session-card__head'>
            <Text className='session-card__headText'>{selectedSession.title}</Text>
            <Text className='session-card__headArrow'>{statusLabel(selectedSession.status)}</Text>
          </View>
          <Text className='session-card__line'>活动时间 {timeRange(selectedSession)}</Text>
          <Text className='session-card__line'>会议地点 {selectedSession.room_name ?? selectedSession.venue_area ?? '待配置'}</Text>
          {sessionSpeakersMap[selectedSession.id]?.length > 0 && (
            <Text className='session-card__speakers'>
              演讲者: {sessionSpeakersMap[selectedSession.id].map((ss) => speakers.find((s) => s.id === ss.speaker_id)?.name ?? ss.speaker_id).join(', ')}
            </Text>
          )}
          <Text className='session-card__line'>{selectedSession.description ?? '暂无日程详情'}</Text>
          <View className='session-card__actions'>
            <Text className='session-card__cta' onClick={() => add(selectedSession)}>
              {agendaSet.has(selectedSession.id) ? '已在我的日程' : '+ 日程'}
            </Text>
            {sessionLiveEntries[selectedSession.id]?.length > 0 && (
              <Text className='session-card__cta session-card__cta--secondary' onClick={() => watchOnline(selectedSession.id)}>
                线上观看
              </Text>
            )}
            {sessionSurveys[selectedSession.id]?.length > 0 && (
              <Text className='session-card__cta session-card__cta--secondary' onClick={() => openSurvey(selectedSession.id)}>
                问卷
              </Text>
            )}
          </View>
        </View>
      )}

      <View className='timeline'>
        {visibleSessions.map((item) => (
          <View
            key={item.id}
            className={`timeline__item${item.id === selected ? ' timeline__item--active' : ''}`}
            onClick={() => {
              if (item.id !== selected) setSelected(item.id)
            }}
          >
            <View className='timeline__head'>
              <Text className='timeline__tag'>{item.room_name ?? item.timezone}</Text>
              <Text className={`timeline__status${agendaSet.has(item.id) ? ' timeline__status--added' : ''}`}>{agendaSet.has(item.id) ? '已加入' : statusLabel(item.status)}</Text>
            </View>
            <Text className='timeline__title'>{item.title}</Text>
            <Text className='timeline__meta'>{timeRange(item)} · {item.venue_area ?? '活动场地'}</Text>
            {sessionSpeakersMap[item.id]?.length > 0 && (
              <Text className='timeline__speakers'>
                {sessionSpeakersMap[item.id].map((ss) => speakers.find((s) => s.id === ss.speaker_id)?.name ?? ss.speaker_id).join(', ')}
              </Text>
            )}
            <View className='timeline__actions'>
              <Text
                className={`timeline__action${agendaSet.has(item.id) ? ' timeline__action--added' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  void add(item)
                }}
              >
                {agendaSet.has(item.id) ? '已加入' : '+ 日程'}
              </Text>
              {sessionLiveEntries[item.id]?.length > 0 && (
                <Text className='timeline__action' onClick={(event) => {
                  event.stopPropagation()
                  watchOnline(item.id)
                }}>
                  线上观看
                </Text>
              )}
              {sessionSurveys[item.id]?.length > 0 && (
                <Text className='timeline__action' onClick={(event) => {
                  event.stopPropagation()
                  openSurvey(item.id)
                }}>
                  问卷
                </Text>
              )}
            </View>
          </View>
        ))}
        {visibleSessions.length === 0 && (
          <View className='timeline__empty'>
            <Text>当前筛选下暂无日程</Text>
          </View>
        )}
      </View>

      {activeView === VIEW_MY && (
        <View className='manual-add-fab' onClick={() => setShowManualAdd(true)}>
          <Text className='manual-add-fab__text'>+</Text>
        </View>
      )}

      {showManualAdd && (
        <View className='manual-add-modal'>
          <View className='manual-add-modal__overlay' onClick={() => setShowManualAdd(false)} />
          <View className='manual-add-modal__content'>
            <Text className='manual-add-modal__title'>手动添加日程</Text>
            <View className='manual-add-modal__field'>
              <Text className='manual-add-modal__label'>日程标题</Text>
              <Input
                className='manual-add-modal__input'
                value={manualTitle}
                placeholder='请输入日程标题'
                onInput={(e) => setManualTitle(e.detail.value)}
              />
            </View>
            <View className='manual-add-modal__actions'>
              <Text className='manual-add-modal__cancel' onClick={() => setShowManualAdd(false)}>取消</Text>
              <Text className='manual-add-modal__confirm' onClick={addManualSchedule}>添加</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
