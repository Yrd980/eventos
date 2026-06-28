import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Button, Input, Layout, MessagePlugin, Select, Switch, Tag, Textarea, Typography } from 'tdesign-react'
import type {
  Activity,
  ActivityOrganizer,
  ActivityPublication,
  ActivityTemplate,
  ExpoBooth,
  Notification,
  OperatorGrant,
  Organizer,
  PageConfig,
  RegistrationSubmission,
  Session,
  SessionSpeaker,
  Speaker,
  Sponsor,
  StaffGrant,
  Survey,
  SurveyAnswer,
  SurveyResponse,
  User,
} from '@eventos/contracts'
import 'tdesign-react/es/style/index.css'
import './styles.css'

const { Header, Aside, Content } = Layout

type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> } | { error: { code: string; message: string } }
type StaffGrantResult = { grant: StaffGrant; user: User }
type OperatorGrantResult = { grant: OperatorGrant; user: User }
type SurveyResponseAnswers = { response: SurveyResponse; answers: SurveyAnswer[] }
type TenantResourceKind = 'organizers' | 'sponsors' | 'speakers'
type WorkspaceSection = 'overview' | 'sessions' | 'pages' | 'communications' | 'brands' | 'expo' | 'responses' | 'access'

const workspaceSections: Array<{ id: WorkspaceSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'pages', label: 'Pages' },
  { id: 'communications', label: 'Comms' },
  { id: 'brands', label: 'Brands' },
  { id: 'expo', label: 'Expo' },
  { id: 'responses', label: 'Responses' },
  { id: 'access', label: 'Access' },
]

const defaultApiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'
const defaultAuthingToken = import.meta.env.VITE_AUTHING_TOKEN ?? ''
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

function statusTheme(status?: Activity['status']) {
  if (status === 'published') return 'success'
  if (status === 'archived') return 'warning'
  return 'default'
}

