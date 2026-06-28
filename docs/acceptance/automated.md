# Automated Acceptance

Automated Acceptance verifies deterministic behavior that can run quickly without controlling the user's desktop UI. It complements Manual UX Acceptance and does not replace WeChat Mini Program real-device validation.

## API And Domain Rules

Automated tests must cover:

- Activity visibility: draft, published, archived, tenant boundary, direct activity entry, current Activity resolution
- Multi-day Activity shape: one Activity can contain Sessions across multiple dates; date filters must not require or imply multiple Activities
- Registration: login required, confirmed-by-default MVP behavior, participant/activity uniqueness, cancellation behavior
- QR Pass: issued from confirmed Registration, invalidated on cancellation or token rotation, activity matching
- My Agenda: confirmed Registration required, idempotent add/remove, duplicate prevention, time-overlap warning support, immediate state after successful command
- Expo: Expo Booths belong to exactly one Activity and can be filtered by zone, category, sponsor, recommendation, collection state, or check-in state
- Booth Collection: confirmed Registration required when configured, idempotent add/remove, duplicate prevention, My Booths state scoped to the current Activity
- Session Check-in: Staff activity scope, QR Pass activity matching, Session activity matching, Participant + Session uniqueness
- Booth Check-in: booth activity matching, Participant + Expo Booth uniqueness where configured, no Session ID required for booth visits
- Assistant: recommendations are scoped to the current Activity and cannot bypass Registration, My Agenda, Session Check-in, Booth Check-in, or Survey commands
- Activity publication: draft/published isolation, activity-level published version, rollback-by-new-version behavior
- Realtime recovery: payload is only a hint; clients can recover by fetching API snapshots
- Authing integration boundary: Authing subject and tenant scope projection, local Participant facts remain in Event OS
- Audit Event: important Operator, Staff, Participant, and security-relevant actions produce audit evidence
- Idempotency: retried commands return consistent results and detect conflicting reuse
- Domain errors: stable error codes for expected business failures

## Contracts

`packages/contracts` must define stable types for:

- API success envelope: `{ data, meta? }`
- API error envelope: `{ error: { code, message, details?, trace_id? } }`
- Domain Error Code
- Cursor pagination metadata
- Allowed sort and filter schemas per endpoint
- Realtime event names and payloads
- Command request shapes and idempotency metadata

Contract tests should prevent undocumented response shapes and unknown realtime event names from entering production paths.

## Integration Flow

At least one automated service-level integration test must run the core MVP loop:

1. Create or load a Tenant, one multi-day Activity, published Activity snapshot, Sessions across at least two dates, Expo Booths, and Staff grant.
2. Authenticate or simulate an Authing-backed participant identity.
3. Register for the Activity.
4. Verify confirmed Registration and QR Pass issuance.
5. Filter Agenda by each date and verify both date filters return Sessions inside the same Activity.
6. Add a Session to My Agenda.
7. Collect an Expo Booth and verify My Booths state.
8. Check in to a Session through a Staff-scoped command.
9. Verify duplicate Session Check-in is idempotent.
10. Verify Session Check-in count updates.
11. Verify Booth Check-in can be recorded separately from Session Check-in when configured.
12. Verify a realtime count event or equivalent publish path is emitted.
13. Verify audit events exist for the important state changes.

## UI State

Automated UI tests may run only where stable and fast, such as browser/H5/component tests. They should cover:

- Error code to user-facing state mapping
- Registration-required gate before My Agenda, QR Pass, Session Check-in, Booth Collection, Booth Check-in, Survey, and protected Live
- Activity publication update prompt/state refresh
- Current Activity Home as the default participant entry when one active Activity is configured
- Agenda date filtering inside one Activity
- Expo filtering and My Booths state inside one Activity
- My Agenda duplicate and time-overlap states
- Assistant recommendation/action states without bypassing command confirmation
- Staff scan result states: success, duplicate, invalid token, activity mismatch, unauthorized Staff

Do not require the agent to control the user's desktop UI for routine automated acceptance. WeChat authorization, camera permission, scan interaction, touch behavior, and real-device feel belong to Manual UX Acceptance.
