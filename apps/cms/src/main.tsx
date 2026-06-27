import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Button, Input, Layout, MessagePlugin, Select, Switch, Tag, Textarea, Typography } from 'tdesign-react'
import type { Activity, ActivityOrganizer, ActivityPublication, ExpoBooth, Organizer, PageConfig, Session, SessionSpeaker, Speaker, Sponsor, StaffGrant, User } from '@eventos/contracts'
import 'tdesign-react/es/style/index.css'
import './styles.css'

const { Header, Aside, Content } = Layout

type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> } | { error: { code: string; message: string } }
type StaffGrantResult = { grant: StaffGrant; user: User }
type TenantResourceKind = 'organizers' | 'sponsors' | 'speakers'

const defaultApiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'
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

function defaultDateInput(offsetHours: number) {
  const value = new Date(Date.now() + offsetHours * 60 * 60 * 1000)
  value.setMinutes(0, 0, 0)
  return value.toISOString().slice(0, 16)
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
  const [staffGrants, setStaffGrants] = useState<StaffGrant[]>([])
  const [activityOrganizers, setActivityOrganizers] = useState<ActivityOrganizer[]>([])
  const [sessionSpeakers, setSessionSpeakers] = useState<SessionSpeaker[]>([])
  const [expoBooths, setExpoBooths] = useState<ExpoBooth[]>([])
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const selected = activities.find((activity) => activity.id === selectedId)

  const draft = useMemo(
    () => ({
      name: selected?.name ?? '',
      description: selected?.description ?? '',
      start_time: selected ? dateInput(selected.start_time) : defaultDateInput(24),
      end_time: selected ? dateInput(selected.end_time) : defaultDateInput(32),
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
  const [staffForm, setStaffForm] = useState({
    authing_user_id: '',
    display_name: '',
  })
  const [organizerForm, setOrganizerForm] = useState({ name: '', website_url: '', contact: '' })
  const [sponsorForm, setSponsorForm] = useState({ name: '', website_url: '', description: '' })
  const [speakerForm, setSpeakerForm] = useState({ name: '', title: '', organization: '' })
  const [activityOrganizerForm, setActivityOrganizerForm] = useState({ organizer_id: '', sort_order: '0' })
  const [sessionSpeakerForm, setSessionSpeakerForm] = useState({ session_id: '', speaker_id: '', role: 'speaker', sort_order: '0' })
  const [expoBoothForm, setExpoBoothForm] = useState({ name: '', sponsor_id: '', category: '', location: '', sort_order: '0', status: 'visible' })

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

  async function loadWorkspace() {
    await loadActivities()
    await loadTenantResources()
  }

  async function loadTenantResources() {
    const rows = await run(async () => {
      const [organizerRows, sponsorRows, speakerRows] = await Promise.all([
        apiRequest<Organizer[]>({ path: '/operator/organizers', token, apiBase }),
        apiRequest<Sponsor[]>({ path: '/operator/sponsors', token, apiBase }),
        apiRequest<Speaker[]>({ path: '/operator/speakers', token, apiBase }),
      ])
      return { organizerRows, sponsorRows, speakerRows }
    })
    if (rows) {
      setOrganizers(rows.organizerRows)
      setSponsors(rows.sponsorRows)
      setSpeakers(rows.speakerRows)
    }
  }

  async function loadActivityDetail(activityId: string) {
    const detail = await run(async () => {
      const [activityRows, sessionRows, pageRows, publicationRows, staffRows, activityOrganizerRows, expoBoothRows] = await Promise.all([
        apiRequest<Activity>({ path: `/operator/activities/${activityId}`, token, apiBase }),
        apiRequest<Session[]>({ path: `/operator/activities/${activityId}/sessions`, token, apiBase }),
        apiRequest<PageConfig[]>({ path: `/operator/activities/${activityId}/page-configs`, token, apiBase }),
        apiRequest<ActivityPublication[]>({ path: `/operator/activities/${activityId}/publications`, token, apiBase }),
        apiRequest<StaffGrant[]>({ path: `/operator/activities/${activityId}/staff-grants`, token, apiBase }),
        apiRequest<ActivityOrganizer[]>({ path: `/operator/activities/${activityId}/organizers`, token, apiBase }),
        apiRequest<ExpoBooth[]>({ path: `/operator/activities/${activityId}/expo-booths`, token, apiBase }),
      ])
      const speakerRows = (await Promise.all(sessionRows.map((session) => apiRequest<SessionSpeaker[]>({ path: `/operator/sessions/${session.id}/speakers`, token, apiBase })))).flat()
      return { activityRows, sessionRows, pageRows, publicationRows, staffRows, activityOrganizerRows, expoBoothRows, speakerRows }
    })
    if (detail) {
      setActivities((current) => current.map((item) => (item.id === detail.activityRows.id ? detail.activityRows : item)))
      setSessions(detail.sessionRows)
      setPageConfigs(detail.pageRows)
      setPublications(detail.publicationRows)
      setStaffGrants(detail.staffRows)
      setActivityOrganizers(detail.activityOrganizerRows)
      setExpoBooths(detail.expoBoothRows)
      setSessionSpeakers(detail.speakerRows)
      setSessionSpeakerForm((form) => ({ ...form, session_id: form.session_id || detail.sessionRows[0]?.id || '' }))
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
      void loadTenantResources()
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

  async function upsertStaffGrant() {
    if (!selected) return
    const result = await run(() =>
      apiRequest<StaffGrantResult>({
        path: `/operator/activities/${selected.id}/staff-grants`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          authing_user_id: staffForm.authing_user_id,
          display_name: staffForm.display_name,
        },
      }),
    )
    if (result) {
      setStaffForm({ authing_user_id: '', display_name: '' })
      void loadActivityDetail(selected.id)
      void MessagePlugin.success('Staff grant saved')
    }
  }

  async function createTenantResource(kind: TenantResourceKind) {
    const body =
      kind === 'organizers'
        ? organizerForm
        : kind === 'sponsors'
          ? sponsorForm
          : speakerForm
    const resource = await run(() =>
      apiRequest<Organizer | Sponsor | Speaker>({
        path: `/operator/${kind}`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body,
      }),
    )
    if (resource) {
      if (kind === 'organizers') setOrganizerForm({ name: '', website_url: '', contact: '' })
      if (kind === 'sponsors') setSponsorForm({ name: '', website_url: '', description: '' })
      if (kind === 'speakers') setSpeakerForm({ name: '', title: '', organization: '' })
      void loadTenantResources()
    }
  }

  async function upsertActivityOrganizer() {
    if (!selected) return
    const link = await run(() =>
      apiRequest<ActivityOrganizer>({
        path: `/operator/activities/${selected.id}/organizers`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          organizer_id: activityOrganizerForm.organizer_id,
          sort_order: Number(activityOrganizerForm.sort_order),
        },
      }),
    )
    if (link) {
      setActivityOrganizerForm({ organizer_id: '', sort_order: '0' })
      void loadActivityDetail(selected.id)
    }
  }

  async function upsertSessionSpeaker() {
    if (!sessionSpeakerForm.session_id || !sessionSpeakerForm.speaker_id) return
    const link = await run(() =>
      apiRequest<SessionSpeaker>({
        path: `/operator/sessions/${sessionSpeakerForm.session_id}/speakers`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          speaker_id: sessionSpeakerForm.speaker_id,
          role: sessionSpeakerForm.role,
          sort_order: Number(sessionSpeakerForm.sort_order),
        },
      }),
    )
    if (link && selected) {
      setSessionSpeakerForm((form) => ({ ...form, speaker_id: '', sort_order: '0' }))
      void loadActivityDetail(selected.id)
    }
  }

  async function createExpoBooth() {
    if (!selected) return
    const booth = await run(() =>
      apiRequest<ExpoBooth>({
        path: `/operator/activities/${selected.id}/expo-booths`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          name: expoBoothForm.name,
          sponsor_id: expoBoothForm.sponsor_id || undefined,
          category: expoBoothForm.category || undefined,
          location: expoBoothForm.location || undefined,
          sort_order: Number(expoBoothForm.sort_order),
          status: expoBoothForm.status,
        },
      }),
    )
    if (booth) {
      setExpoBoothForm({ name: '', sponsor_id: '', category: '', location: '', sort_order: '0', status: 'visible' })
      void loadActivityDetail(selected.id)
    }
  }

  async function updateExpoBooth(booth: ExpoBooth, body: Record<string, unknown>) {
    if (!selected) return
    const updated = await run(() =>
      apiRequest<ExpoBooth>({
        path: `/operator/expo-booths/${booth.id}`,
        method: 'PATCH',
        token,
        apiBase,
        idempotency: true,
        body,
      }),
    )
    if (updated) {
      setExpoBooths((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    }
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
          <Button theme='primary' loading={loading} onClick={loadWorkspace}>
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

            <div className={`management-grid${selected ? '' : ' management-grid--empty'}`}>
              <section className={`panel panel--split${selected ? '' : ' panel--intro'}`}>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Activity</div>
                    <div className='panel-title'>{selected ? 'Basic Info' : 'Create Activity'}</div>
                  </div>
                  {selected ? (
                    <Button onClick={() => updateActivity()}>
                      Save
                    </Button>
                  ) : (
                    <Button theme='primary' loading={loading} onClick={createActivity}>
                      Create
                    </Button>
                  )}
                </div>
                <Input value={activityForm.name} onChange={(value) => setActivityForm((form) => ({ ...form, name: String(value) }))} placeholder='Activity name' />
                <Textarea value={activityForm.description} onChange={(value) => setActivityForm((form) => ({ ...form, description: String(value) }))} placeholder='Description' />
                <div className='form-grid'>
                  <input className='native-input' type='datetime-local' value={activityForm.start_time} onChange={(event) => setActivityForm((form) => ({ ...form, start_time: event.target.value }))} />
                  <input className='native-input' type='datetime-local' value={activityForm.end_time} onChange={(event) => setActivityForm((form) => ({ ...form, end_time: event.target.value }))} />
                </div>
                <Input value={activityForm.timezone} onChange={(value) => setActivityForm((form) => ({ ...form, timezone: String(value) }))} />
                <Textarea value={activityForm.venue} onChange={(value) => setActivityForm((form) => ({ ...form, venue: String(value) }))} autosize={{ minRows: 4, maxRows: 8 }} />
                {selected ? (
                  <Button theme='danger' variant='outline' onClick={() => updateActivity('archived')}>
                    Archive
                  </Button>
                ) : null}
              </section>

              {selected ? (
                <>

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

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Organizers</div>
                    <div className='panel-title'>{organizers.length} tenant brands</div>
                  </div>
                  <Button onClick={() => createTenantResource('organizers')}>Add</Button>
                </div>
                <Input value={organizerForm.name} onChange={(value) => setOrganizerForm((form) => ({ ...form, name: String(value) }))} placeholder='Organizer name' />
                <div className='form-grid'>
                  <Input value={organizerForm.website_url} onChange={(value) => setOrganizerForm((form) => ({ ...form, website_url: String(value) }))} placeholder='Website URL' />
                  <Input value={organizerForm.contact} onChange={(value) => setOrganizerForm((form) => ({ ...form, contact: String(value) }))} placeholder='Contact' />
                </div>
                <div className='feed-list compact'>
                  {organizers.map((organizer) => (
                    <div key={organizer.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{organizer.name}</div>
                        <div className='feed-row__meta'>{organizer.website_url ?? organizer.contact ?? organizer.id}</div>
                      </div>
                      <Tag variant='light'>Organizer</Tag>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Sponsors</div>
                    <div className='panel-title'>{sponsors.length} sponsor brands</div>
                  </div>
                  <Button onClick={() => createTenantResource('sponsors')}>Add</Button>
                </div>
                <Input value={sponsorForm.name} onChange={(value) => setSponsorForm((form) => ({ ...form, name: String(value) }))} placeholder='Sponsor name' />
                <Input value={sponsorForm.website_url} onChange={(value) => setSponsorForm((form) => ({ ...form, website_url: String(value) }))} placeholder='Website URL' />
                <Textarea value={sponsorForm.description} onChange={(value) => setSponsorForm((form) => ({ ...form, description: String(value) }))} autosize={{ minRows: 3, maxRows: 5 }} placeholder='Description' />
                <div className='feed-list compact'>
                  {sponsors.map((sponsor) => (
                    <div key={sponsor.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{sponsor.name}</div>
                        <div className='feed-row__meta'>{sponsor.website_url ?? sponsor.id}</div>
                      </div>
                      <Tag variant='light'>Sponsor</Tag>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Expo Booths</div>
                    <div className='panel-title'>{expoBooths.length} Activity booths</div>
                  </div>
                  <Button disabled={!selected || !expoBoothForm.name} onClick={createExpoBooth}>Add</Button>
                </div>
                <Input value={expoBoothForm.name} onChange={(value) => setExpoBoothForm((form) => ({ ...form, name: String(value) }))} placeholder='Booth name' />
                <Select value={expoBoothForm.sponsor_id} onChange={(value) => setExpoBoothForm((form) => ({ ...form, sponsor_id: String(value) }))} options={[
                  { label: 'No Sponsor', value: '' },
                  ...sponsors.map((sponsor) => ({ label: sponsor.name, value: sponsor.id })),
                ]} />
                <div className='form-grid'>
                  <Input value={expoBoothForm.category} onChange={(value) => setExpoBoothForm((form) => ({ ...form, category: String(value) }))} placeholder='Category' />
                  <Input value={expoBoothForm.location} onChange={(value) => setExpoBoothForm((form) => ({ ...form, location: String(value) }))} placeholder='Location' />
                </div>
                <div className='form-grid'>
                  <Input value={expoBoothForm.sort_order} onChange={(value) => setExpoBoothForm((form) => ({ ...form, sort_order: String(value) }))} placeholder='Sort order' />
                  <Select value={expoBoothForm.status} onChange={(value) => setExpoBoothForm((form) => ({ ...form, status: String(value) }))} options={[
                    { label: 'Visible', value: 'visible' },
                    { label: 'Hidden', value: 'hidden' },
                  ]} />
                </div>
                <div className='feed-list compact'>
                  {expoBooths.map((booth) => {
                    const sponsor = sponsors.find((item) => item.id === booth.sponsor_id)
                    return (
                      <div key={booth.id} className='feed-row'>
                        <div>
                          <div className='feed-row__title'>{booth.name}</div>
                          <div className='feed-row__meta'>{sponsor?.name ?? 'No Sponsor'} / {booth.category ?? 'Uncategorized'} / {booth.location ?? 'No location'} / Sort {booth.sort_order}</div>
                        </div>
                        <div className='row-actions'>
                          <Select className='row-select' value={booth.sponsor_id ?? ''} onChange={(value) => updateExpoBooth(booth, { sponsor_id: String(value) || null })} options={[
                            { label: 'No Sponsor', value: '' },
                            ...sponsors.map((item) => ({ label: item.name, value: item.id })),
                          ]} />
                          <Button variant='outline' onClick={() => updateExpoBooth(booth, { status: booth.status === 'visible' ? 'hidden' : 'visible' })}>
                            {booth.status === 'visible' ? 'Hide' : 'Show'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Speakers</div>
                    <div className='panel-title'>{speakers.length} people</div>
                  </div>
                  <Button onClick={() => createTenantResource('speakers')}>Add</Button>
                </div>
                <Input value={speakerForm.name} onChange={(value) => setSpeakerForm((form) => ({ ...form, name: String(value) }))} placeholder='Speaker name' />
                <div className='form-grid'>
                  <Input value={speakerForm.title} onChange={(value) => setSpeakerForm((form) => ({ ...form, title: String(value) }))} placeholder='Title' />
                  <Input value={speakerForm.organization} onChange={(value) => setSpeakerForm((form) => ({ ...form, organization: String(value) }))} placeholder='Organization' />
                </div>
                <div className='feed-list compact'>
                  {speakers.map((speaker) => (
                    <div key={speaker.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{speaker.name}</div>
                        <div className='feed-row__meta'>{speaker.title ?? speaker.organization ?? speaker.id}</div>
                      </div>
                      <Tag variant='light'>Speaker</Tag>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Activity Organizers</div>
                    <div className='panel-title'>{activityOrganizers.length} linked</div>
                  </div>
                  <Button disabled={!selected || !activityOrganizerForm.organizer_id} onClick={upsertActivityOrganizer}>Link</Button>
                </div>
                <Select value={activityOrganizerForm.organizer_id} onChange={(value) => setActivityOrganizerForm((form) => ({ ...form, organizer_id: String(value) }))} options={organizers.map((organizer) => ({ label: organizer.name, value: organizer.id }))} />
                <Input value={activityOrganizerForm.sort_order} onChange={(value) => setActivityOrganizerForm((form) => ({ ...form, sort_order: String(value) }))} placeholder='Sort order' />
                <div className='feed-list compact'>
                  {activityOrganizers.map((link) => {
                    const organizer = organizers.find((item) => item.id === link.organizer_id)
                    return (
                      <div key={`${link.activity_id}-${link.organizer_id}`} className='feed-row'>
                        <div>
                          <div className='feed-row__title'>{organizer?.name ?? link.organizer_id}</div>
                          <div className='feed-row__meta'>Sort {link.sort_order}</div>
                        </div>
                        <Tag variant='light'>Linked</Tag>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className='panel panel--split'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Session Speakers</div>
                    <div className='panel-title'>{sessionSpeakers.length} linked</div>
                  </div>
                  <Button disabled={!sessionSpeakerForm.session_id || !sessionSpeakerForm.speaker_id} onClick={upsertSessionSpeaker}>Link</Button>
                </div>
                <Select value={sessionSpeakerForm.session_id} onChange={(value) => setSessionSpeakerForm((form) => ({ ...form, session_id: String(value) }))} options={sessions.map((session) => ({ label: session.title, value: session.id }))} />
                <div className='form-grid'>
                  <Select value={sessionSpeakerForm.speaker_id} onChange={(value) => setSessionSpeakerForm((form) => ({ ...form, speaker_id: String(value) }))} options={speakers.map((speaker) => ({ label: speaker.name, value: speaker.id }))} />
                  <Select value={sessionSpeakerForm.role} onChange={(value) => setSessionSpeakerForm((form) => ({ ...form, role: String(value) }))} options={[
                    { label: 'Speaker', value: 'speaker' },
                    { label: 'Host', value: 'host' },
                    { label: 'Panelist', value: 'panelist' },
                    { label: 'Guest', value: 'guest' },
                  ]} />
                </div>
                <Input value={sessionSpeakerForm.sort_order} onChange={(value) => setSessionSpeakerForm((form) => ({ ...form, sort_order: String(value) }))} placeholder='Sort order' />
                <div className='feed-list compact'>
                  {sessionSpeakers.map((link) => {
                    const session = sessions.find((item) => item.id === link.session_id)
                    const speaker = speakers.find((item) => item.id === link.speaker_id)
                    return (
                      <div key={`${link.session_id}-${link.speaker_id}`} className='feed-row'>
                        <div>
                          <div className='feed-row__title'>{speaker?.name ?? link.speaker_id}</div>
                          <div className='feed-row__meta'>{session?.title ?? link.session_id} / {link.role} / Sort {link.sort_order}</div>
                        </div>
                        <Tag variant='light'>Linked</Tag>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className='panel panel--split span-2'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Staff Grants</div>
                    <div className='panel-title'>{staffGrants.length} Activity-scoped Staff</div>
                  </div>
                  <Button disabled={!selected} onClick={upsertStaffGrant}>
                    Grant
                  </Button>
                </div>
                <div className='form-grid'>
                  <Input value={staffForm.authing_user_id} onChange={(value) => setStaffForm((form) => ({ ...form, authing_user_id: String(value) }))} placeholder='Authing user subject' />
                  <Input value={staffForm.display_name} onChange={(value) => setStaffForm((form) => ({ ...form, display_name: String(value) }))} placeholder='Display name' />
                </div>
                <div className='feed-list compact'>
                  {staffGrants.map((grant) => (
                    <div key={grant.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{grant.authing_user_id}</div>
                        <div className='feed-row__meta'>{grant.user_id} / {grant.created_at}</div>
                      </div>
                      <Tag theme='primary' variant='light'>
                        Staff
                      </Tag>
                    </div>
                  ))}
                </div>
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
                </>
              ) : (
                <section className='empty-state'>
                  <div className='panel-label'>Workspace</div>
                  <div className='empty-state__title'>No Activity selected</div>
                  <p>Run db:migrate, start the API, enter an operator token, then Load Workspace to open available Activities and resource panels.</p>
                </section>
              )}
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
