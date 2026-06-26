BEGIN;

CREATE TABLE tenants (
  id text PRIMARY KEY,
  authing_org_id text NOT NULL UNIQUE,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  authing_user_id text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  logo_url text,
  description text,
  website_url text,
  contact text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizers_tenant_id_idx ON organizers(tenant_id);

CREATE TABLE sponsors (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  logo_url text,
  description text,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sponsors_tenant_id_idx ON sponsors(tenant_id);

CREATE TABLE activity_templates (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  template_key text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_key)
);

CREATE TABLE activities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  theme_name text,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  venue jsonb NOT NULL DEFAULT '{"timezone":"Asia/Shanghai"}'::jsonb,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  template_id text REFERENCES activity_templates(id) ON DELETE SET NULL,
  theme jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time >= start_time)
);

CREATE INDEX activities_tenant_id_status_start_time_idx ON activities(tenant_id, status, start_time DESC);
CREATE INDEX activities_template_id_idx ON activities(template_id);

CREATE TABLE activity_organizers (
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  organizer_id text NOT NULL REFERENCES organizers(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (activity_id, organizer_id)
);

CREATE TABLE activity_publications (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('published', 'superseded')),
  published_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  summary text,
  snapshot jsonb NOT NULL,
  etag text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, version),
  UNIQUE (activity_id, etag)
);

CREATE UNIQUE INDEX activity_publications_current_idx
  ON activity_publications(activity_id)
  WHERE status = 'published';

CREATE TABLE speakers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  title text,
  bio text,
  avatar_url text,
  organization text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX speakers_tenant_id_idx ON speakers(tenant_id);

CREATE TABLE session_tracks (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (activity_id, name)
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  track_id text REFERENCES session_tracks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  room_name text,
  venue_area text,
  status text NOT NULL CHECK (status IN ('scheduled', 'cancelled', 'hidden')),
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  requires_reservation boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time >= start_time)
);

CREATE INDEX sessions_activity_id_status_start_time_idx ON sessions(activity_id, status, start_time, sort_order);
CREATE INDEX sessions_track_id_idx ON sessions(track_id);

CREATE TABLE session_speakers (
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id text NOT NULL REFERENCES speakers(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('host', 'speaker', 'panelist', 'guest')),
  sort_order integer NOT NULL DEFAULT 0,
  title_override text,
  bio_override text,
  PRIMARY KEY (session_id, speaker_id)
);

CREATE TABLE participants (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

CREATE INDEX participants_user_id_idx ON participants(user_id);

CREATE TABLE registration_forms (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  title text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE registrations (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  participant_id text NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  source text NOT NULL CHECK (source IN ('miniapp', 'operator', 'import')),
  form_version_id text REFERENCES registration_forms(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, participant_id)
);

CREATE INDEX registrations_participant_id_idx ON registrations(participant_id);

CREATE TABLE registration_submissions (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  registration_id text NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  form_version_id text NOT NULL REFERENCES registration_forms(id) ON DELETE RESTRICT,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  projected_fields jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX registration_submissions_registration_id_idx ON registration_submissions(registration_id);

CREATE TABLE qr_passes (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  participant_id text NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  registration_id text NOT NULL REFERENCES registrations(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'invalidated', 'expired')),
  token_fingerprint text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  expires_at timestamptz
);

CREATE INDEX qr_passes_activity_participant_idx ON qr_passes(activity_id, participant_id);
CREATE UNIQUE INDEX qr_passes_active_registration_idx
  ON qr_passes(registration_id)
  WHERE status = 'active';

CREATE TABLE my_agenda_items (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  participant_id text NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('manual', 'assistant', 'import', 'operator')),
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, participant_id, session_id)
);

CREATE INDEX my_agenda_items_participant_id_idx ON my_agenda_items(participant_id);

CREATE TABLE checkins (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  participant_id text NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  qr_pass_id text NOT NULL REFERENCES qr_passes(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('staff', 'self', 'import')),
  staff_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  device_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, participant_id, session_id)
);

CREATE INDEX checkins_session_id_idx ON checkins(session_id);

