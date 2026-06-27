import { useEffect, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { LiveEntry, Survey, SurveyQuestion } from '@eventos/contracts'
import { loadLiveEntries, loadSurveyQuestions, loadSurveys, resolveActivityId, submitSurveyResponse } from '../../utils/api'
import './index.css'

const actions = [
  '线上观看',
  '问卷反馈',
  '管理和调整已添加的日程安排',
  '场馆、交通及签到信息',
]

const bottomTools = ['线上观看', '问卷', '参会二维码', '峰会首页']
const MAX_VISIBLE_ROWS = 10

const replies = [
  {
    title: '线上观看',
    desc: '这里读取 Activity 的 published Live Entries，并按 access policy 展示。',
    cta: '刷新直播',
  },
  {
    title: '问卷反馈',
    desc: '这里读取 published Surveys 和 Questions，提交会写入 Survey Response。',
    cta: '刷新问卷',
  },
  {
    title: '管理已添加日程',
    desc: '你已经选中的内容会优先放在上方。',
    cta: '管理日程',
  },
  {
    title: '场馆与签到',
    desc: '工作人员使用 Staff Check-in 页面核验 QR Pass。',
    cta: '查看我的',
  },
]

export default function AssistantPage() {
  const [activeAction, setActiveAction] = useState(0)
  const [activeTool, setActiveTool] = useState(0)
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([])
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedSurvey, setSelectedSurvey] = useState<Survey>()
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('加载参与资源中')
  const activeReply = replies[activeAction]
  const visibleLiveEntries = liveEntries.slice(0, MAX_VISIBLE_ROWS)
  const visibleSurveys = surveys.slice(0, MAX_VISIBLE_ROWS)
  const visibleQuestions = questions.slice(0, MAX_VISIBLE_ROWS)

  async function loadResources() {
    const activityId = await resolveActivityId()
    if (!activityId) {
      setStatus('请先在首页选择 Activity')
      return
    }
    try {
      const [liveRows, surveyRows] = await Promise.all([
        loadLiveEntries(activityId).catch(() => []),
        loadSurveys(activityId).catch(() => []),
      ])
      setLiveEntries(liveRows)
      setSurveys(surveyRows)
      setSelectedSurvey(surveyRows[0])
      if (surveyRows[0]) {
        void loadSurveyQuestions(surveyRows[0].id).then((detail) => setQuestions(detail.questions)).catch(() => setQuestions([]))
      } else {
        setQuestions([])
      }
      setStatus('参与资源已加载')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
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
      Taro.showToast({ title: '问卷已提交', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  useEffect(() => {
    void loadResources()
  }, [])

  return (
    <View className='page page--assistant'>
      <View className='mini-topbar'>
        <Text
          className='mini-topbar__back'
          onClick={() => {
            Taro.switchTab({ url: '/pages/index/index' })
          }}
        >
          ‹
        </Text>
        <Text className='mini-topbar__title'>亚马逊云科技 - AI 助手</Text>
        <View className='mini-topbar__menu'>
          <Text>•••</Text>
          <Text>—</Text>
          <Text>◉</Text>
        </View>
      </View>

      <View className='assistant-panel'>
        <Text className='assistant-panel__text'>Event OS 参与助手</Text>
        <Text className='assistant-panel__text'>{status}</Text>
        <Text className='assistant-panel__text'>Live Entries / Surveys 均从 published Activity snapshot 与参与者接口读取。</Text>

        <View className='assistant-panel__actions'>
          {actions.map((item, index) => (
            <View
              key={item}
              className={`assistant-chip${index === activeAction ? ' assistant-chip--active' : ''}`}
              onClick={() => {
                if (index !== activeAction) setActiveAction(index)
              }}
            >
              <Text className='assistant-chip__text'>{item}</Text>
              <Text className='assistant-chip__arrow'>→</Text>
            </View>
          ))}
        </View>

        <View className='assistant-result'>
          <Text className='assistant-result__label'>AI 现在在做</Text>
          <Text className='assistant-result__title'>{activeReply.title}</Text>
          <Text className='assistant-result__desc'>{activeReply.desc}</Text>
          <View
            className='assistant-result__cta'
            onClick={() => {
              if (activeAction === 0 || activeAction === 1) {
                void loadResources()
                return
              }
              Taro.switchTab({ url: activeAction === 2 ? '/pages/schedule/index' : '/pages/me/index' })
            }}
          >
            {activeReply.cta}
          </View>
        </View>

        <View className='data-section'>
          <Text className='data-section__title'>Live Entries</Text>
          {liveEntries.length === 0 ? (
            <Text className='data-section__empty'>暂无可见 Live Entry</Text>
          ) : (
            visibleLiveEntries.map((entry) => (
              <View key={entry.id} className='data-row'>
                <Text className='data-row__title'>{entry.title}</Text>
                <Text className='data-row__meta'>{entry.status} · {entry.access_policy} · {entry.start_time ?? 'No start time'}</Text>
                <Text className='data-row__cta'>{entry.url ?? entry.deep_link ?? entry.provider}</Text>
              </View>
            ))
          )}
        </View>

        <View className='data-section'>
          <Text className='data-section__title'>Surveys</Text>
          <View className='survey-tabs'>
            {visibleSurveys.map((survey) => (
              <Text key={survey.id} className={`survey-tab${survey.id === selectedSurvey?.id ? ' survey-tab--active' : ''}`} onClick={() => selectSurvey(survey)}>
                {survey.title}
              </Text>
            ))}
          </View>
          {visibleQuestions.map((question) => (
            <View key={question.id} className='question-field'>
              <Text className='question-field__label'>{question.label}{question.required ? ' *' : ''}</Text>
              {question.type === 'boolean' ? (
                <View className='survey-options'>
                  {['true', 'false'].map((value) => (
                    <Text key={value} className={`survey-option${answers[question.key] === value ? ' survey-option--active' : ''}`} onClick={() => setAnswers((current) => ({ ...current, [question.key]: value }))}>
                      {value === 'true' ? 'Yes' : 'No'}
                    </Text>
                  ))}
                </View>
              ) : question.type === 'multiple_choice' && question.options?.length ? (
                <View className='survey-options'>
                  {question.options.map((option) => {
                    const values = new Set((answers[question.key] ?? '').split(',').filter(Boolean))
                    return (
                      <Text
                        key={option.value}
                        className={`survey-option${values.has(option.value) ? ' survey-option--active' : ''}`}
                        onClick={() => {
                          const next = new Set(values)
                          if (next.has(option.value)) next.delete(option.value)
                          else next.add(option.value)
                          setAnswers((current) => ({ ...current, [question.key]: Array.from(next).join(',') }))
                        }}
                      >
                        {option.label}
                      </Text>
                    )
                  })}
                </View>
              ) : question.options?.length ? (
                <View className='survey-options'>
                  {question.options.map((option) => (
                    <Text key={option.value} className={`survey-option${answers[question.key] === option.value ? ' survey-option--active' : ''}`} onClick={() => setAnswers((current) => ({ ...current, [question.key]: option.value }))}>
                      {option.label}
                    </Text>
                  ))}
                </View>
              ) : (
                <Input value={answers[question.key] ?? ''} placeholder={question.type} onInput={(event) => setAnswers((current) => ({ ...current, [question.key]: event.detail.value }))} />
              )}
            </View>
          ))}
          {selectedSurvey ? <View className='assistant-result__cta' onClick={submitSurvey}>提交问卷</View> : <Text className='data-section__empty'>暂无可见 Survey</Text>}
        </View>

        <Text className='assistant-panel__foot'>网信算备：110116585231701240019号 ▣</Text>
      </View>

      <View className='assistant-tools'>
        {bottomTools.map((item, index) => (
          <View
            key={item}
            className={`assistant-tools__item${index === activeTool ? ' assistant-tools__item--active' : ''}`}
            onClick={() => {
              if (index !== activeTool) setActiveTool(index)
              if (index === 1) {
                if (activeAction !== 1) setActiveAction(1)
                return
              }
              if (index === 2) {
                Taro.switchTab({ url: '/pages/me/index' })
                return
              }
              if (index === 3) {
                Taro.switchTab({ url: '/pages/index/index' })
                return
              }
              if (activeAction !== 0) setActiveAction(0)
            }}
          >
            <Text>{item}</Text>
          </View>
        ))}
      </View>

      <View
        className='assistant-input'
        onClick={() => {
          setActiveAction(0)
        }}
      >
        <Text className='assistant-input__placeholder'>{activeReply.title}</Text>
        <View className='assistant-input__send'>
          <Text>➤</Text>
        </View>
      </View>
    </View>
  )
}
