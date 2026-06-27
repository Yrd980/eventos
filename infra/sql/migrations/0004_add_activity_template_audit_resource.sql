BEGIN;

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
