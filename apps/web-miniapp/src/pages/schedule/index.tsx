import { useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { MyAgendaItem, Session } from '@eventos/contracts'
import { addMyAgenda, loadMyAgenda, loadSessions, resolveActivityId } from '../../utils/api'
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

export default function SchedulePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [agenda, setAgenda] = useState<MyAgendaItem[]>([])
  const [selected, setSelected] = useState<string>()
  const [activeDay, setActiveDay] = useState(ALL_DAYS)
  const [activeView, setActiveView] = useState<typeof VIEW_ALL | typeof VIEW_MY>(VIEW_ALL)
  const [status, setStatus] = useState('加载日程中')
  const loadRef = useRef<Promise<void> | null>(null)
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

    const request = (async () => {
      const resolvedActivityId = await resolveActivityId()
      if (!resolvedActivityId) {
        setStatus('请先在首页选择 Activity')
        return
      }
      try {
        const [rows, agendaRows] = await Promise.all([
          loadSessions(resolvedActivityId),
          loadMyAgenda(resolvedActivityId).catch(() => []),
        ])
        setSessions(rows)
        setAgenda(agendaRows)
        const nextDays = Array.from(new Set(rows.map(dayKey)))
        const nextActiveDay = activeDay === ALL_DAYS || nextDays.includes(activeDay) ? activeDay : ALL_DAYS
        setActiveDay(nextActiveDay)
        const nextRows = nextActiveDay === ALL_DAYS ? rows : rows.filter((item) => dayKey(item) === nextActiveDay)
        setSelected((current) => (current && nextRows.some((item) => item.id === current) ? current : nextRows[0]?.id))
        setStatus(rows.length ? '日程已加载' : '暂无 Session')
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
      Taro.showToast({ title: '已加入 My Agenda', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  return (
    <View className='page page--schedule'>
      <View className='mini-topbar'>
        <Text className='mini-topbar__back' onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>首页</Text>
        <Text className='mini-topbar__title'>Agenda</Text>
        <View className='mini-topbar__menu' onClick={() => Taro.switchTab({ url: '/pages/me/index' })}>
          <Text>Me</Text>
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
        <Text className='session-banner__sub'>{filteredSessions.length} 场 Session · {agenda.length} 场已加入 My Agenda</Text>
      </View>

      {selectedSession && (
        <View className='session-card session-card--spotlight'>
          <View className='session-card__head'>
            <Text className='session-card__headText'>{selectedSession.title}</Text>
            <Text className='session-card__headArrow'>{selectedSession.status}</Text>
          </View>
          <Text className='session-card__line'>活动时间 {timeRange(selectedSession)}</Text>
          <Text className='session-card__line'>会议地点 {selectedSession.room_name ?? selectedSession.venue_area ?? '待配置'}</Text>
          <Text className='session-card__line'>{selectedSession.description ?? 'Session detail'}</Text>
          <Text className='session-card__cta' onClick={() => add(selectedSession)}>
            {agendaSet.has(selectedSession.id) ? '已在 My Agenda' : '加入 My Agenda'}
          </Text>
          <Text className='session-card__staff' onClick={() => Taro.navigateTo({ url: `/pages/staff-checkin/index?sessionId=${selectedSession.id}` })}>
            Staff Check-in
          </Text>
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
              <Text className={`timeline__status${agendaSet.has(item.id) ? ' timeline__status--added' : ''}`}>{agendaSet.has(item.id) ? '已加入' : item.status}</Text>
            </View>
            <Text className='timeline__title'>{item.title}</Text>
            <Text className='timeline__meta'>{timeRange(item)} · {item.venue_area ?? 'Activity venue'}</Text>
            <Text
              className={`timeline__action${agendaSet.has(item.id) ? ' timeline__action--added' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                void add(item)
              }}
            >
              {agendaSet.has(item.id) ? '重复点击保持幂等' : '加入 My Agenda'}
            </Text>
          </View>
        ))}
        {visibleSessions.length === 0 && (
          <View className='timeline__empty'>
            <Text>当前筛选下暂无 Session</Text>
          </View>
        )}
      </View>
    </View>
  )
}
