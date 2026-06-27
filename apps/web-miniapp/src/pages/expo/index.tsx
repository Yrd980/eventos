import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import type { ExpoBooth } from '@eventos/contracts'
import { loadExpoBooths, resolveActivityId } from '../../utils/api'
import './index.css'

const MAX_VISIBLE_BOOTHS = 20

export default function ExpoPage() {
  const [items, setItems] = useState<ExpoBooth[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [status, setStatus] = useState('加载展区中')
  const activeItem = items.find((item) => item.id === activeId) ?? items[0]
  const visibleItems = items.slice(0, MAX_VISIBLE_BOOTHS)

  async function load() {
    const activityId = await resolveActivityId()
    if (!activityId) {
      setStatus('请先在首页选择 Activity')
      return
    }
    try {
      const rows = await loadExpoBooths(activityId)
      setItems(rows)
      setActiveId(rows[0]?.id)
      setStatus(rows.length ? '展区已加载' : '暂无 Expo Booth')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <View className='page'>
      <View className='expo-map'>
        <Text className='expo-map__title'>Expo</Text>
        <Text className='expo-map__sub'>{status}</Text>
        <View className='expo-map__body'>
          {items.slice(0, 3).map((item) => (
            <View
              key={item.id}
              className={`expo-map__node${activeId === item.id ? ' expo-map__node--main' : ''}`}
              onClick={() => {
                if (item.id !== activeId) setActiveId(item.id)
              }}
            >
              <Text className='expo-map__nodeTitle'>{item.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='expo-focus'>
        <Text className='expo-focus__code'>{activeItem?.category ?? 'Expo'}</Text>
        <Text className='expo-focus__title'>{activeItem?.name ?? 'No booth'}</Text>
        <Text className='expo-focus__meta'>{activeItem?.location ?? activeItem?.description ?? 'Strong resource from API'}</Text>
        <View className='expo-focus__cta'>查看详情</View>
      </View>

      <View className='list'>
        {visibleItems.map((item) => (
          <View
            key={item.id}
            className={`list__row${item.id === activeId ? ' list__row--active' : ''}`}
            onClick={() => {
              if (item.id !== activeId) setActiveId(item.id)
            }}
          >
            <Text className='list__code'>{item.category ?? item.sort_order}</Text>
            <View className='list__content'>
              <Text className='list__title'>{item.name}</Text>
              <Text className='list__meta'>{item.location ?? item.description ?? 'Expo Booth'}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
