import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Button, Input, Layout, MessagePlugin, Select, Switch, Tag, Textarea, Typography } from 'tdesign-react'
import type { Activity, ActivityPublication, PageConfig, Session } from '@eventos/contracts'
import 'tdesign-react/es/style/index.css'
import './styles.css'

const { Header, Aside, Content } = Layout

type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> } | { error: { code: string; message: string } }

const defaultApiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const idempotencyPrefix = () => `cms_${Date.now()}_${crypto.randomUUID()}`

function isError<T>(value: ApiEnvelope<T>): value is { error: { code: string; message: string } } {
  return 'error' in value
}

async function apiRequest<T>(input: {
  path: string
  method?: string
  token: string
  apiBase: string
  body?: Record<string, unknown>
  idempotency?: boolean
}): Promise<T> {
  const response = await fetch(`${input.apiBase}${input.path}`, {
    method: input.method ?? 'GET',
    headers: {
      authorization: `Bearer ${input.token}`,
      ...(input.body ? { 'content-type': 'application/json' } : {}),
      ...(input.idempotency ? { 'idempotency-key': idempotencyPrefix() } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  })
  const payload = (await response.json()) as ApiEnvelope<T>
  if (isError(payload)) {
    throw new Error(`${payload.error.code}: ${payload.error.message}`)
  }
  return payload.data
}

function dateInput(value: string) {
  return value.slice(0, 16)
}

function fromLocalDateTime(value: string) {
  return new Date(value).toISOString()
}

function App() {
  const [apiBase, setApiBase] = useState(defaultApiBase)
  const [token, setToken] = useState(localStorage.getItem('eventos.cms.authing_token') ?? '')
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [sessions, setSessions] = useState<Session[]>([])
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([])
  const [publications, setPublications] = useState<ActivityPublication[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const selected = activities.find((activity) => activity.id === selectedId)

  const draft = useMemo(
    () => ({
      name: selected?.name ?? '',
      description: selected?.description ?? '',
      start_time: selected ? dateInput(selected.start_time) : '',
      end_time: selected ? dateInput(selected.end_time) : '',
      timezone: selected?.timezone ?? 'Asia/Shanghai',
      venue: JSON.stringify(selected?.venue ?? { timezone: 'Asia/Shanghai' }, null, 2),
    }),
    [selected],
  )
  const [activityForm, setActivityForm] = useState(draft)
  const [sessionForm, setSessionForm] = useState({
    title: '',
    start_time: '',
    end_time: '',
    room_name: '',
    status: 'scheduled',
  })
  const [pageForm, setPageForm] = useState({ page_key: 'home', enabled: true })
  const [blockForm, setBlockForm] = useState({
    page_key: 'home',
    block_key: 'hero',
    sort_order: '0',
    enabled: true,
    config: '{}',
  })

  useEffect(() => setActivityForm(draft), [draft])

  async function run<T>(operation: () => Promise<T>) {
    setLoading(true)
    setError(undefined)
    try {
      return await operation()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      void MessagePlugin.error(message)
      return undefined
    } finally {
      setLoading(false)
    }
  }

  async function loadActivities() {
    const rows = await run(() => apiRequest<Activity[]>({ path: '/operator/activities?limit=50', token, apiBase }))
    if (rows) {
      setActivities(rows)
      setSelectedId((current) => current ?? rows[0]?.id)
    }
  }

  async function loadActivityDetail(activityId: string) {
    const detail = await run(async () => {
      const [activityRows, sessionRows, pageRows, publicationRows] = await Promise.all([
        apiRequest<Activity>({ path: `/operator/activities/${activityId}`, token, apiBase }),
        apiRequest<Session[]>({ path: `/operator/activities/${activityId}/sessions`, token, apiBase }),
        apiRequest<PageConfig[]>({ path: `/operator/activities/${activityId}/page-configs`, token, apiBase }),
        apiRequest<ActivityPublication[]>({ path: `/operator/activities/${activityId}/publications`, token, apiBase }),
      ])
      return { activityRows, sessionRows, pageRows, publicationRows }
    })
    if (detail) {
      setActivities((current) => current.map((item) => (item.id === detail.activityRows.id ? detail.activityRows : item)))
      setSessions(detail.sessionRows)
      setPageConfigs(detail.pageRows)
      setPublications(detail.publicationRows)
    }
  }

  useEffect(() => {
    if (token) {
      localStorage.setItem('eventos.cms.authing_token', token)
    }
  }, [token])

  useEffect(() => {
    if (token) {
      void loadActivities()
    }
  }, [])

  useEffect(() => {
    if (selectedId && token) {
      void loadActivityDetail(selectedId)
    }
  }, [selectedId])

  async function createActivity() {
    const activity = await run(() =>
      apiRequest<Activity>({
        path: '/operator/activities',
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          name: activityForm.name || 'New Activity',
          description: activityForm.description,
          start_time: fromLocalDateTime(activityForm.start_time),
          end_time: fromLocalDateTime(activityForm.end_time),
          timezone: activityForm.timezone,
          venue: JSON.parse(activityForm.venue),
        },
      }),
    )
    if (activity) {
      setActivities((current) => [activity, ...current])
      setSelectedId(activity.id)
    }
  }

  async function updateActivity(status?: Activity['status']) {
    if (!selected) return
    const activity = await run(() =>
      apiRequest<Activity>({
        path: `/operator/activities/${selected.id}`,
        method: 'PATCH',
        token,
        apiBase,
        idempotency: true,
        body: {
          name: activityForm.name,
          description: activityForm.description,
          start_time: fromLocalDateTime(activityForm.start_time),
          end_time: fromLocalDateTime(activityForm.end_time),
          timezone: activityForm.timezone,
          venue: JSON.parse(activityForm.venue),
          status,
        },
      }),
    )
    if (activity) {
      setActivities((current) => current.map((item) => (item.id === activity.id ? activity : item)))
    }
  }

  async function createSession() {
    if (!selected) return
    const session = await run(() =>
      apiRequest<Session>({
        path: `/operator/activities/${selected.id}/sessions`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          title: sessionForm.title,
          start_time: fromLocalDateTime(sessionForm.start_time),
          end_time: fromLocalDateTime(sessionForm.end_time),
          room_name: sessionForm.room_name,
          status: sessionForm.status,
        },
      }),
    )
    if (session) setSessions((current) => [...current, session])
  }

  async function upsertPageConfig() {
    if (!selected) return
    const page = await run(() =>
      apiRequest<PageConfig>({
        path: `/operator/activities/${selected.id}/page-configs`,
        method: 'PUT',
        token,
        apiBase,
        idempotency: true,
        body: pageForm,
      }),
    )
    if (page) void loadActivityDetail(selected.id)
  }

  async function createBlock() {
    if (!selected) return
    const block = await run(() =>
      apiRequest({
        path: `/operator/activities/${selected.id}/blocks`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          page_key: blockForm.page_key,
          block_key: blockForm.block_key,
          enabled: blockForm.enabled,
          sort_order: Number(blockForm.sort_order),
          config: JSON.parse(blockForm.config),
        },
      }),
    )
    if (block) void loadActivityDetail(selected.id)
  }

  async function publishActivity() {
    if (!selected) return
    const publication = await run(() =>
      apiRequest<ActivityPublication>({
        path: `/operator/activities/${selected.id}/publish`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: { summary: 'CMS publish' },
      }),
    )
    if (publication) void loadActivityDetail(selected.id)
  }

  return (
    <Layout className='app-shell'>
      <Aside className='sidebar'>
        <div className='brand'>
          <div className='brand-mark'>E</div>
          <div>
            <div className='brand-name'>Event OS</div>
            <div className='brand-subtitle'>Operator CMS</div>
          </div>
        </div>

        <div className='sidebar-section'>
          <div className='section-label'>Authing</div>
          <Input value={apiBase} onChange={(value) => setApiBase(String(value))} placeholder='API base URL' />
          <Textarea value={token} onChange={(value) => setToken(String(value))} autosize={{ minRows: 4, maxRows: 6 }} placeholder='Bearer token' />
          <Button theme='primary' loading={loading} onClick={loadActivities}>
            Load Workspace
          </Button>
        </div>

        <div className='sidebar-section sidebar-section--fill'>
          <div className='section-label'>Activities</div>
          <nav className='nav-list'>
            {activities.map((activity) => (
              <button key={activity.id} className={`nav-item${activity.id === selectedId ? ' nav-item--active' : ''}`} type='button' onClick={() => setSelectedId(activity.id)}>
                <span className='nav-item__label'>{activity.name}</span>
                <span className='nav-item__value'>{activity.status}</span>
              </button>
            ))}
          </nav>
        </div>
      </Aside>

      <Layout className='workspace'>
        <Header className='topbar'>
          <div className='topbar-left'>
            <Tag theme={selected?.status === 'published' ? 'success' : selected?.status === 'archived' ? 'warning' : 'default'} variant='light'>
              {selected?.status ?? 'No Activity'}
            </Tag>
            <Typography.Text className='topbar-kicker'>{selected?.id ?? 'Select or create an Activity'}</Typography.Text>
          </div>
          <div className='topbar-actions'>
            <Button loading={loading} onClick={createActivity}>
              Create
            </Button>
            <Button theme='primary' disabled={!selected} loading={loading} onClick={publishActivity}>
              Publish
            </Button>
          </div>
        </Header>

        <Content className='content'>
          <section className='canvas'>
            <div className='canvas-head'>
              <div>
                <p className='eyebrow'>Operator Control</p>
                <Typography.Title level='h1' className='hero-title'>
                  Activity draft, resources, and publication.
                </Typography.Title>
              </div>
              {error ? <div className='error-strip'>{error}</div> : null}
            </div>

            <div className='management-grid'>
              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Activity</div>
                    <div className='panel-title'>Basic Info</div>
                  </div>
                  <Button disabled={!selected} onClick={() => updateActivity()}>
                    Save
                  </Button>
                </div>
                <Input value={activityForm.name} onChange={(value) => setActivityForm((form) => ({ ...form, name: String(value) }))} placeholder='Activity name' />
                <Textarea value={activityForm.description} onChange={(value) => setActivityForm((form) => ({ ...form, description: String(value) }))} placeholder='Description' />
                <div className='form-grid'>
                  <input className='native-input' type='datetime-local' value={activityForm.start_time} onChange={(event) => setActivityForm((form) => ({ ...form, start_time: event.target.value }))} />
                  <input className='native-input' type='datetime-local' value={activityForm.end_time} onChange={(event) => setActivityForm((form) => ({ ...form, end_time: event.target.value }))} />
                </div>
                <Input value={activityForm.timezone} onChange={(value) => setActivityForm((form) => ({ ...form, timezone: String(value) }))} />
                <Textarea value={activityForm.venue} onChange={(value) => setActivityForm((form) => ({ ...form, venue: String(value) }))} autosize={{ minRows: 4, maxRows: 8 }} />
                <Button theme='danger' variant='outline' disabled={!selected} onClick={() => updateActivity('archived')}>
                  Archive
                </Button>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Sessions</div>
                    <div className='panel-title'>{sessions.length} draft Sessions</div>
                  </div>
                  <Button disabled={!selected} onClick={createSession}>
                    Add
                  </Button>
                </div>
                <Input value={sessionForm.title} onChange={(value) => setSessionForm((form) => ({ ...form, title: String(value) }))} placeholder='Session title' />
                <div className='form-grid'>
                  <input className='native-input' type='datetime-local' value={sessionForm.start_time} onChange={(event) => setSessionForm((form) => ({ ...form, start_time: event.target.value }))} />
                  <input className='native-input' type='datetime-local' value={sessionForm.end_time} onChange={(event) => setSessionForm((form) => ({ ...form, end_time: event.target.value }))} />
                </div>
                <Input value={sessionForm.room_name} onChange={(value) => setSessionForm((form) => ({ ...form, room_name: String(value) }))} placeholder='Room' />
                <Select value={sessionForm.status} onChange={(value) => setSessionForm((form) => ({ ...form, status: String(value) }))} options={[
                  { label: 'Scheduled', value: 'scheduled' },
                  { label: 'Hidden', value: 'hidden' },
                  { label: 'Cancelled', value: 'cancelled' },
                ]} />
                <div className='feed-list compact'>
                  {sessions.map((session) => (
                    <div key={session.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{session.title}</div>
                        <div className='feed-row__meta'>{session.start_time} / {session.room_name}</div>
                      </div>
                      <Tag variant='light'>{session.status}</Tag>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Page Config</div>
                    <div className='panel-title'>{pageConfigs.length} pages</div>
                  </div>
                  <Button disabled={!selected} onClick={upsertPageConfig}>
                    Upsert
                  </Button>
                </div>
                <Select value={pageForm.page_key} onChange={(value) => setPageForm((form) => ({ ...form, page_key: String(value) }))} options={[
                  { label: 'Home', value: 'home' },
                  { label: 'Agenda', value: 'agenda' },
                  { label: 'Assistant', value: 'assistant' },
                  { label: 'Expo', value: 'expo' },
                  { label: 'Me', value: 'me' },
                ]} />
                <div className='switch-row'>
                  <span>Enabled</span>
                  <Switch value={pageForm.enabled} onChange={(value) => setPageForm((form) => ({ ...form, enabled: value }))} />
                </div>
                <div className='feed-list compact'>
                  {pageConfigs.map((page) => (
                    <div key={page.id} className='feed-row'>
                      <div className='feed-row__title'>{page.page_key}</div>
                      <div className='feed-row__meta'>{page.blocks.length} blocks</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Blocks</div>
                    <div className='panel-title'>Display composition</div>
                  </div>
                  <Button disabled={!selected} onClick={createBlock}>
                    Add
                  </Button>
                </div>
                <Select value={blockForm.page_key} onChange={(value) => setBlockForm((form) => ({ ...form, page_key: String(value) }))} options={[
                  { label: 'Home', value: 'home' },
                  { label: 'Agenda', value: 'agenda' },
                  { label: 'Assistant', value: 'assistant' },
                  { label: 'Expo', value: 'expo' },
                  { label: 'Me', value: 'me' },
                ]} />
                <div className='form-grid'>
                  <Input value={blockForm.block_key} onChange={(value) => setBlockForm((form) => ({ ...form, block_key: String(value) }))} />
                  <Input value={blockForm.sort_order} onChange={(value) => setBlockForm((form) => ({ ...form, sort_order: String(value) }))} />
                </div>
                <Textarea value={blockForm.config} onChange={(value) => setBlockForm((form) => ({ ...form, config: String(value) }))} autosize={{ minRows: 5, maxRows: 10 }} />
              </section>

              <section className='panel panel--split span-2'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Publications</div>
                    <div className='panel-title'>History</div>
                  </div>
                </div>
                <div className='feed-list compact'>
                  {publications.map((publication) => (
                    <div key={publication.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>Version {publication.version}</div>
                        <div className='feed-row__meta'>{publication.published_at} / {publication.etag.slice(0, 12)}</div>
                      </div>
                      <Tag theme={publication.status === 'published' ? 'success' : 'default'} variant='light'>
                        {publication.status}
                      </Tag>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </Content>
      </Layout>
    </Layout>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
