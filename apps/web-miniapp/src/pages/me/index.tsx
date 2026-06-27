import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { MyAgendaItem, Notification, QRPass, Registration, Session } from '@eventos/contracts'
import { loadMyAgenda, loadNotifications, loadQRPass, loadRegistration, loadSessions, removeMyAgenda, resolveActivityId, type QRPassView } from '../../utils/api'
import './index.css'

const tabs = ['Overview', 'QR Pass', 'My Agenda', 'Registration', 'Messages']
const MAX_VISIBLE_ITEMS = 15

function timeRange(session: Session) {
  return `${session.start_time.slice(11, 16)} - ${session.end_time.slice(11, 16)}`
}

export default function MePage() {
  const [activeTab, setActiveTab] = useState(0)
  const [registration, setRegistration] = useState<Registration>()
  const [qrPass, setQRPass] = useState<QRPassView>()
  const [agenda, setAgenda] = useState<MyAgendaItem[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [status, setStatus] = useState('加载参与信息中')
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])
  const visibleAgenda = agenda.slice(0, MAX_VISIBLE_ITEMS)
  const visibleNotifications = notifications.slice(0, MAX_VISIBLE_ITEMS)

  async function load() {
    const activityId = await resolveActivityId()
    if (!activityId) {
      setStatus('请先在首页选择 Activity')
      return
    }
    try {
      const [sessionRows, agendaRows, messageRows] = await Promise.all([
        loadSessions(activityId).catch(() => []),
        loadMyAgenda(activityId).catch(() => []),
        loadNotifications(activityId).catch(() => []),
      ])
      setSessions(sessionRows)
      setAgenda(agendaRows)
      setNotifications(messageRows)
      setStatus('参与信息已加载')
      void loadRegistration(activityId).then(setRegistration).catch(() => setRegistration(undefined))
      void loadQRPass(activityId).then(setQRPass).catch(() => setQRPass(undefined))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function remove(sessionId: string) {
    try {
      await removeMyAgenda(sessionId)
      setAgenda((current) => current.filter((item) => item.session_id !== sessionId))
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  return (
    <View className='page page--me'>
      <View className='top-title'>
        <Text className='top-title__text'>Me</Text>
        <View className='top-title__menu' onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
          <Text>Home</Text>
        </View>
      </View>

      <View className='profile-hero'>
        <View className='profile-hero__left'>
          <Text className='profile-hero__label'>{status}</Text>
          <Text className='profile-hero__value'>{agenda.length} 场</Text>
          <Text className='profile-hero__link'>Registration: {registration?.status ?? 'not loaded'}</Text>
        </View>
        <View className='profile-hero__cta' onClick={() => Taro.switchTab({ url: '/pages/schedule/index' })}>
          去选日程
        </View>
      </View>

      <View className='tabs'>
        {tabs.map((item, index) => (
          <Text
            key={item}
            className={`tabs__item${index === activeTab ? ' tabs__item--active' : ''}`}
            onClick={() => {
              if (index !== activeTab) setActiveTab(index)
            }}
          >
            {item}
          </Text>
        ))}
      </View>

      <View className='qr-card'>
        <View className='qr-card__top' />
        <Text className='qr-card__name'>{tabs[activeTab]}</Text>
        <Text className='qr-card__org'>Activity-scoped participant facts from Event OS</Text>

        {activeTab === 0 && (
          <View className='qr-card__body'>
            <Text className='qr-card__bodyText'>{registration ? `Registration ${registration.status}` : 'No Registration'}</Text>
            <View className='qr-card__bodyLine' />
            <Text className='qr-card__bodyHint'>{qrPass ? `QR Pass ${qrPass.status}` : 'QR Pass requires confirmed Registration'}</Text>
          </View>
        )}

        {activeTab === 1 && (
          <View className='qr-card__body'>
            {qrPass ? (
              <>
                <View className='qr-code' />
                <Text className='qr-card__scan'>Token fingerprint stored only on server</Text>
                <Text className='qr-card__bodyHint'>{(qrPass as QRPass).issued_at}</Text>
              </>
            ) : (
              <Text className='qr-card__bodyText'>No active QR Pass</Text>
            )}
          </View>
        )}

        {activeTab === 2 && (
          <View className='qr-card__body'>
            {agenda.length === 0 ? (
              <View className='qr-card__bodyEmpty'>
                <Text className='qr-card__bodyText'>还没有加入 Session</Text>
                <View className='qr-card__bodyLine' />
                <Text className='qr-card__bodyHint'>去 Agenda 添加</Text>
              </View>
            ) : (
              visibleAgenda.map((item) => {
                const session = sessionById.get(item.session_id)
                return (
                  <View key={item.id} className='plan-slot'>
                    <View className='plan-slot__time'>
                      <Text className='plan-slot__timeMain'>{session ? timeRange(session) : 'Session'}</Text>
                      <Text className='plan-slot__timeSub'>{item.source}</Text>
                    </View>
                    <View className='plan-slot__stack'>
                      <View className='plan-slot__item'>
                        <View className='plan-slot__itemTop'>
                          <Text className='plan-slot__title'>{session?.title ?? item.session_id}</Text>
                          <Text className='plan-slot__remove' onClick={() => remove(item.session_id)}>移除</Text>
                        </View>
                        <Text className='plan-slot__meta'>{session?.room_name ?? session?.venue_area ?? 'Activity venue'}</Text>
                      </View>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}

        {activeTab === 3 && (
          <View className='qr-card__body'>
            <Text className='qr-card__bodyText'>{registration?.status ?? 'No Registration'}</Text>
            <View className='qr-card__bodyLine' />
            <Text className='qr-card__bodyHint'>{registration?.id ?? 'Register from Home first'}</Text>
          </View>
        )}

        {activeTab === 4 && (
          <View className='qr-card__body'>
            {notifications.length === 0 ? (
              <Text className='qr-card__bodyText'>No messages</Text>
            ) : (
              visibleNotifications.map((item) => (
                <View key={item.id} className='message-row'>
                  <Text className='message-row__title'>{item.title}</Text>
                  <Text className='message-row__meta'>{item.content}</Text>
                  <Text className='message-row__time'>{item.scheduled_at ?? item.created_at}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  )
}
