import { useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { readPlan, writePlan, type Session } from '../../utils/plan-storage'
import './index.css'

const agendaByDay = {
  day1: {
    title: '6月23日 活动日程',
    tagline: '从大会开场到专题分会场，按活动时间浏览可加入项',
    spotlight: {
      id: 's1',
      title: '主题演讲',
      time: '09:00 - 11:00',
      place: '5层金厅',
      speaker: '储瑞松 / 亚马逊云科技全球副总裁',
    },
    sessions: [
      {
        id: 's1',
        day: 'day1',
        tag: '主会场',
        title: '主题演讲',
        time: '09:00 - 11:00',
        place: '5层金厅',
        speaker: '储瑞松',
      },
      {
        id: 's2',
        day: 'day1',
        tag: '专题',
        title: '游戏领域的 Agentic AI',
        time: '11:00 - 11:25',
        place: '1层银厅 行业大讲堂 A',
        speaker: '峰会嘉宾',
      },
      {
        id: 's3',
        day: 'day1',
        tag: '专题',
        title: '企业级智能体实战',
        time: '14:00 - 14:25',
        place: '2层银厅 行业大讲堂 B',
        speaker: '峰会嘉宾',
      },
    ],
  },
  day2: {
    title: '6月24日 活动日程',
    tagline: '第二天的活动、分会场和圆桌同样可以加入我的编排',
    spotlight: {
      id: 's4',
      title: '云与 AI 主题演讲',
      time: '09:40 - 10:20',
      place: '5层金厅',
      speaker: '王坚 / 主题演讲嘉宾',
    },
    sessions: [
      {
        id: 's4',
        day: 'day2',
        tag: '主会场',
        title: '云与 AI 主题演讲',
        time: '09:40 - 10:20',
        place: '5层金厅',
        speaker: '王坚',
      },
      {
        id: 's5',
        day: 'day2',
        tag: '专题',
        title: '企业级智能体的协同编排',
        time: '14:00 - 14:25',
        place: '2层银厅 行业大讲堂 B',
        speaker: '峰会嘉宾',
      },
    ],
  },
} as const

export default function SchedulePage() {
  const [day, setDay] = useState<'day1' | 'day2'>('day1')
  const [selected, setSelected] = useState('s1')
  const [plan, setPlan] = useState<Session[]>(() => readPlan())
  const current = agendaByDay[day]
  const selectedSession = current.sessions.find((item) => item.id === selected) ?? current.sessions[0]
  const planIdSet = useMemo(() => new Set(plan.map((item) => item.id)), [plan])
  const selectedIsAdded = planIdSet.has(selectedSession.id)

  const addToPlan = (session: Session) => {
    const exists = plan.some((item) => item.id === session.id)
    if (!exists) {
      const nextPlan = [...plan, session]
      writePlan(nextPlan)
      setPlan(nextPlan)
      Taro.showToast({ title: '已加入编排', icon: 'none' })
      return
    }
    Taro.showToast({ title: '已经加入过', icon: 'none' })
  }

  return (
    <View className='page page--schedule'>
      <View className='mini-topbar'>
        <Text
          className='mini-topbar__back'
          onClick={() => {
            Taro.switchTab({ url: '/pages/index/index' })
          }}
        >
          ⌂
        </Text>
        <Text className='mini-topbar__title'>活动日程</Text>
        <View
          className='mini-topbar__menu'
          onClick={() => {
            Taro.switchTab({ url: '/pages/assistant/index' })
          }}
        >
          <Text>•••</Text>
          <Text>—</Text>
          <Text>◉</Text>
        </View>
      </View>

      <View className='seg'>
        <Text className='seg__item seg__item--active'>活动日程</Text>
        <Text
          className='seg__item'
          onClick={() => {
            Taro.switchTab({ url: '/pages/me/index' })
          }}
        >
          我的编排
        </Text>
      </View>

      <View className='filter-line'>
        <Text
          className={`filter-line__item${day === 'day1' ? ' filter-line__item--active' : ''}`}
          onClick={() => setDay('day1')}
        >
          6月23日
        </Text>
        <Text
          className={`filter-line__item${day === 'day2' ? ' filter-line__item--active' : ''}`}
          onClick={() => setDay('day2')}
        >
          6月24日
        </Text>
        <Text
          className='filter-line__watch'
          onClick={() => {
            Taro.switchTab({ url: '/pages/me/index' })
          }}
        >
          我的编排
        </Text>
        <Text className='filter-line__icon'>⌵</Text>
      </View>

      <View className='session-banner'>
        <Text className='session-banner__title'>{current.title}</Text>
        <Text className='session-banner__sub'>{current.tagline}</Text>
      </View>

      <View className='session-card session-card--spotlight'>
        <View className='session-card__head'>
          <Text className='session-card__headText'>{current.spotlight.title}</Text>
          <Text className='session-card__headArrow'>›</Text>
        </View>
        <Text className='session-card__line'>活动时间 {current.spotlight.time}</Text>
        <Text className='session-card__line'>会议地点 {current.spotlight.place}</Text>
        <Text className='session-card__line'>{current.spotlight.speaker}</Text>
        <Text
          className='session-card__cta'
          onClick={() => {
            addToPlan(current.spotlight as Session)
          }}
        >
          加入到我的编排
        </Text>
      </View>

      <View className='timeline'>
        {current.sessions.map((item) => (
          <View
            key={item.id}
            className={`timeline__item${item.id === selected ? ' timeline__item--active' : ''}`}
            onClick={() => {
              setSelected(item.id)
            }}
          >
            <View className='timeline__head'>
              <Text className='timeline__tag'>{item.tag}</Text>
              <Text className={`timeline__status${planIdSet.has(item.id) ? ' timeline__status--added' : ''}`}>
                {planIdSet.has(item.id) ? '已加入' : '可加入'}
              </Text>
            </View>
            <Text className='timeline__title'>{item.title}</Text>
            <Text className='timeline__meta'>{item.time} · {item.place}</Text>
            <Text
              className={`timeline__action${planIdSet.has(item.id) ? ' timeline__action--added' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                addToPlan(item)
              }}
            >
              {planIdSet.has(item.id) ? '再次加入无变化' : '加入到我的编排'}
            </Text>
          </View>
        ))}
      </View>

      <View
        className='ask-bar'
        onClick={() => {
          addToPlan(selectedSession as Session)
        }}
      >
        <Text className='ask-bar__placeholder'>
          {selectedIsAdded ? '这场已在我的编排里，继续选别的活动' : '点这里把当前选中的活动加入我的编排'}
        </Text>
        <View className='ask-bar__send'>
          <Text>↑</Text>
        </View>
      </View>
    </View>
  )
}
