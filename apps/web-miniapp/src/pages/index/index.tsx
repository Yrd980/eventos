import { useEffect, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Activity, ActivityPublication, Notification, RegistrationForm } from '@eventos/contracts'
import {
  getApiBaseUrl,
  getAuthingToken,
  getStoredActivityId,
  loadActivities,
  loadActivity,
  loadNotifications,
  loadPublication,
  loadRegistrationForm,
  register,
  setApiBaseUrl,
  setAuthingToken,
  setStoredActivityId,
  submitRegistrationForm,
} from '../../utils/api'
import './index.css'

export default function Index() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [activity, setActivity] = useState<Activity>()
  const [publication, setPublication] = useState<ActivityPublication>()
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [formAnswers, setFormAnswers] = useState<Record<string, string>>({})
  const [apiBase, setApiBase] = useState(() => getApiBaseUrl())
  const [token, setToken] = useState(() => getAuthingToken())
  const [status, setStatus] = useState('加载活动中')

  async function loadParticipantResources(activityId: string) {
    const [published] = await Promise.all([
      loadPublication(activityId).then((value) => {
        setPublication(value)
        return value
      }).catch(() => undefined),
      loadRegistrationForm(activityId).then(setRegistrationForm).catch(() => setRegistrationForm(undefined)),
      loadNotifications(activityId).then(setNotifications).catch(() => setNotifications([])),
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

  const goSchedule = () => Taro.switchTab({ url: '/pages/schedule/index' })
  const goAssistant = () => Taro.switchTab({ url: '/pages/assistant/index' })

  async function submitRegistration() {
    if (!activity) return
    if (!token) {
      Taro.showToast({ title: '需要 Authing token', icon: 'none' })
      return
    }
    try {
      await register(activity.id)
      Taro.showToast({ title: '报名已确认', icon: 'none' })
      Taro.switchTab({ url: '/pages/me/index' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  async function submitCurrentForm() {
    if (!activity || !registrationForm) return
    if (!token) {
      Taro.showToast({ title: '需要 Authing token', icon: 'none' })
      return
    }
    const typedAnswers = registrationForm.fields.reduce<Record<string, unknown>>((current, field) => {
      const value = formAnswers[field.key]
      if (value === undefined || value === '') return current
      if (field.type === 'boolean') current[field.key] = value === 'true'
      else if (field.type === 'multi_select') current[field.key] = value.split(',').filter(Boolean)
      else current[field.key] = value
      return current
    }, {})
    try {
      await submitRegistrationForm(activity.id, typedAnswers)
      Taro.showToast({ title: '报名表已提交', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  return (
    <View className='page page--home'>
      <View className='mini-topbar'>
        <Text className='mini-topbar__back' onClick={goSchedule}>日程</Text>
        <Text className='mini-topbar__title'>Activity Home</Text>
        <View className='mini-topbar__menu' onClick={goAssistant}>
          <Text>AI</Text>
        </View>
      </View>

      <View className='config-panel'>
        <Input value={apiBase} placeholder='API base URL' onInput={(event) => setApiBase(event.detail.value)} />
        <Input value={token} placeholder='Authing bearer token' onInput={(event) => setToken(event.detail.value)} />
        <View
          className='config-panel__button'
          onClick={() => {
            setApiBaseUrl(apiBase)
            setAuthingToken(token)
            void load()
          }}
        >
          保存并刷新
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

      <View className='activity-hero'>
        <Text className='activity-hero__status'>{status}</Text>
        <Text className='activity-hero__title'>{activity?.name ?? 'Event OS'}</Text>
        <Text className='activity-hero__desc'>{activity?.description ?? '多租户活动平台'}</Text>
        <Text className='activity-hero__meta'>{activity ? `${activity.start_time} / ${activity.venue.venue_name ?? activity.venue.city ?? activity.timezone}` : '等待活动数据'}</Text>
        <Text className='activity-hero__meta'>{publication ? `Published v${publication.version} · ${publication.etag.slice(0, 10)}` : 'Publication snapshot 未加载'}</Text>
      </View>

      <View className='action-grid'>
        <View className='action-card action-card--primary' onClick={submitRegistration}>
          <Text className='action-card__title'>{activity?.status === 'archived' ? '查看报名' : '立即报名'}</Text>
          <Text className='action-card__meta'>Confirmed Registration to QR Pass</Text>
        </View>
        <View className='action-card' onClick={goSchedule}>
          <Text className='action-card__title'>Agenda</Text>
          <Text className='action-card__meta'>浏览 Sessions 和 My Agenda</Text>
        </View>
        <View className='action-card' onClick={() => Taro.switchTab({ url: '/pages/expo/index' })}>
          <Text className='action-card__title'>Expo</Text>
          <Text className='action-card__meta'>强类型 Expo Booth</Text>
        </View>
        <View className='action-card' onClick={() => Taro.switchTab({ url: '/pages/me/index' })}>
          <Text className='action-card__title'>Me</Text>
          <Text className='action-card__meta'>QR Pass / Registration / My Agenda</Text>
        </View>
      </View>

      {notifications.length > 0 && (
        <View className='resource-section'>
          <Text className='resource-section__title'>Notifications</Text>
          {notifications.slice(0, 3).map((item) => (
            <View key={item.id} className='resource-row'>
              <Text className='resource-row__title'>{item.title}</Text>
              <Text className='resource-row__meta'>{item.content}</Text>
            </View>
          ))}
        </View>
      )}

      {registrationForm && (
        <View className='resource-section'>
          <Text className='resource-section__title'>{registrationForm.title}</Text>
          {registrationForm.fields.map((field) => (
            <View key={field.id} className='form-field'>
              <Text className='form-field__label'>{field.label}{field.required ? ' *' : ''}</Text>
              {field.type === 'boolean' ? (
                <View
                  className={`form-option${formAnswers[field.key] === 'true' ? ' form-option--active' : ''}`}
                  onClick={() => setFormAnswers((current) => ({ ...current, [field.key]: current[field.key] === 'true' ? 'false' : 'true' }))}
                >
                  {formAnswers[field.key] === 'true' ? 'Yes' : 'No'}
                </View>
              ) : field.type === 'multi_select' && field.options?.length ? (
                <View className='form-options'>
                  {field.options.map((option) => {
                    const values = new Set((formAnswers[field.key] ?? '').split(',').filter(Boolean))
                    return (
                      <Text
                        key={option.value}
                        className={`form-option${values.has(option.value) ? ' form-option--active' : ''}`}
                        onClick={() => {
                          const next = new Set(values)
                          if (next.has(option.value)) next.delete(option.value)
                          else next.add(option.value)
                          setFormAnswers((current) => ({ ...current, [field.key]: Array.from(next).join(',') }))
                        }}
                      >
                        {option.label}
                      </Text>
                    )
                  })}
                </View>
              ) : field.options?.length ? (
                <View className='form-options'>
                  {field.options.map((option) => (
                    <Text
                      key={option.value}
                      className={`form-option${formAnswers[field.key] === option.value ? ' form-option--active' : ''}`}
                      onClick={() => setFormAnswers((current) => ({ ...current, [field.key]: option.value }))}
                    >
                      {option.label}
                    </Text>
                  ))}
                </View>
              ) : (
                <Input value={formAnswers[field.key] ?? ''} placeholder={field.type} onInput={(event) => setFormAnswers((current) => ({ ...current, [field.key]: event.detail.value }))} />
              )}
            </View>
          ))}
          <View className='resource-section__button' onClick={submitCurrentForm}>提交报名表</View>
        </View>
      )}
    </View>
  )
}
