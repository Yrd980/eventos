import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Activity, ActivityPublication, Notification, Speaker } from '@eventos/contracts'
import {
  getStoredActivityId,
  hasAuthingSession,
  loadActivities,
  loadActivity,
  loadNotifications,
  loadPublication,
  loadSpeakers,
  setStoredActivityId,
} from '../../utils/api'
import './index.css'

function formatActivityDate(value?: string) {
  if (!value) return '时间待公布'
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export default function Index() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [activity, setActivity] = useState<Activity>()
  const [publication, setPublication] = useState<ActivityPublication>()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [currentSpeakerIndex, setCurrentSpeakerIndex] = useState(0)
  const [status, setStatus] = useState('加载活动中')

  async function loadParticipantResources(activityId: string) {
    const [published] = await Promise.all([
      loadPublication(activityId).then((value) => {
        setPublication(value)
        return value
      }).catch(() => undefined),
      loadNotifications(activityId).then(setNotifications).catch(() => setNotifications([])),
      loadSpeakers(activityId).then(setSpeakers).catch(() => setSpeakers([])),
    ])
    if (published) setStatus(`已恢复发布版本 v${published.version}`)
  }

  async function load() {
    try {
      const storedId = getStoredActivityId()
      if (storedId) {
        const detail = await loadActivity(storedId)
        setActivity(detail)
        setStatus(detail.status === 'archived' ? '活动已归档，只读开放' : '活动已加载')
        await loadParticipantResources(detail.id)
        return
      }
      const rows = await loadActivities()
      setActivities(rows)
      setActivity(rows[0])
      if (rows[0]) setStoredActivityId(rows[0].id)
      if (rows[0]) await loadParticipantResources(rows[0].id)
      setStatus(rows.length ? '请选择活动' : '暂无可访问活动')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (speakers.length <= 1) return
    const timer = setInterval(() => {
      setCurrentSpeakerIndex((prev) => (prev + 1) % speakers.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [speakers.length])

  const goSchedule = () => Taro.switchTab({ url: '/pages/schedule/index' })
  const goAssistant = () => Taro.switchTab({ url: '/pages/assistant/index' })
  const goExpo = () => Taro.switchTab({ url: '/pages/expo/index' })
  const goMe = () => Taro.switchTab({ url: '/pages/me/index' })
  const goRegister = () => {
    if (!hasAuthingSession()) {
      Taro.showToast({ title: '需要 Authing token', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: '/pages/register/index' })
  }

  const shareToFriends = () => {
    Taro.showShareMenu({ withShareTicket: true })
  }

  const handleAIInput = () => {
    goAssistant()
  }

  return (
    <View className='page page--home'>
      <View className='home-head'>
        <View>
          <Text className='home-head__label'>活动模板</Text>
          <Text className='home-head__title'>活动首页</Text>
        </View>
        <View className='home-head__share' onClick={shareToFriends}>
          <Text className='home-head__shareText'>分享好友</Text>
        </View>
      </View>

      {activities.length > 1 && (
        <View className='activity-switcher'>
          {activities.map((item) => (
            <Text
              key={item.id}
              className={`activity-switcher__item${item.id === activity?.id ? ' activity-switcher__item--active' : ''}`}
              onClick={() => {
                setActivity(item)
                setStoredActivityId(item.id)
                void loadParticipantResources(item.id)
              }}
            >
              {item.name}
            </Text>
          ))}
        </View>
      )}

      {speakers.length > 0 && (
        <View className='speaker-carousel'>
          <View className='speaker-card'>
            <View className='speaker-card__avatar'>
              {speakers[currentSpeakerIndex]?.avatar_url ? (
                <Text className='speaker-card__avatarText'>🎤</Text>
              ) : (
                <Text className='speaker-card__avatarText'>🎤</Text>
              )}
            </View>
            <View className='speaker-card__info'>
              <Text className='speaker-card__name'>{speakers[currentSpeakerIndex]?.name}</Text>
              <Text className='speaker-card__title'>{speakers[currentSpeakerIndex]?.title ?? speakers[currentSpeakerIndex]?.organization}</Text>
            </View>
          </View>
          <View className='speaker-dots'>
            {speakers.slice(0, 5).map((_, index) => (
              <View
                key={index}
                className={`speaker-dots__dot${index === currentSpeakerIndex ? ' speaker-dots__dot--active' : ''}`}
              />
            ))}
          </View>
        </View>
      )}

      <View className='activity-hero'>
        <View className='activity-hero__top'>
          <View className={`activity-hero__badge${activity?.status === 'archived' ? ' activity-hero__badge--archived' : ''}`}>
            {activity?.status === 'archived' ? '已归档' : '开放中'}
          </View>
          <Text className='activity-hero__date'>{formatActivityDate(activity?.start_time)} - {formatActivityDate(activity?.end_time)}</Text>
        </View>
        <Text className='activity-hero__title'>{activity?.name ?? '活动名称待配置'}</Text>
        <Text className='activity-hero__desc'>{activity?.description ?? '活动简介、亮点和报名说明将在发布后展示。'}</Text>
        <Text className='activity-hero__meta'>{activity?.venue.venue_name ?? activity?.venue.city ?? '地点待公布'}</Text>
        <View className='activity-hero__actions'>
          <View className='activity-hero__register' onClick={goRegister}>
            {activity?.status === 'archived' ? '查看报名信息' : '立即免费报名'}
          </View>
        </View>
        <View className='activity-hero__download' onClick={() => Taro.showToast({ title: '白皮书即将上线', icon: 'none' })}>
          <Text className='activity-hero__downloadText'>白皮书下载</Text>
        </View>
      </View>

      <View className='status-row'>
        <Text>{status}</Text>
        {publication && <Text>已发布 v{publication.version}</Text>}
      </View>

      <View className='action-grid'>
        <View className='action-card' onClick={goSchedule}>
          <Text className='action-card__title'>日程</Text>
          <Text className='action-card__meta'>查看全部日程和我的日程</Text>
        </View>
        <View className='action-card' onClick={goExpo}>
          <Text className='action-card__title'>展区</Text>
          <Text className='action-card__meta'>查看展位、赞助商和现场导览</Text>
        </View>
        <View className='action-card' onClick={goMe}>
          <Text className='action-card__title'>我的</Text>
          <Text className='action-card__meta'>入场凭证、报名和个人日程</Text>
        </View>
        <View className='action-card' onClick={goAssistant}>
          <Text className='action-card__title'>AI 助手</Text>
          <Text className='action-card__meta'>咨询日程、展区和参会信息</Text>
        </View>
      </View>

      {notifications.length > 0 && (
        <View className='resource-section'>
          <View className='section-head'>
            <Text className='resource-section__title'>活动通知</Text>
          </View>
          <View className='resource-divider' />
          {notifications.slice(0, 3).map((item) => (
            <View key={item.id} className='resource-row'>
              <Text className='resource-row__title'>{item.title}</Text>
              <Text className='resource-row__meta'>{item.content}</Text>
            </View>
          ))}
        </View>
      )}

      <View className='home-ai-input' onClick={handleAIInput}>
        <Text className='home-ai-input__placeholder'>请帮我报名</Text>
        <View className='home-ai-input__send'>
          <Text>➤</Text>
        </View>
      </View>
    </View>
  )
}
