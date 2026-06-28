import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { BoothCollection, ExpoBooth, MyAgendaItem, Notification, QRPass, Registration, Session } from '@eventos/contracts'
import {
  loadExpoBooths,
  loadMyAgenda,
  loadMyBooths,
  loadNotifications,
  loadQRPass,
  loadRegistration,
  loadSessions,
  removeMyBooth,
  removeMyAgenda,
  resolveActivityId,
  type QRPassView,
} from '../../utils/api'
import './index.css'

const tabs = ['Overview', 'QR Pass', 'My Agenda', 'My Booths', 'Registration', 'Messages']
const MAX_VISIBLE_ITEMS = 15

function timeRange(session: Session) {
  return `${session.start_time.slice(11, 16)} - ${session.end_time.slice(11, 16)}`
}

export default function MePage() {
  const [activeTab, setActiveTab] = useState(0)
  const [registration, setRegistration] = useState<Registration>()
  const [qrPass, setQRPass] = useState<QRPassView>()
  const [agenda, setAgenda] = useState<MyAgendaItem[]>([])
  const [myBooths, setMyBooths] = useState<BoothCollection[]>([])
  const [expoBooths, setExpoBooths] = useState<ExpoBooth[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [status, setStatus] = useState('加载参与信息中')
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])
  const boothById = useMemo(() => new Map(expoBooths.map((booth) => [booth.id, booth])), [expoBooths])
  const visibleAgenda = agenda.slice(0, MAX_VISIBLE_ITEMS)
  const visibleMyBooths = myBooths.slice(0, MAX_VISIBLE_ITEMS)
  const visibleNotifications = notifications.slice(0, MAX_VISIBLE_ITEMS)

  async function load() {
    const resolvedActivityId = await resolveActivityId()
    if (!resolvedActivityId) {
      setStatus('请先在首页选择 Activity')
      return
    }
    try {
      const [sessionRows, agendaRows, boothRows, myBoothRows] = await Promise.all([
        loadSessions(resolvedActivityId).catch(() => []),
        loadMyAgenda(resolvedActivityId).catch(() => []),
        loadExpoBooths(resolvedActivityId).catch(() => []),
        loadMyBooths(resolvedActivityId).catch(() => []),
      ])
      setSessions(sessionRows)
      setAgenda(agendaRows)
      setExpoBooths(boothRows)
      setMyBooths(myBoothRows)
      setStatus('参与信息已加载')
      void loadNotifications(resolvedActivityId).then(setNotifications).catch(() => setNotifications([]))
      void loadRegistration(resolvedActivityId).then(setRegistration).catch(() => setRegistration(undefined))
      void loadQRPass(resolvedActivityId).then(setQRPass).catch(() => setQRPass(undefined))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  Taro.useDidShow(() => {
    void load()
  })

  async function remove(sessionId: string) {
    try {
      await removeMyAgenda(sessionId)
      setAgenda((current) => current.filter((item) => item.session_id !== sessionId))
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  async function removeBooth(expoBoothId: string) {
    try {
      await removeMyBooth(expoBoothId)
      setMyBooths((current) => current.filter((item) => item.expo_booth_id !== expoBoothId))
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
          <Text className='profile-hero__value'>{agenda.length} / {myBooths.length}</Text>
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
            <Text className='qr-card__bodyHint'>My Agenda {agenda.length} · My Booths {myBooths.length}</Text>
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
            {myBooths.length === 0 ? (
              <View className='qr-card__bodyEmpty'>
                <Text className='qr-card__bodyText'>还没有加入 Expo Booth</Text>
                <View className='qr-card__bodyLine' />
                <Text className='qr-card__bodyHint'>去 Expo 添加 My Booths</Text>
              </View>
            ) : (
              visibleMyBooths.map((item) => {
                const booth = boothById.get(item.expo_booth_id)
                return (
                  <View key={item.id} className='message-row'>
                    <Text className='message-row__title'>{booth?.name ?? item.expo_booth_id}</Text>
                    <Text className='message-row__meta'>{booth?.location ?? booth?.category ?? 'Expo Booth'}</Text>
                    <Text className='plan-slot__remove' onClick={() => removeBooth(item.expo_booth_id)}>移除</Text>
                  </View>
                )
              })
            )}
          </View>
        )}

        {activeTab === 4 && (
          <View className='qr-card__body'>
            <Text className='qr-card__bodyText'>{registration?.status ?? 'No Registration'}</Text>
            <View className='qr-card__bodyLine' />
            <Text className='qr-card__bodyHint'>{registration?.id ?? 'Register from Home first'}</Text>
          </View>
        )}

        {activeTab === 5 && (
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
