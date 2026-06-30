import { useEffect, useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Activity, LiveEntry, Survey, SurveyQuestion } from '@eventos/contracts'
import { loadActivity, loadLiveEntries, loadSurveyQuestions, loadSurveys, resolveActivityId, submitSurveyResponse } from '../../utils/api'
import './index.css'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const quickActions = [
  { icon: '⭐', label: '智能推荐参会日程', action: 'recommend_schedule' },
  { icon: '📝', label: '管理和调整已添加的日程安排', action: 'manage_schedule' },
  { icon: '🎮', label: '智能推荐展区与互动体验', action: 'recommend_expo' },
  { icon: '🎤', label: '峰会大会亮点', action: 'summit_highlights' },
  { icon: '📍', label: '场馆、交通及签到信息', action: 'venue_info' },
  { icon: '📋', label: '报名与参会方式', action: 'registration_info' },
]

const bottomTools = ['线上观看', '参会二维码', '峰会首页', '全部']

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    public: '公开',
    registered: '已报名可见',
    scheduled: '已排期',
    hidden: '隐藏',
    ended: '已结束',
    live: '直播中',
    draft: '草稿',
    text: '文本',
    rating: '评分',
    boolean: '是/否',
    single_choice: '单选',
    multiple_choice: '多选',
  }
  return value ? labels[value] ?? value : '未设置'
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [activity, setActivity] = useState<Activity>()
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([])
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedSurvey, setSelectedSurvey] = useState<Survey>()
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('准备就绪')
  const liveLoadRef = useRef<Promise<void> | null>(null)
  const surveyLoadRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    async function loadActivityData() {
      const activityId = await resolveActivityId()
      if (activityId) {
        try {
          const act = await loadActivity(activityId)
          setActivity(act)
        } catch { /* ignore */ }
      }
    }
    void loadActivityData()
  }, [])

  function addMessage(role: 'user' | 'assistant', content: string) {
    setMessages((prev) => [...prev, {
      id: `${Date.now()}_${Math.random()}`,
      role,
      content,
      timestamp: Date.now(),
    }])
  }

  async function handleQuickAction(action: string) {
    addMessage('user', quickActions.find((a) => a.action === action)?.label ?? action)

    const activityId = await resolveActivityId()
    if (!activityId) {
      addMessage('assistant', '请先在首页选择活动')
      return
    }

    switch (action) {
      case 'recommend_schedule':
        addMessage('assistant', '正在为您智能推荐参会日程...基于您的兴趣和活动亮点，推荐以下日程：')
        Taro.switchTab({ url: '/pages/schedule/index' })
        break
      case 'manage_schedule':
        addMessage('assistant', '正在打开您的日程管理页面...')
        Taro.switchTab({ url: '/pages/schedule/index' })
        break
      case 'recommend_expo':
        addMessage('assistant', '正在为您推荐展区与互动体验...基于热门展位和您的兴趣，推荐以下展区：')
        Taro.switchTab({ url: '/pages/expo/index' })
        break
      case 'summit_highlights':
        addMessage('assistant', '峰会大会亮点：\n1. 企业生产级智能体开发部署指南发布\n2. 行业 Agent 实战专题\n3. 多位亚马逊云科技高管主题演讲\n4. 互动展区体验')
        break
      case 'venue_info':
        addMessage('assistant', '场馆信息：\n地点：上海世博中心\n签到方式：参会二维码扫码签到\n交通：地铁13号线世博大道站')
        break
      case 'registration_info':
        addMessage('assistant', '报名与参会方式：\n1. 点击首页"立即免费报名"\n2. 填写报名信息\n3. 确认后生成参会二维码\n4. 现场扫码签到入场')
        break
      default:
        addMessage('assistant', '我来帮您处理这个问题。')
    }
  }

  async function sendMessage() {
    if (!inputValue.trim()) return

    addMessage('user', inputValue)
    const userMessage = inputValue
    setInputValue('')

    const activityId = await resolveActivityId()
    if (!activityId) {
      addMessage('assistant', '请先在首页选择活动')
      return
    }

    if (userMessage.includes('直播') || userMessage.includes('线上')) {
      if (liveEntries.length === 0 && liveLoadRef.current === null) {
        const request = (async () => {
          try {
            setStatus('加载直播入口中')
            const rows = await loadLiveEntries(activityId)
            setLiveEntries(rows)
            setStatus('直播入口已加载')
            if (rows.length > 0) {
              addMessage('assistant', `找到 ${rows.length} 个直播入口：\n${rows.map((e) => `• ${e.title} (${statusLabel(e.status)})`).join('\n')}`)
            } else {
              addMessage('assistant', '暂无可用的直播入口')
            }
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error))
            addMessage('assistant', '加载直播入口失败')
          }
        })()
        liveLoadRef.current = request
        await request
        liveLoadRef.current = null
      } else if (liveEntries.length > 0) {
        addMessage('assistant', `当前有 ${liveEntries.length} 个直播入口：\n${liveEntries.map((e) => `• ${e.title} (${statusLabel(e.status)})`).join('\n')}`)
      }
    } else if (userMessage.includes('问卷') || userMessage.includes('反馈')) {
      if (surveys.length === 0 && surveyLoadRef.current === null) {
        const request = (async () => {
          try {
            setStatus('加载问卷中')
            const surveyRows = await loadSurveys(activityId)
            setSurveys(surveyRows)
            setSelectedSurvey(surveyRows[0])
            if (surveyRows[0]) {
              const detail = await loadSurveyQuestions(surveyRows[0].id)
              setQuestions(detail.questions)
            }
            setStatus('问卷已加载')
            if (surveyRows.length > 0) {
              addMessage('assistant', `找到 ${surveyRows.length} 个问卷：\n${surveyRows.map((s) => `• ${s.title}`).join('\n')}`)
            } else {
              addMessage('assistant', '暂无可用问卷')
            }
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error))
            addMessage('assistant', '加载问卷失败')
          }
        })()
        surveyLoadRef.current = request
        await request
        surveyLoadRef.current = null
      } else if (surveys.length > 0) {
        addMessage('assistant', `当前有 ${surveys.length} 个问卷：\n${surveys.map((s) => `• ${s.title}`).join('\n')}`)
      }
    } else if (userMessage.includes('日程') || userMessage.includes('议程')) {
      addMessage('assistant', '正在为您查找日程信息...')
      Taro.switchTab({ url: '/pages/schedule/index' })
    } else if (userMessage.includes('展区') || userMessage.includes('展位')) {
      addMessage('assistant', '正在为您查找展区信息...')
      Taro.switchTab({ url: '/pages/expo/index' })
    } else if (userMessage.includes('报名') || userMessage.includes('注册')) {
      addMessage('assistant', '报名方式：\n1. 点击首页"立即免费报名"\n2. 填写必要信息\n3. 确认提交即可完成报名')
    } else if (userMessage.includes('签到') || userMessage.includes('入场')) {
      addMessage('assistant', '签到方式：\n1. 在"我的"页面查看参会二维码\n2. 现场工作人员扫码签到\n3. 或在工作人员指导下完成签到')
    } else if (userMessage.includes('场馆') || userMessage.includes('交通') || userMessage.includes('地点')) {
      addMessage('assistant', '场馆信息：\n名称：上海世博中心\n地址：上海市浦东新区世博大道1500号\n交通：地铁13号线世博大道站')
    } else {
      addMessage('assistant', `您好！我是 AI 参会助手，可以帮您：\n• 智能推荐参会日程\n• 管理已添加的日程\n• 推荐展区与互动体验\n• 提供场馆、交通信息\n• 解答报名与参会问题\n\n请问有什么可以帮到您的？`)
    }
  }

  async function selectSurvey(survey: Survey) {
    setSelectedSurvey(survey)
    setAnswers({})
    try {
      const detail = await loadSurveyQuestions(survey.id)
      setQuestions(detail.questions)
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  async function submitSurvey() {
    if (!selectedSurvey) return
    const typedAnswers = questions.reduce<Record<string, unknown>>((current, question) => {
      const value = answers[question.key]
      if (value === undefined || value === '') return current
      if (question.type === 'rating') current[question.key] = Number(value)
      else if (question.type === 'boolean') current[question.key] = value === 'true'
      else if (question.type === 'multiple_choice') current[question.key] = value.split(',').filter(Boolean)
      else current[question.key] = value
      return current
    }, {})
    try {
      await submitSurveyResponse(selectedSurvey.id, typedAnswers)
      addMessage('assistant', '问卷已提交成功，感谢您的反馈！')
      Taro.showToast({ title: '问卷已提交', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  return (
    <View className='page page--assistant'>
      <View className='assistant-header'>
        <Text className='assistant-header__title'>AI 助手</Text>
      </View>

      <View className='chat-container'>
        {messages.length === 0 && (
          <View className='chat-welcome'>
            <Text className='chat-welcome__emoji'>👋</Text>
            <Text className='chat-welcome__title'>Hello! 欢迎来到{activity?.name ?? '活动峰会'}</Text>
            <Text className='chat-welcome__subtitle'>我是您的 AI 参会助手！</Text>
            <View className='chat-welcome__info'>
              <Text className='chat-welcome__infoItem'>📅 峰会时间：{activity ? `${new Date(activity.start_time).getMonth() + 1}月${new Date(activity.start_time).getDate()}日 - ${new Date(activity.end_time).getMonth() + 1}月${new Date(activity.end_time).getDate()}日` : '加载中...'}</Text>
              <Text className='chat-welcome__infoItem'>📍 峰会地点：{activity?.venue.venue_name ?? activity?.venue.city ?? '加载中...'}</Text>
              <Text className='chat-welcome__infoItem'>🎯 大会主题：{activity?.theme_name ?? '加载中...'}</Text>
            </View>
            <Text className='chat-welcome__desc'>我不仅能帮您了解峰会信息，还能协助您完成参会安排，让参会更高效。</Text>
            <Text className='chat-welcome__hint'>请问有什么可以帮到您的？</Text>
          </View>
        )}

        <View className='quick-actions'>
          {quickActions.map((action) => (
            <View key={action.action} className='quick-action-chip' onClick={() => handleQuickAction(action.action)}>
              <Text className='quick-action-chip__icon'>{action.icon}</Text>
              <Text className='quick-action-chip__label'>{action.label}</Text>
              <Text className='quick-action-chip__arrow'>→</Text>
            </View>
          ))}
        </View>

        {messages.map((msg) => (
          <View key={msg.id} className={`chat-message chat-message--${msg.role}`}>
            <View className={`chat-bubble chat-bubble--${msg.role}`}>
              <Text className='chat-bubble__text'>{msg.content}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className='assistant-bottom-tools'>
        {bottomTools.map((tool, index) => (
          <View key={tool} className='assistant-bottom-tools__item' onClick={() => {
            if (index === 0) {
              handleQuickAction('recommend_schedule')
            } else if (index === 1) {
              Taro.switchTab({ url: '/pages/me/index' })
            } else if (index === 2) {
              Taro.switchTab({ url: '/pages/index/index' })
            } else {
              Taro.switchTab({ url: '/pages/schedule/index' })
            }
          }}>
            <Text>{tool}</Text>
          </View>
        ))}
      </View>

      <View className='assistant-input-bar'>
        <Input
          className='assistant-input-bar__input'
          value={inputValue}
          placeholder='请输入您的问题'
          onInput={(e) => setInputValue(e.detail.value)}
          onConfirm={sendMessage}
        />
        <View className='assistant-input-bar__send' onClick={sendMessage}>
          <Text>➤</Text>
        </View>
      </View>

      <Text className='assistant-foot'>网信算备：110116585231701240019号 ▣</Text>
    </View>
  )
}
