import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import './index.css'

const items = [
  { code: 'A1', title: '主舞台', note: '开场 / 发布' },
  { code: 'B2', title: '创新展区', note: '演示 / 互动' },
  { code: 'C3', title: '服务台', note: '签到 / 咨询' },
  { code: 'D4', title: '休息区', note: '补给 / 等候' },
]

export default function ExpoPage() {
  const [activeCode, setActiveCode] = useState(items[0].code)

  const activeItem = items.find((item) => item.code === activeCode) ?? items[0]

  const handleRowTap = (code: string) => {
    setActiveCode(code)
  }

  return (
    <View className='page'>
      <View className='expo-map'>
        <Text className='expo-map__title'>展区导览</Text>
        <Text className='expo-map__sub'>入口 / 路线 / 打卡点</Text>
        <View className='expo-map__body'>
          <View className={`expo-map__node${activeCode === 'A1' ? ' expo-map__node--main' : ''}`} onClick={() => handleRowTap('A1')}>
            <Text className='expo-map__nodeTitle'>主舞台</Text>
          </View>
          <View className='expo-map__line' />
          <View className={`expo-map__node${activeCode === 'B2' ? ' expo-map__node--main' : ''}`} onClick={() => handleRowTap('B2')}>
            <Text className='expo-map__nodeTitle'>创新展区</Text>
          </View>
          <View className='expo-map__line expo-map__line--short' />
          <View className={`expo-map__node${activeCode === 'C3' ? ' expo-map__node--main' : ''}`} onClick={() => handleRowTap('C3')}>
            <Text className='expo-map__nodeTitle'>服务台</Text>
          </View>
        </View>
      </View>

      <View className='expo-focus'>
        <Text className='expo-focus__code'>{activeItem.code}</Text>
        <Text className='expo-focus__title'>{activeItem.title}</Text>
        <Text className='expo-focus__meta'>{activeItem.note}</Text>
        <View className='expo-focus__cta'>
          查看路线
        </View>
      </View>

      <View className='list'>
        {items.map((item) => (
          <View
            key={item.code}
            className={`list__row${item.code === activeCode ? ' list__row--active' : ''}`}
            onClick={() => handleRowTap(item.code)}
          >
            <Text className='list__code'>{item.code}</Text>
            <View className='list__content'>
              <Text className='list__title'>{item.title}</Text>
              <Text className='list__meta'>{item.note}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
