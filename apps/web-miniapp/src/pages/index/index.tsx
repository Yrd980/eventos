import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.css'

const featuredSpeakers = [
  {
    name: '储瑞松',
    role1: '亚马逊全球副总裁',
    role2: '亚马逊云科技亚太区联席总裁',
    cue: '企业生产级智能体开发部署指南',
  },
  {
    name: '徐晓彬',
    role1: '峰会主题演讲嘉宾',
    role2: '生成式 AI 解决方案负责人',
    cue: 'Agentic AI 在企业中的落地路径',
  },
]

export default function Index() {
  const [activeSpeaker, setActiveSpeaker] = useState(0)

  const goSchedule = () => {
    Taro.switchTab({ url: '/pages/schedule/index' })
  }

  const goAssistant = () => {
    Taro.switchTab({ url: '/pages/assistant/index' })
  }

  const stopTap = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
  }

  return (
    <View className='page page--home'>
      <View className='mini-topbar'>
        <Text className='mini-topbar__back' onClick={goSchedule}>
          ‹
        </Text>
        <Text className='mini-topbar__title'>首页</Text>
        <View className='mini-topbar__menu'>
          <Text>•••</Text>
          <Text>—</Text>
          <Text>◉</Text>
        </View>
      </View>

      <View className='hero-split'>
        <View className='hero-split__left'>
          <Text className='brand'>亚马逊云科技</Text>
          <Text className='brand brand--sub'>中国峰会</Text>
          <Text className='quote'>“</Text>
          <Text className='headline'>重磅发布</Text>
          <Text className='headline headline--accent'>{featuredSpeakers[activeSpeaker].cue}</Text>

          <View className='whitepaper'>
            <View className='whitepaper__line' />
            <Text className='whitepaper__text'>白皮书下载</Text>
          </View>

          <View
            className='crowd-card'
            onClick={() => {
              setActiveSpeaker((value) => (value + 1) % featuredSpeakers.length)
            }}
          >
            <Text className='crowd-card__text'>大会现场</Text>
          </View>
        </View>

        <View
          className='hero-split__right'
          onClick={() => {
            setActiveSpeaker((value) => (value + 1) % featuredSpeakers.length)
          }}
        >
          <View className='speaker-card'>
            <View className='speaker-card__image' />
            <View className='speaker-card__footer'>
              <Text className='speaker-card__name'>{featuredSpeakers[activeSpeaker].name}</Text>
              <Text className='speaker-card__role'>{featuredSpeakers[activeSpeaker].role1}</Text>
              <Text className='speaker-card__role'>{featuredSpeakers[activeSpeaker].role2}</Text>
            </View>
          </View>
          <View
            className='share-badge'
            onClick={(e) => {
              stopTap(e)
              goAssistant()
            }}
          >
            <Text className='share-badge__icon'>↗</Text>
            <Text className='share-badge__text'>分享好友</Text>
          </View>
          <View className='dots'>
            {featuredSpeakers.map((_, index) => (
              <Text
                key={index}
                className={`dots__dot${index === activeSpeaker ? ' dots__dot--active' : ''}`}
                onClick={(e) => {
                  stopTap(e)
                  setActiveSpeaker(index)
                }}
              />
            ))}
          </View>
        </View>
      </View>

      <View className='cta-card' onClick={goSchedule}>
        <Text className='cta-card__button'>立即免费报名</Text>
      </View>

      <View className='ask-bar' onClick={goAssistant}>
        <Text className='ask-bar__placeholder'>请帮我报名</Text>
        <View className='ask-bar__send'>
          <Text>↑</Text>
        </View>
      </View>
    </View>
  )
}
