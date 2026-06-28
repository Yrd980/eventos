BEGIN;

CREATE TABLE booth_collections (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  participant_id text NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  expo_booth_id text NOT NULL REFERENCES expo_booths(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('manual', 'assistant', 'import', 'operator')),
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, participant_id, expo_booth_id)
);

CREATE INDEX booth_collections_participant_id_idx ON booth_collections(participant_id);

CREATE TABLE booth_checkins (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  participant_id text NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  expo_booth_id text NOT NULL REFERENCES expo_booths(id) ON DELETE RESTRICT,
  qr_pass_id text REFERENCES qr_passes(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('staff', 'self', 'import')),
  staff_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  device_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, participant_id, expo_booth_id)
);

CREATE INDEX booth_checkins_expo_booth_id_idx ON booth_checkins(expo_booth_id);

ALTER TABLE audit_events
  DROP CONSTRAINT audit_events_resource_type_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_resource_type_check CHECK (
    resource_type IN (
      'activity_template',
      'activity',
      'organizer',
      'sponsor',
      'speaker',
      'session_track',
      'session',
      'registration_form',
      'registration',
      'qr_pass',
      'my_agenda_item',
      'checkin',
      'expo_booth',
      'booth_collection',
      'booth_checkin',
      'live_entry',
      'survey',
      'page_config',
      'block',
      'notification',
      'activity_publication',
      'audit_event',
      'staff_grant',
      'operator_grant'
    )
  );

COMMIT;
