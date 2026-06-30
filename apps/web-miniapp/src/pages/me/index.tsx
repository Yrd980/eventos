import { useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { BoothCollection, ExpoBooth, MyAgendaItem, Notification, Registration, Session, Survey } from '@eventos/contracts'
import {
  loadParticipantCenter,
  loadReferralCount,
  loadSurveys,
  removeMyBooth,
  removeMyAgenda,
  resolveActivityId,
  type QRPassView,
} from '../../utils/api'
import './index.css'

const tabs = ['参会二维码', '我的日程', '我的报名', '我的展位', '我的问卷']
const MAX_VISIBLE_ITEMS = 15

function timeRange(session: Session) {
  return `${session.start_time.slice(11, 16)} - ${session.end_time.slice(11, 16)}`
}

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    cancelled: '已取消',
    confirmed: '已确认',
    draft: '草稿',
    issued: '已签发',
    pending: '待确认',
    revoked: '已作废',
    self: '自己添加',
    system: '系统添加',
    waitlisted: '候补中',
  }
  return value ? labels[value] ?? value : '未加载'
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
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [referralCount, setReferralCount] = useState(0)
  const [status, setStatus] = useState('加载参与信息中')
  const loadRef = useRef<Promise<void> | null>(null)
  const loadedRef = useRef(false)
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])
  const boothById = useMemo(() => new Map(expoBooths.map((booth) => [booth.id, booth])), [expoBooths])
  const visibleAgenda = agenda.slice(0, MAX_VISIBLE_ITEMS)
  const visibleMyBooths = myBooths.slice(0, MAX_VISIBLE_ITEMS)
  const visibleNotifications = notifications.slice(0, MAX_VISIBLE_ITEMS)

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
        const state = await loadParticipantCenter(resolvedActivityId)
        setSessions(state.sessions)
        setAgenda(state.my_agenda)
        setExpoBooths(state.expo_booths)
        setMyBooths(state.my_booths)
        setNotifications(state.notifications)
        setRegistration(state.registration)
        setQRPass(state.qr_pass)

        const [surveyRows, referralResult] = await Promise.all([
          loadSurveys(resolvedActivityId).catch(() => []),
          loadReferralCount(resolvedActivityId).catch(() => ({ referral_count: 0 })),
        ])
        setSurveys(surveyRows)
        setReferralCount(referralResult.referral_count)

        setStatus('参与信息已加载')
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

  function shareToFriends() {
    Taro.showShareMenu({ withShareTicket: true })
  }

  function smartAddSchedule() {
    Taro.showToast({ title: '正在智能推荐日程...', icon: 'none' })
    Taro.switchTab({ url: '/pages/schedule/index' })
  }

  return (
    <View className='page page--me'>
      <View className='top-title'>
        <Text className='top-title__text'>我的</Text>
      </View>

      <View className='profile-hero'>
        <View className='profile-hero__left'>
          <Text className='profile-hero__label'>好友报名数</Text>
          <Text className='profile-hero__value'>{referralCount}</Text>
          <Text className='profile-hero__link' onClick={shareToFriends}>继续邀约</Text>
        </View>
        <View className='profile-hero__cta' onClick={smartAddSchedule}>
          一键智能添加日程
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

        {activeTab === 0 && (
          <View className='qr-card__body'>
            <Text className='qr-card__name'>{qrPass?.participant_id ? '参会二维码' : '暂无二维码'}</Text>
            <Text className='qr-card__org'>{registration ? statusLabel(registration.status) : '请先报名'}</Text>
            {qrPass ? (
              <>
                <View className='qr-code' />
                <Text className='qr-card__scan'>扫码签到</Text>
              </>
            ) : (
              <Text className='qr-card__bodyText'>确认报名后生成参会二维码</Text>
            )}
          </View>
        )}

        {activeTab === 1 && (
          <View className='qr-card__body'>
            <Text className='qr-card__name'>我的日程</Text>
            <Text className='qr-card__org'>{agenda.length} 个日程</Text>
            {agenda.length === 0 ? (
              <View className='qr-card__bodyEmpty'>
                <Text className='qr-card__bodyText'>还没有加入日程</Text>
                <View className='qr-card__bodyLine' />
                <Text className='qr-card__bodyHint'>去日程页添加</Text>
              </View>
            ) : (
              visibleAgenda.map((item) => {
                const session = sessionById.get(item.session_id)
                return (
                  <View key={item.id} className='plan-slot'>
                    <View className='plan-slot__time'>
                      <Text className='plan-slot__timeMain'>{session ? timeRange(session) : '日程'}</Text>
                      <Text className='plan-slot__timeSub'>{statusLabel(item.source)}</Text>
                    </View>
                    <View className='plan-slot__stack'>
                      <View className='plan-slot__item'>
                        <View className='plan-slot__itemTop'>
                          <Text className='plan-slot__title'>{session?.title ?? item.session_id}</Text>
                          <Text className='plan-slot__remove' onClick={() => remove(item.session_id)}>移除</Text>
                        </View>
                        <Text className='plan-slot__meta'>{session?.room_name ?? session?.venue_area ?? '活动场地'}</Text>
                      </View>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}

        {activeTab === 2 && (
          <View className='qr-card__body'>
            <Text className='qr-card__name'>我的报名</Text>
            <Text className='qr-card__org'>{registration ? statusLabel(registration.status) : '暂无报名'}</Text>
            <Text className='qr-card__bodyHint'>{registration?.id ?? '请先从首页报名'}</Text>
          </View>
        )}

        {activeTab === 3 && (
          <View className='qr-card__body'>
            <Text className='qr-card__name'>我的展位</Text>
            <Text className='qr-card__org'>{myBooths.length} 个展位</Text>
            {myBooths.length === 0 ? (
              <View className='qr-card__bodyEmpty'>
                <Text className='qr-card__bodyText'>还没有加入展位</Text>
                <View className='qr-card__bodyLine' />
                <Text className='qr-card__bodyHint'>去展区添加</Text>
              </View>
            ) : (
              visibleMyBooths.map((item) => {
                const booth = boothById.get(item.expo_booth_id)
                return (
                  <View key={item.id} className='message-row'>
                    <Text className='message-row__title'>{booth?.name ?? item.expo_booth_id}</Text>
                    <Text className='message-row__meta'>{booth?.location ?? booth?.category ?? '展位'}</Text>
                    <Text className='plan-slot__remove' onClick={() => removeBooth(item.expo_booth_id)}>移除</Text>
                  </View>
                )
              })
            )}
          </View>
        )}

        {activeTab === 4 && (
          <View className='qr-card__body'>
            <Text className='qr-card__name'>我的问卷</Text>
            <Text className='qr-card__org'>{surveys.length} 个问卷</Text>
            {surveys.length === 0 ? (
              <View className='qr-card__bodyEmpty'>
                <Text className='qr-card__bodyText'>暂无问卷</Text>
                <View className='qr-card__bodyLine' />
                <Text className='qr-card__bodyHint'>问卷将在活动期间开放</Text>
              </View>
            ) : (
              surveys.map((survey) => (
                <View key={survey.id} className='message-row'>
                  <Text className='message-row__title'>{survey.title}</Text>
                  <Text className='message-row__meta'>{survey.description ?? '活动问卷'}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  )
}
