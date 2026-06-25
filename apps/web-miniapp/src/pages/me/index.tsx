import { useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { readPlan, writePlan, type Session } from '../../utils/plan-storage'
import './index.css'

const flowTabs = ['编排总览', '冲突检查', '已加入活动', '待确认']

type PlanGroup = {
  key: string
  day: Session['day']
  time: string
  items: Session[]
}

const dayLabelMap: Record<Session['day'], string> = {
  day1: '6月23日',
  day2: '6月24日',
}

function groupPlan(plan: Session[]) {
  const groups = new Map<string, PlanGroup>()
  const orderedGroups: PlanGroup[] = []

  plan.forEach((item) => {
    const key = `${item.day}-${item.time}`
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
      return
    }

    const group: PlanGroup = {
      key,
      day: item.day,
      time: item.time,
      items: [item],
    }
    groups.set(key, group)
    orderedGroups.push(group)
  })

  return orderedGroups
}

export default function MePage() {
  const [activeTab, setActiveTab] = useState(0)
  const [plan, setPlan] = useState<Session[]>(() => readPlan())
  const planGroups = useMemo(() => groupPlan(plan), [plan])

  useDidShow(() => {
    setPlan(readPlan())
  })

  const statusSummary = useMemo(() => {
    const multiSlotCount = planGroups.filter((item) => item.items.length > 1).length
    return {
      slots: planGroups.length,
      multiSlotCount,
      confirmed: plan.length,
      appendHint:
        multiSlotCount > 0
          ? `有 ${multiSlotCount} 个时间段已经并列加入多场活动`
          : '同一时间段的活动会自动并排追加',
    }
  }, [plan, planGroups])

  const removeFromPlan = (id: string) => {
    const nextPlan = plan.filter((item) => item.id !== id)
    setPlan(nextPlan)
    writePlan(nextPlan)
  }

  return (
    <View className='page page--me'>
      <View className='top-title'>
        <Text className='top-title__text'>我的编排</Text>
        <View
          className='top-title__menu'
          onClick={() => {
            Taro.showToast({ title: '编排菜单', icon: 'none' })
          }}
        >
          <Text>•••</Text>
          <Text>—</Text>
          <Text>◉</Text>
        </View>
      </View>

      <View className='profile-hero'>
        <View className='profile-hero__left'>
          <Text className='profile-hero__label'>当前编排</Text>
          <Text className='profile-hero__value'>{statusSummary.confirmed} 场</Text>
          <Text className='profile-hero__link'>
            {statusSummary.slots} 个时间段，{statusSummary.multiSlotCount} 段含多场活动
          </Text>
        </View>
        <View
          className='profile-hero__cta'
          onClick={() => {
            Taro.switchTab({ url: '/pages/schedule/index' })
          }}
        >
          去选活动日程
        </View>
      </View>

      <View className='tabs'>
        {flowTabs.map((item, index) => (
          <Text
            key={item}
            className={`tabs__item${index === activeTab ? ' tabs__item--active' : ''}`}
            onClick={() => {
              setActiveTab(index)
            }}
          >
            {item}
          </Text>
        ))}
      </View>

      <View className='qr-card'>
        <View className='qr-card__top' />
        <Text className='qr-card__name'>{activeTab === 0 ? '我的编排总览' : flowTabs[activeTab]}</Text>
        <Text className='qr-card__org'>按时间顺序管理活动组合</Text>

        {activeTab === 0 && (
          <View className='qr-card__body'>
            {plan.length === 0 ? (
              <View className='qr-card__bodyEmpty'>
                <Text className='qr-card__bodyText'>还没有加入任何活动</Text>
                <View className='qr-card__bodyLine' />
                <Text className='qr-card__bodyHint'>去活动日程里点“加入到我的编排”</Text>
              </View>
            ) : (
              planGroups.map((group) => (
                <View key={group.key} className='plan-slot'>
                  <View className='plan-slot__time'>
                    <Text className='plan-slot__timeMain'>{group.time}</Text>
                    <Text className='plan-slot__timeSub'>{dayLabelMap[group.day]}</Text>
                  </View>
                  <View className='plan-slot__stack'>
                    {group.items.map((item) => (
                      <View key={item.id} className='plan-slot__item'>
                        <View className='plan-slot__itemTop'>
                          <Text className='plan-slot__title'>{item.title}</Text>
                          <Text
                            className='plan-slot__remove'
                            onClick={() => {
                              removeFromPlan(item.id)
                            }}
                          >
                            移除
                          </Text>
                        </View>
                        <Text className='plan-slot__meta'>
                          {item.place} · {item.tag}
                        </Text>
                      </View>
                    ))}
                    <View
                      className='plan-slot__append'
                      onClick={() => {
                        Taro.switchTab({ url: '/pages/schedule/index' })
                      }}
                    >
                      <Text className='plan-slot__appendText'>继续往这个时间段里追加活动</Text>
                      <Text className='plan-slot__appendIcon'>＋</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 1 && (
          <View className='qr-card__body'>
            <Text className='qr-card__bodyText'>
              {statusSummary.multiSlotCount > 0 ? '多场活动已自动堆叠到同一时间段' : '未发现需要拆分的时间段'}
            </Text>
            <View className='qr-card__bodyLine' />
            <Text className='qr-card__bodyHint'>{statusSummary.appendHint}</Text>
          </View>
        )}

        {activeTab === 2 && (
          <View className='qr-card__body'>
            <Text className='qr-card__bodyText'>已加入 {plan.length} 场活动</Text>
            <View className='qr-card__bodyLine' />
            <Text className='qr-card__bodyHint'>同一时段的活动会被放到同一行里</Text>
          </View>
        )}

        {activeTab === 3 && (
          <View className='qr-card__body'>
            <Text className='qr-card__bodyText'>{statusSummary.slots} 个时间段</Text>
            <View className='qr-card__bodyLine' />
            <Text className='qr-card__bodyHint'>继续加活动时，会优先并入已有时间段</Text>
          </View>
        )}
      </View>
    </View>
  )
}
