import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.css'

const actions = [
  '智能推荐参会日程',
  '管理和调整已添加的日程安排',
  '智能推荐展区与互动体验',
  '峰会大亮点',
  '场馆、交通及签到信息',
  '报名与参会方式',
]

const bottomTools = ['线上观看', '参会二维码', '峰会首页', '全部']

const replies = [
  {
    title: '为你整理日程',
    desc: '我可以先把 6 月 23 日上午的主会场和专题分会场排好。',
    cta: '查看日程',
  },
  {
    title: '管理已添加日程',
    desc: '你已经选中的内容会优先放在上方，我可以继续帮你补齐空档。',
    cta: '管理日程',
  },
  {
    title: '推荐展区路线',
    desc: '从主舞台到创新展区，再到服务台，给你一条最省时的路线。',
    cta: '看路线',
  },
  {
    title: '峰会亮点',
    desc: '我可以直接提炼开场、发布和现场互动的重点内容。',
    cta: '看亮点',
  },
]

export default function AssistantPage() {
  const [activeAction, setActiveAction] = useState(0)
  const [activeTool, setActiveTool] = useState(0)
  const activeReply = replies[activeAction]

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
        <Text className='assistant-panel__text'>
          👋 Hello! 欢迎来到 2026亚马逊云科技中国峰会，我是您的 AI 会务助手！
        </Text>
        <Text className='assistant-panel__text'>📅 峰会时间：2026年6月23日-24日</Text>
        <Text className='assistant-panel__text'>📍 峰会地点：上海世博中心</Text>
        <Text className='assistant-panel__text'>🎯 大会主题：Agentic Now, Go Build</Text>
        <Text className='assistant-panel__text'>我不仅能帮您了解峰会信息，还能协助您完成参会安排，让参会更高效。</Text>
        <Text className='assistant-panel__text'>请问有什么可以帮到您的吗？</Text>

        <View className='assistant-panel__actions'>
          {actions.map((item, index) => (
            <View
              key={item}
              className={`assistant-chip${index === activeAction ? ' assistant-chip--active' : ''}`}
              onClick={() => {
                setActiveAction(index)
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
              Taro.switchTab({ url: '/pages/schedule/index' })
            }}
          >
            {activeReply.cta}
          </View>
        </View>

        <Text className='assistant-panel__foot'>网信算备：110116585231701240019号 ▣</Text>
      </View>

      <View className='assistant-tools'>
        {bottomTools.map((item, index) => (
          <View
            key={item}
            className={`assistant-tools__item${index === activeTool ? ' assistant-tools__item--active' : ''}`}
            onClick={() => {
              setActiveTool(index)
              if (index === 1) {
                Taro.switchTab({ url: '/pages/me/index' })
                return
              }
              if (index === 2) {
                Taro.switchTab({ url: '/pages/index/index' })
                return
              }
              if (index === 3) {
                Taro.switchTab({ url: '/pages/schedule/index' })
                return
              }
              Taro.switchTab({ url: '/pages/expo/index' })
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
