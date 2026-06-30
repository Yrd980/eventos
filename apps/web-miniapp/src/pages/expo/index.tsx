import { useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { BoothCheckin, BoothCollection, ExpoBooth } from '@eventos/contracts'
import { addMyBooth, checkinBooth, loadParticipantExpo, removeMyBooth, resolveActivityId } from '../../utils/api'
import './index.css'

const MAX_VISIBLE_BOOTHS = 30
const ALL_CATEGORIES = 'all'
const VIEW_ALL = 'all'
const VIEW_MY = 'my'

export default function ExpoPage() {
  const [items, setItems] = useState<ExpoBooth[]>([])
  const [myBooths, setMyBooths] = useState<BoothCollection[]>([])
  const [boothCheckins, setBoothCheckins] = useState<BoothCheckin[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES)
  const [activeView, setActiveView] = useState<typeof VIEW_ALL | typeof VIEW_MY>(VIEW_ALL)
  const [status, setStatus] = useState('加载展区中')
  const loadRef = useRef<Promise<void> | null>(null)
  const loadedRef = useRef(false)
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category).filter((item): item is string => Boolean(item)))), [items])
  const myBoothSet = useMemo(() => new Set(myBooths.map((item) => item.expo_booth_id)), [myBooths])
  const checkinSet = useMemo(() => new Set(boothCheckins.map((item) => item.expo_booth_id)), [boothCheckins])
  const filteredItems = useMemo(() => {
    const byView = activeView === VIEW_MY ? items.filter((item) => myBoothSet.has(item.id)) : items
    return activeCategory === ALL_CATEGORIES ? byView : byView.filter((item) => item.category === activeCategory)
  }, [activeCategory, activeView, items, myBoothSet])
  const activeItem = filteredItems.find((item) => item.id === activeId) ?? filteredItems[0]
  const visibleItems = filteredItems.slice(0, MAX_VISIBLE_BOOTHS)

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
        const state = await loadParticipantExpo(resolvedActivityId)
        const rows = state.expo_booths
        const collectionRows = state.my_booths
        const checkinRows = state.booth_checkins
        setItems(rows)
        setMyBooths(collectionRows)
        setBoothCheckins(checkinRows)
        const nextCategories = new Set(rows.map((item) => item.category).filter(Boolean))
        const nextActiveCategory = activeCategory === ALL_CATEGORIES || nextCategories.has(activeCategory) ? activeCategory : ALL_CATEGORIES
        setActiveCategory(nextActiveCategory)
        const nextRows = nextActiveCategory === ALL_CATEGORIES ? rows : rows.filter((item) => item.category === nextActiveCategory)
        setActiveId((current) => (current && nextRows.some((item) => item.id === current) ? current : nextRows[0]?.id))
        setStatus(rows.length ? '展区已加载' : '暂无展位')
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

  async function toggleCollection(item: ExpoBooth) {
    try {
      if (myBoothSet.has(item.id)) {
        await removeMyBooth(item.id)
        setMyBooths((current) => current.filter((existing) => existing.expo_booth_id !== item.id))
        Taro.showToast({ title: '已从我的展位移除', icon: 'none' })
        return
      }
      const next = await addMyBooth(item.id)
      setMyBooths((current) => (current.some((existing) => existing.expo_booth_id === next.expo_booth_id) ? current : [...current, next]))
      Taro.showToast({ title: '已加入我的展位', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  async function recordBoothCheckin(item: ExpoBooth) {
    try {
      const next = await checkinBooth(item.id)
      setBoothCheckins((current) => (current.some((existing) => existing.expo_booth_id === next.expo_booth_id) ? current : [...current, next]))
      Taro.showToast({ title: '展位签到已记录', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  return (
    <View className='page'>
      <View className='expo-map'>
        <Text className='expo-map__title'>展区</Text>
        <Text className='expo-map__sub'>{status} · {filteredItems.length} 个展位 · 我的展位 {myBooths.length}</Text>

        <View className='filter-strip'>
          <Text className={`filter-chip${activeView === VIEW_ALL ? ' filter-chip--active' : ''}`} onClick={() => setActiveView(VIEW_ALL)}>全部展位</Text>
          <Text className={`filter-chip${activeView === VIEW_MY ? ' filter-chip--active' : ''}`} onClick={() => setActiveView(VIEW_MY)}>我的展位</Text>
        </View>

        {categories.length > 1 && (
          <View className='filter-strip'>
            <Text
              className={`filter-chip${activeCategory === ALL_CATEGORIES ? ' filter-chip--active' : ''}`}
              onClick={() => {
                setActiveCategory(ALL_CATEGORIES)
                setActiveId(items[0]?.id)
              }}
            >
              全部
            </Text>
            {categories.map((item) => (
              <Text
                key={item}
                className={`filter-chip${item === activeCategory ? ' filter-chip--active' : ''}`}
                onClick={() => {
                  setActiveCategory(item)
                  setActiveId(items.find((booth) => booth.category === item)?.id)
                }}
              >
                {item}
              </Text>
            ))}
          </View>
        )}

        <View className='expo-map__body'>
          {filteredItems.slice(0, 3).map((item) => (
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
        <Text className='expo-focus__code'>{activeItem?.category ?? '展区'}</Text>
        <Text className='expo-focus__title'>{activeItem?.name ?? '暂无展位'}</Text>
        <Text className='expo-focus__meta'>{activeItem?.location ?? activeItem?.description ?? '展位信息待配置'}</Text>
        {activeItem && (
          <View className='expo-actions'>
            <Text className={`expo-focus__cta${myBoothSet.has(activeItem.id) ? ' expo-focus__cta--muted' : ''}`} onClick={() => void toggleCollection(activeItem)}>
              {myBoothSet.has(activeItem.id) ? '已在我的展位' : '加入我的展位'}
            </Text>
            <Text className={`expo-focus__cta${checkinSet.has(activeItem.id) ? ' expo-focus__cta--muted' : ''}`} onClick={() => void recordBoothCheckin(activeItem)}>
              {checkinSet.has(activeItem.id) ? '已签到' : '展位签到'}
            </Text>
          </View>
        )}
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
              <Text className='list__meta'>{item.location ?? item.description ?? '展位'}</Text>
              <Text className='list__state'>
                {myBoothSet.has(item.id) ? '我的展位' : '未加入'} · {checkinSet.has(item.id) ? '已签到' : '未签到'}
              </Text>
            </View>
          </View>
        ))}
        {visibleItems.length === 0 && (
          <View className='list__empty'>
            <Text>当前筛选下暂无展位</Text>
          </View>
        )}
      </View>
    </View>
  )
}