CREATE TABLE checkin_attempts (
  id text PRIMARY KEY,
  activity_id text REFERENCES activities(id) ON DELETE RESTRICT,
  session_id text REFERENCES sessions(id) ON DELETE RESTRICT,
  staff_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  result text NOT NULL CHECK (result IN ('success', 'failed')),
  failure_code text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checkin_attempts_session_id_created_at_idx ON checkin_attempts(session_id, created_at DESC);

CREATE TABLE expo_booths (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  sponsor_id text REFERENCES sponsors(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  category text,
  location text,
  logo_url text,
  status text NOT NULL CHECK (status IN ('visible', 'hidden')),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX expo_booths_activity_id_status_sort_order_idx ON expo_booths(activity_id, status, sort_order);

CREATE TABLE live_entries (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  session_id text REFERENCES sessions(id) ON DELETE SET NULL,
  title text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('external_link', 'miniapp_page', 'embedded', 'other')),
  url text,
  deep_link text,
  access_policy text NOT NULL CHECK (access_policy IN ('public', 'confirmed_registration')),
  start_time timestamptz,
  end_time timestamptz,
  status text NOT NULL CHECK (status IN ('draft', 'scheduled', 'live', 'ended', 'hidden')),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX live_entries_activity_id_status_sort_order_idx ON live_entries(activity_id, status, sort_order);

CREATE TABLE surveys (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_type text NOT NULL CHECK (target_type IN ('activity', 'session', 'expo_booth', 'live_entry')),
  target_id text,
  access_policy text NOT NULL CHECK (access_policy IN ('public', 'confirmed_registration')),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'closed'))
);

CREATE INDEX surveys_activity_id_status_idx ON surveys(activity_id, status);

CREATE TABLE survey_questions (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  survey_id text NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('text', 'single_choice', 'multiple_choice', 'rating', 'boolean')),
  required boolean NOT NULL DEFAULT false,
  options jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (survey_id, key)
);

CREATE TABLE survey_responses (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  survey_id text NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  participant_id text REFERENCES participants(id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN ('activity', 'session', 'expo_booth', 'live_entry')),
  target_id text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX survey_responses_survey_id_participant_id_idx ON survey_responses(survey_id, participant_id);

CREATE TABLE survey_answers (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  response_id text NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES survey_questions(id) ON DELETE RESTRICT,
  value jsonb NOT NULL
);

CREATE TABLE page_configs (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  page_key text NOT NULL CHECK (page_key IN ('home', 'agenda', 'assistant', 'expo', 'me')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, page_key)
);

CREATE TABLE blocks (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  page_config_id text NOT NULL REFERENCES page_configs(id) ON DELETE CASCADE,
  block_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  resource_refs jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_snapshot jsonb
);

CREATE INDEX blocks_page_config_id_sort_order_idx ON blocks(page_config_id, sort_order);

CREATE TABLE notifications (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  audience_rule jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_activity_id_status_idx ON notifications(activity_id, status);

CREATE TABLE notification_deliveries (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('miniapp', 'sms', 'email', 'wechat')),
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  provider_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_deliveries_notification_id_status_idx ON notification_deliveries(notification_id, status);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(id) ON DELETE RESTRICT,
  activity_id text REFERENCES activities(id) ON DELETE RESTRICT,
  actor_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  actor_authing_user_id text,
  actor_scope text CHECK (actor_scope IN ('tenant_operator', 'activity_operator', 'staff', 'participant', 'system')),
  action text NOT NULL,
  resource_type text NOT NULL CHECK (
    resource_type IN (
      'activity',
      'organizer',
      'sponsor',
      'speaker',
      'session',
      'registration',
      'qr_pass',
      'my_agenda_item',
      'checkin',
      'expo_booth',
      'live_entry',
      'survey',
      'notification',
      'activity_publication',
      'audit_event'
    )
  ),
  resource_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_id_created_at_idx ON audit_events(tenant_id, created_at DESC);
CREATE INDEX audit_events_activity_id_created_at_idx ON audit_events(activity_id, created_at DESC);
CREATE INDEX audit_events_actor_user_id_idx ON audit_events(actor_user_id);

CREATE TABLE idempotency_records (
  id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(id) ON DELETE RESTRICT,
  activity_id text REFERENCES activities(id) ON DELETE RESTRICT,
  actor_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  actor_authing_user_id text,
  command_name text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idempotency_records_actor_user_id_idx ON idempotency_records(actor_user_id);
CREATE UNIQUE INDEX idempotency_records_command_scope_key_idx
  ON idempotency_records(command_name, resource_type, COALESCE(resource_id, ''), COALESCE(actor_authing_user_id, ''), idempotency_key);

CREATE TABLE staff_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  authing_user_id text NOT NULL,
  grant_source text NOT NULL DEFAULT 'authing',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

CREATE INDEX staff_grants_authing_user_id_idx ON staff_grants(authing_user_id);

CREATE TABLE operator_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  authing_user_id text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('tenant', 'activity')),
  activity_id text REFERENCES activities(id) ON DELETE CASCADE,
  grant_source text NOT NULL DEFAULT 'authing',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operator_grants_authing_user_id_idx ON operator_grants(authing_user_id);
CREATE UNIQUE INDEX operator_grants_scope_idx
  ON operator_grants(tenant_id, user_id, scope, COALESCE(activity_id, ''));

COMMIT;
