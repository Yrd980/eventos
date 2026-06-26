import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { MyAgendaItem, Session } from '@eventos/contracts'
import { addMyAgenda, getStoredActivityId, loadMyAgenda, loadSessions } from '../../utils/api'
import './index.css'

function timeRange(session: Session) {
  return `${session.start_time.slice(11, 16)} - ${session.end_time.slice(11, 16)}`
}

export default function SchedulePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [agenda, setAgenda] = useState<MyAgendaItem[]>([])
  const [selected, setSelected] = useState<string>()
  const [status, setStatus] = useState('加载日程中')
  const activityId = getStoredActivityId()
  const selectedSession = sessions.find((item) => item.id === selected) ?? sessions[0]
  const agendaSet = useMemo(() => new Set(agenda.map((item) => item.session_id)), [agenda])

  async function load() {
    if (!activityId) {
      setStatus('请先在首页选择 Activity')
      return
    }
    try {
      const rows = await loadSessions(activityId)
      setSessions(rows)
      setSelected(rows[0]?.id)
      setStatus(rows.length ? '日程已加载' : '暂无 Session')
      try {
        setAgenda(await loadMyAgenda(activityId))
      } catch {
        setAgenda([])
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void load()
  }, [])

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
        <Text className='seg__item seg__item--active'>全部日程</Text>
        <Text className='seg__item' onClick={() => Taro.switchTab({ url: '/pages/me/index' })}>My Agenda</Text>
      </View>

      <View className='session-banner'>
        <Text className='session-banner__title'>{status}</Text>
        <Text className='session-banner__sub'>从 API/published Activity 读取 Sessions，加入 My Agenda 会写回 Postgres。</Text>
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
        {sessions.map((item) => (
          <View key={item.id} className={`timeline__item${item.id === selected ? ' timeline__item--active' : ''}`} onClick={() => setSelected(item.id)}>
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
      </View>
    </View>
  )
}
