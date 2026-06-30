import { useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { RegistrationForm } from '@eventos/contracts'
import { getStoredActivityId, loadRegistrationForm, register, submitRegistrationForm } from '../../utils/api'
import './index.css'

function inputPlaceholder(type: string) {
  const labels: Record<string, string> = {
    email: '请输入邮箱',
    phone: '请输入手机号',
    text: '请输入内容',
  }
  return labels[type] ?? '请选择'
}

export default function RegisterPage() {
  const [form, setForm] = useState<RegistrationForm>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('加载报名信息中')
  const loadRef = useRef<Promise<void> | null>(null)
  const loadedRef = useRef(false)

  async function load() {
    if (loadRef.current) return loadRef.current
    if (loadedRef.current) return
    const request = (async () => {
      const activityId = getStoredActivityId()
      if (!activityId) {
        setStatus('请先在首页选择活动')
        return
      }
      try {
        const detail = await loadRegistrationForm(activityId)
        setForm(detail)
        setStatus('请填写报名信息')
      } catch {
        setForm(undefined)
        setStatus('当前活动无需填写表单，可直接报名')
      }
      loadedRef.current = true
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

  async function submit() {
    const activityId = getStoredActivityId()
    if (!activityId) return
    try {
      if (form) {
        const typedAnswers = form.fields.reduce<Record<string, unknown>>((current, field) => {
          const value = answers[field.key]
          if (value === undefined || value === '') return current
          current[field.key] = field.type === 'boolean' ? value === 'true' : field.type === 'multi_select' ? value.split(',').filter(Boolean) : value
          return current
        }, {})
        await submitRegistrationForm(activityId, typedAnswers)
      } else {
        await register(activityId)
      }
      Taro.showToast({ title: '报名已提交', icon: 'none' })
      Taro.switchTab({ url: '/pages/me/index' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none' })
    }
  }

  return (
    <View className='page page--register'>
      <View className='register-card'>
        <Text className='register-card__label'>活动报名</Text>
        <Text className='register-card__title'>{form?.title ?? '确认报名'}</Text>
        <Text className='register-card__hint'>{status}</Text>
        <View className='register-divider' />
        {form ? (
          form.fields.map((field) => (
            <View key={field.id} className='register-field'>
              <Text className='register-field__label'>{field.label}{field.required ? ' *' : ''}</Text>
              {field.type === 'boolean' ? (
                <View className='register-options'>
                  {[
                    { label: '是', value: 'true' },
                    { label: '否', value: 'false' },
                  ].map((option) => (
                    <Text key={option.value} className={`register-option${answers[field.key] === option.value ? ' register-option--active' : ''}`} onClick={() => setAnswers((current) => ({ ...current, [field.key]: option.value }))}>
                      {option.label}
                    </Text>
                  ))}
                </View>
              ) : field.options?.length ? (
                <View className='register-options'>
                  {field.options.map((option) => {
                    const values = new Set((answers[field.key] ?? '').split(',').filter(Boolean))
                    const active = field.type === 'multi_select' ? values.has(option.value) : answers[field.key] === option.value
                    return (
                      <Text
                        key={option.value}
                        className={`register-option${active ? ' register-option--active' : ''}`}
                        onClick={() => {
                          if (field.type !== 'multi_select') {
                            setAnswers((current) => ({ ...current, [field.key]: option.value }))
                            return
                          }
                          const next = new Set(values)
                          if (next.has(option.value)) next.delete(option.value)
                          else next.add(option.value)
                          setAnswers((current) => ({ ...current, [field.key]: Array.from(next).join(',') }))
                        }}
                      >
                        {option.label}
                      </Text>
                    )
                  })}
                </View>
              ) : (
                <Input value={answers[field.key] ?? ''} placeholder={inputPlaceholder(field.type)} onInput={(event) => setAnswers((current) => ({ ...current, [field.key]: event.detail.value }))} />
              )}
            </View>
          ))
        ) : (
          <Text className='register-card__empty'>点击提交后将生成报名记录和入场凭证。</Text>
        )}
        <View className='register-submit' onClick={submit}>提交报名</View>
      </View>
    </View>
  )
}