function compactDateTime(value?: string) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function App() {
  const [apiBase, setApiBase] = useState(defaultApiBase)
  const [token, setToken] = useState(localStorage.getItem('eventos.cms.authing_token') || defaultAuthingToken)
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [sessions, setSessions] = useState<Session[]>([])
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([])
  const [publications, setPublications] = useState<ActivityPublication[]>([])
  const [staffGrants, setStaffGrants] = useState<StaffGrant[]>([])
  const [operatorGrants, setOperatorGrants] = useState<OperatorGrant[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activityTemplates, setActivityTemplates] = useState<ActivityTemplate[]>([])
  const [registrationSubmissions, setRegistrationSubmissions] = useState<RegistrationSubmission[]>([])
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponse[]>([])
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyResponseAnswers>()
  const [activityOrganizers, setActivityOrganizers] = useState<ActivityOrganizer[]>([])
  const [sessionSpeakers, setSessionSpeakers] = useState<SessionSpeaker[]>([])
  const [expoBooths, setExpoBooths] = useState<ExpoBooth[]>([])
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview')
  const selected = activities.find((activity) => activity.id === selectedId)
  const latestPublication = publications[0]

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
  const [operatorGrantForm, setOperatorGrantForm] = useState({
    authing_user_id: '',
    display_name: '',
  })
  const [notificationForm, setNotificationForm] = useState({
    title: '',
    content: '',
    channel: 'miniapp',
    audience_rule: JSON.stringify({ type: 'all_confirmed_participants' }, null, 2),
    status: 'draft',
    scheduled_at: '',
  })
  const [templateForm, setTemplateForm] = useState({
    id: '',
    name: '',
    template_key: '',
    description: '',
    config: '{}',
  })
  const [surveyResponseFilter, setSurveyResponseFilter] = useState('')
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
    await loadActivityTemplates()
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

  async function loadActivityTemplates() {
    const rows = await run(() => apiRequest<ActivityTemplate[]>({ path: '/operator/activity-templates', token, apiBase }))
    if (rows) setActivityTemplates(rows)
  }

  async function loadActivityDetail(activityId: string) {
    const detail = await run(async () => {
      const [
        activityRows,
        sessionRows,
        pageRows,
        publicationRows,
        staffRows,
        operatorRows,
        notificationRows,
        registrationSubmissionRows,
        surveyRows,
        surveyResponseRows,
        activityOrganizerRows,
        expoBoothRows,
      ] = await Promise.all([
        apiRequest<Activity>({ path: `/operator/activities/${activityId}`, token, apiBase }),
        apiRequest<Session[]>({ path: `/operator/activities/${activityId}/sessions`, token, apiBase }),
        apiRequest<PageConfig[]>({ path: `/operator/activities/${activityId}/page-configs`, token, apiBase }),
        apiRequest<ActivityPublication[]>({ path: `/operator/activities/${activityId}/publications`, token, apiBase }),
        apiRequest<StaffGrant[]>({ path: `/operator/activities/${activityId}/staff-grants`, token, apiBase }),
        apiRequest<OperatorGrant[]>({ path: `/operator/activities/${activityId}/operator-grants`, token, apiBase }),
        apiRequest<Notification[]>({ path: `/operator/activities/${activityId}/notifications`, token, apiBase }),
        apiRequest<RegistrationSubmission[]>({ path: `/operator/activities/${activityId}/registration-submissions`, token, apiBase }),
        apiRequest<Survey[]>({ path: `/operator/activities/${activityId}/surveys`, token, apiBase }),
        apiRequest<SurveyResponse[]>({ path: `/operator/activities/${activityId}/survey-responses`, token, apiBase }),
        apiRequest<ActivityOrganizer[]>({ path: `/operator/activities/${activityId}/organizers`, token, apiBase }),
        apiRequest<ExpoBooth[]>({ path: `/operator/activities/${activityId}/expo-booths`, token, apiBase }),
      ])
      const speakerRows = (await Promise.all(sessionRows.map((session) => apiRequest<SessionSpeaker[]>({ path: `/operator/sessions/${session.id}/speakers`, token, apiBase })))).flat()
      return {
        activityRows,
        sessionRows,
        pageRows,
        publicationRows,
        staffRows,
        operatorRows,
        notificationRows,
        registrationSubmissionRows,
        surveyRows,
        surveyResponseRows,
        activityOrganizerRows,
        expoBoothRows,
        speakerRows,
      }
    })
    if (detail) {
      setActivities((current) => current.map((item) => (item.id === detail.activityRows.id ? detail.activityRows : item)))
      setSessions(detail.sessionRows)
      setPageConfigs(detail.pageRows)
      setPublications(detail.publicationRows)
      setStaffGrants(detail.staffRows)
      setOperatorGrants(detail.operatorRows)
      setNotifications(detail.notificationRows)
      setRegistrationSubmissions(detail.registrationSubmissionRows)
      setSurveys(detail.surveyRows)
      setSurveyResponses(detail.surveyResponseRows)
      setSurveyAnswers(undefined)
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
      void loadActivityTemplates()
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

  async function disableStaffGrant(grant: StaffGrant) {
    if (!selected) return
    const updated = await run(() =>
      apiRequest<StaffGrant>({
        path: `/operator/staff-grants/${grant.id}/disable`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {},
      }),
    )
    if (updated) {
      setStaffGrants((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    }
  }

  async function upsertOperatorGrant() {
    if (!selected) return
    const result = await run(() =>
      apiRequest<OperatorGrantResult>({
        path: `/operator/activities/${selected.id}/operator-grants`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {
          authing_user_id: operatorGrantForm.authing_user_id,
          display_name: operatorGrantForm.display_name,
        },
      }),
    )
    if (result) {
      setOperatorGrantForm({ authing_user_id: '', display_name: '' })
      void loadActivityDetail(selected.id)
      void MessagePlugin.success('Operator grant saved')
    }
  }

  async function disableOperatorGrant(grant: OperatorGrant) {
    if (!selected) return
    const updated = await run(() =>
      apiRequest<OperatorGrant>({
        path: `/operator/operator-grants/${grant.id}/disable`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: {},
      }),
    )
    if (updated) {
      setOperatorGrants((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    }
  }

  function templateBody() {
    return {
      name: templateForm.name,
      template_key: templateForm.template_key,
      description: templateForm.description || undefined,
      config: JSON.parse(templateForm.config) as Record<string, unknown>,
    }
  }

  async function saveActivityTemplate() {
    const template = await run(() =>
      apiRequest<ActivityTemplate>({
        path: templateForm.id ? `/operator/activity-templates/${templateForm.id}` : '/operator/activity-templates',
        method: templateForm.id ? 'PATCH' : 'POST',
        token,
        apiBase,
        idempotency: true,
        body: templateBody(),
      }),
    )
    if (template) {
      setTemplateForm({ id: '', name: '', template_key: '', description: '', config: '{}' })
      void loadActivityTemplates()
    }
  }

  function editActivityTemplate(template: ActivityTemplate) {
    setTemplateForm({
      id: template.id,
      name: template.name,
      template_key: template.template_key,
      description: template.description ?? '',
      config: JSON.stringify(template.config, null, 2),
    })
  }

  function notificationBody(status?: Notification['status']) {
    const scheduledAt = notificationForm.scheduled_at ? fromLocalDateTime(notificationForm.scheduled_at) : undefined
    return {
      title: notificationForm.title,
      content: notificationForm.content,
      channel: notificationForm.channel,
      audience_rule: JSON.parse(notificationForm.audience_rule) as Record<string, unknown>,
      status: status ?? notificationForm.status,
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    }
  }

  async function createNotification() {
    if (!selected) return
    const notification = await run(() =>
      apiRequest<Notification>({
        path: `/operator/activities/${selected.id}/notifications`,
        method: 'POST',
        token,
        apiBase,
        idempotency: true,
        body: notificationBody(),
      }),
    )
    if (notification) {
      setNotificationForm({
        title: '',
        content: '',
        channel: 'miniapp',
        audience_rule: JSON.stringify({ type: 'all_confirmed_participants' }, null, 2),
        status: 'draft',
        scheduled_at: '',
      })
      setNotifications((current) => [notification, ...current])
    }
  }

  async function updateNotificationStatus(notification: Notification, status: Notification['status']) {
    if (!selected) return
    const updated = await run(() =>
      apiRequest<Notification>({
        path: `/operator/notifications/${notification.id}`,
        method: 'PATCH',
        token,
        apiBase,
        idempotency: true,
        body: { status },
      }),
    )
    if (updated) {
      setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    }
  }

  async function loadSurveyResponses(surveyId?: string) {
    if (!selected) return
    const query = surveyId ? `?survey_id=${encodeURIComponent(surveyId)}` : ''
    const rows = await run(() => apiRequest<SurveyResponse[]>({ path: `/operator/activities/${selected.id}/survey-responses${query}`, token, apiBase }))
    if (rows) {
      setSurveyResponseFilter(surveyId ?? '')
      setSurveyResponses(rows)
      setSurveyAnswers(undefined)
    }
  }

  async function loadSurveyAnswers(responseId: string) {
    const detail = await run(() => apiRequest<SurveyResponseAnswers>({ path: `/operator/survey-responses/${responseId}/answers`, token, apiBase }))
    if (detail) setSurveyAnswers(detail)
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
      <Aside className='sidebar activity-rail'>
        <div className='brand'>
          <div className='brand-mark'>EO</div>
          <div>
            <div className='brand-name'>Event OS</div>
            <div className='brand-subtitle'>Operator CMS</div>
          </div>
        </div>

        <div className='sidebar-section connection-panel'>
          <div className='section-label'>Authing session</div>
          <Input value={apiBase} onChange={(value) => setApiBase(String(value))} placeholder='API base URL' />
          <Textarea value={token} onChange={(value) => setToken(String(value))} autosize={{ minRows: 3, maxRows: 5 }} placeholder='Bearer token' />
          <Button theme='primary' loading={loading} disabled={!token} onClick={loadWorkspace}>
            Load workspace
          </Button>
        </div>

        <div className='sidebar-section sidebar-section--fill'>
          <div className='rail-heading'>
            <div className='section-label'>Activities</div>
            <span>{activities.length}</span>
          </div>
          <nav className='nav-list'>
            {activities.length ? (
              activities.map((activity) => (
                <button key={activity.id} className={`nav-item${activity.id === selectedId ? ' nav-item--active' : ''}`} type='button' onClick={() => setSelectedId(activity.id)}>
                  <span className='nav-item__label'>{activity.name}</span>
                  <span className='nav-item__value'>
                    <Tag theme={statusTheme(activity.status)} variant='light'>
                      {activity.status}
                    </Tag>
                    <span>{compactDateTime(activity.start_time)}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className='rail-empty'>Enter an operator token and load the workspace.</div>
            )}
          </nav>
        </div>
      </Aside>

      <Layout className='workspace'>
        <Header className='topbar'>
          <div className='topbar-left'>
            <Tag theme={statusTheme(selected?.status)} variant='light'>
              {selected?.status ?? 'No Activity'}
            </Tag>
            <div className='topbar-title'>
              <strong>{selected?.name ?? 'Select or create an Activity'}</strong>
              <span>{selected?.id ?? 'Draft changes stay in CMS until publication.'}</span>
            </div>
          </div>
          <div className='topbar-actions'>
            <Button loading={loading} onClick={createActivity}>
              Create Activity
            </Button>
            <Button theme='primary' disabled={!selected} loading={loading} onClick={publishActivity}>
              Publish
            </Button>
          </div>
        </Header>

        <Content className='content'>
          <main className={`canvas workbench${selected ? '' : ' workbench--empty'}`}>
            <div className='canvas-head'>
              <div>
                <p className='eyebrow'>Operator control</p>
                <Typography.Title level='h1' className='hero-title page-title'>
                  {selected ? selected.name : 'Activity workspace'}
                </Typography.Title>
                <p className='canvas-subtitle'>{selected ? `${compactDateTime(selected.start_time)} to ${compactDateTime(selected.end_time)} / ${selected.timezone}` : 'Create an Activity or load an existing tenant workspace to start editing.'}</p>
              </div>
              {selected ? (
                <div className='metric-grid'>
                  <div className='metric'>
                    <span>Sessions</span>
                    <strong>{sessions.length}</strong>
                  </div>
                  <div className='metric'>
                    <span>Pages</span>
                    <strong>{pageConfigs.length}</strong>
                  </div>
                  <div className='metric'>
                    <span>Staff</span>
                    <strong>{staffGrants.length}</strong>
                  </div>
                  <div className='metric'>
                    <span>Published</span>
                    <strong>{latestPublication ? `v${latestPublication.version}` : '-'}</strong>
                  </div>
                </div>
              ) : null}
              {error ? <div className='error-strip'>{error}</div> : null}
            </div>

            {selected ? (
              <nav className='section-tabs' aria-label='Workspace sections'>
                {workspaceSections.map((section) => (
                  <button key={section.id} className={`section-tab${activeSection === section.id ? ' section-tab--active' : ''}`} type='button' onClick={() => setActiveSection(section.id)}>
                    {section.label}
                  </button>
                ))}
              </nav>
            ) : null}

            <div className={`management-grid management-grid--${activeSection}${selected ? '' : ' management-grid--empty'}`}>
              <section className={`panel panel--split panel--overview panel--activity${selected ? '' : ' panel--intro'}`}>
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

              <section className='panel panel--split panel--sessions panel--session-list'>
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

              <section className='panel panel--split panel--pages panel--page-config'>
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

              <section className='panel panel--split panel--pages panel--blocks'>
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

              <section className='panel panel--split panel--pages panel--templates'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Activity Templates</div>
                    <div className='panel-title'>{activityTemplates.length} tenant blueprints</div>
                  </div>
                  <Button disabled={!templateForm.name || !templateForm.template_key} onClick={saveActivityTemplate}>
                    {templateForm.id ? 'Update' : 'Create'}
                  </Button>
                </div>
                <div className='form-grid'>
                  <Input value={templateForm.name} onChange={(value) => setTemplateForm((form) => ({ ...form, name: String(value) }))} placeholder='Template name' />
                  <Input value={templateForm.template_key} onChange={(value) => setTemplateForm((form) => ({ ...form, template_key: String(value) }))} placeholder='template_key' />
                </div>
                <Input value={templateForm.description} onChange={(value) => setTemplateForm((form) => ({ ...form, description: String(value) }))} placeholder='Description' />
                <Textarea value={templateForm.config} onChange={(value) => setTemplateForm((form) => ({ ...form, config: String(value) }))} autosize={{ minRows: 4, maxRows: 8 }} placeholder='Config JSON, no business facts' />
                <div className='feed-list compact'>
                  {activityTemplates.map((template) => (
                    <div key={template.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{template.name}</div>
                        <div className='feed-row__meta'>{template.template_key} / {template.created_at}</div>
                      </div>
                      <Button variant='outline' onClick={() => editActivityTemplate(template)}>
                        Edit
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split panel--communications panel--notifications'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Notifications</div>
                    <div className='panel-title'>{notifications.length} Activity messages</div>
                  </div>
                  <Button disabled={!selected || !notificationForm.title || !notificationForm.content} onClick={createNotification}>
                    Create
                  </Button>
                </div>
                <div className='form-grid'>
                  <Input value={notificationForm.title} onChange={(value) => setNotificationForm((form) => ({ ...form, title: String(value) }))} placeholder='Title' />
                  <Select value={notificationForm.channel} onChange={(value) => setNotificationForm((form) => ({ ...form, channel: String(value) }))} options={[
                    { label: 'Miniapp', value: 'miniapp' },
                    { label: 'WeChat', value: 'wechat' },
                    { label: 'SMS', value: 'sms' },
                    { label: 'Email', value: 'email' },
                  ]} />
                </div>
                <Textarea value={notificationForm.content} onChange={(value) => setNotificationForm((form) => ({ ...form, content: String(value) }))} autosize={{ minRows: 3, maxRows: 6 }} placeholder='Content' />
                <div className='form-grid'>
                  <Select value={notificationForm.status} onChange={(value) => setNotificationForm((form) => ({ ...form, status: String(value) }))} options={[
                    { label: 'Draft', value: 'draft' },
                    { label: 'Scheduled', value: 'scheduled' },
                    { label: 'Sending', value: 'sending' },
                    { label: 'Sent', value: 'sent' },
                    { label: 'Cancelled', value: 'cancelled' },
                  ]} />
                  <input className='native-input' type='datetime-local' value={notificationForm.scheduled_at} onChange={(event) => setNotificationForm((form) => ({ ...form, scheduled_at: event.target.value }))} />
                </div>
                <Textarea value={notificationForm.audience_rule} onChange={(value) => setNotificationForm((form) => ({ ...form, audience_rule: String(value) }))} autosize={{ minRows: 3, maxRows: 7 }} placeholder='Audience rule JSON' />
                <div className='feed-list compact'>
                  {notifications.map((notification) => (
                    <div key={notification.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{notification.title}</div>
                        <div className='feed-row__meta'>{notification.channel} / {notification.status} / {notification.scheduled_at ?? notification.created_at}</div>
                      </div>
                      <div className='row-actions'>
                        <Tag variant='light'>{notification.audience_rule.type}</Tag>
                        {notification.status !== 'draft' ? (
                          <Button variant='outline' onClick={() => updateNotificationStatus(notification, 'draft')}>
                            Draft
                          </Button>
                        ) : null}
                        {notification.status !== 'cancelled' ? (
                          <Button theme='danger' variant='outline' onClick={() => updateNotificationStatus(notification, 'cancelled')}>
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split panel--brands panel--organizers'>
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

              <section className='panel panel--split panel--brands panel--sponsors'>
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

              <section className='panel panel--split panel--expo panel--expo-booths'>
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

              <section className='panel panel--split panel--brands panel--speakers'>
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

              <section className='panel panel--split panel--brands panel--activity-organizers'>
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

              <section className='panel panel--split panel--sessions panel--session-speakers'>
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

              <section className='panel panel--split panel--responses panel--registration-submissions'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Registration Submissions</div>
                    <div className='panel-title'>{registrationSubmissions.length} submitted forms</div>
                  </div>
                </div>
                <div className='feed-list compact'>
                  {registrationSubmissions.map((submission) => (
                    <div key={submission.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{submission.projected_fields ? Object.values(submission.projected_fields).filter(Boolean).join(' / ') : submission.registration_id}</div>
                        <div className='feed-row__meta'>{submission.submitted_at} / form {submission.form_version_id}</div>
                        <div className='feed-row__meta'>{JSON.stringify(submission.answers)}</div>
                      </div>
                      <Tag variant='light'>Registration</Tag>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split panel--responses panel--survey-responses'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Survey Responses</div>
                    <div className='panel-title'>{surveyResponses.length} responses</div>
                  </div>
                  <Button disabled={!selected} onClick={() => loadSurveyResponses(surveyResponseFilter || undefined)}>
                    Refresh
                  </Button>
                </div>
                <Select value={surveyResponseFilter} onChange={(value) => loadSurveyResponses(String(value) || undefined)} options={[
                  { label: 'All Surveys', value: '' },
                  ...surveys.map((survey) => ({ label: survey.title, value: survey.id })),
                ]} />
                <div className='feed-list compact'>
                  {surveyResponses.map((response) => {
                    const survey = surveys.find((item) => item.id === response.survey_id)
                    return (
                      <div key={response.id} className='feed-row'>
                        <div>
                          <div className='feed-row__title'>{survey?.title ?? response.survey_id}</div>
                          <div className='feed-row__meta'>{response.submitted_at} / {response.target_type}{response.target_id ? ` / ${response.target_id}` : ''}</div>
                        </div>
                        <Button variant='outline' onClick={() => loadSurveyAnswers(response.id)}>
                          Answers
                        </Button>
                      </div>
                    )
                  })}
                </div>
                {surveyAnswers ? (
                  <div className='feed-list compact'>
                    <div className='feed-row'>
                      <div>
                        <div className='feed-row__title'>Response {surveyAnswers.response.id}</div>
                        <div className='feed-row__meta'>{surveyAnswers.answers.length} answers / participant {surveyAnswers.response.participant_id ?? 'anonymous'}</div>
                      </div>
                      <Tag variant='light'>{surveyAnswers.response.target_type}</Tag>
                    </div>
                    {surveyAnswers.answers.map((answer) => (
                      <div key={answer.id} className='feed-row'>
                        <div>
                          <div className='feed-row__title'>{answer.question_id}</div>
                          <div className='feed-row__meta'>{JSON.stringify(answer.value)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className='panel panel--split panel--access panel--staff-grants'>
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
                      <div className='row-actions'>
                        <Tag theme={grant.status === 'active' ? 'primary' : 'default'} variant='light'>
                          {grant.status}
                        </Tag>
                        <Button theme='danger' variant='outline' disabled={grant.status === 'disabled'} onClick={() => disableStaffGrant(grant)}>
                          Disable
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split panel--access panel--operator-grants'>
                <div className='panel-head'>
                  <div>
                    <div className='panel-label'>Operator Grants</div>
                    <div className='panel-title'>{operatorGrants.length} Activity-scoped Operators</div>
                  </div>
                  <Button disabled={!selected || !operatorGrantForm.authing_user_id} onClick={upsertOperatorGrant}>
                    Grant
                  </Button>
                </div>
                <div className='form-grid'>
                  <Input value={operatorGrantForm.authing_user_id} onChange={(value) => setOperatorGrantForm((form) => ({ ...form, authing_user_id: String(value) }))} placeholder='Authing user subject' />
                  <Input value={operatorGrantForm.display_name} onChange={(value) => setOperatorGrantForm((form) => ({ ...form, display_name: String(value) }))} placeholder='Display name' />
                </div>
                <div className='feed-list compact'>
                  {operatorGrants.map((grant) => (
                    <div key={grant.id} className='feed-row'>
                      <div>
                        <div className='feed-row__title'>{grant.authing_user_id}</div>
                        <div className='feed-row__meta'>{grant.scope} / {grant.user_id} / {grant.created_at}</div>
                      </div>
                      <div className='row-actions'>
                        <Tag theme={grant.status === 'active' ? 'primary' : 'default'} variant='light'>
                          {grant.status}
                        </Tag>
                        <Button theme='danger' variant='outline' disabled={grant.status === 'disabled'} onClick={() => disableOperatorGrant(grant)}>
                          Disable
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className='panel panel--split panel--overview panel--publications'>
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
          </main>
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
