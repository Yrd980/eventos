# Automated Acceptance

Automated Acceptance verifies deterministic behavior that can run quickly without controlling the user's desktop UI. It complements Manual UX Acceptance and does not replace WeChat Mini Program real-device validation.

## API And Domain Rules

Automated tests must cover:

- Activity visibility: draft, published, archived, tenant boundary, direct activity entry
- Registration: login required, confirmed-by-default MVP behavior, participant/activity uniqueness, cancellation behavior
- QR Pass: issued from confirmed Registration, invalidated on cancellation or token rotation, activity matching
- My Agenda: confirmed Registration required, idempotent add/remove, duplicate prevention, time-overlap warning support
- Check-in: Staff activity scope, QR Pass activity matching, Session activity matching, Participant + Session uniqueness
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

1. Create or load a Tenant, Activity, published Activity snapshot, Session, and Staff grant.
2. Authenticate or simulate an Authing-backed participant identity.
3. Register for the Activity.
4. Verify confirmed Registration and QR Pass issuance.
5. Add a Session to My Agenda.
6. Check in through a Staff-scoped command.
7. Verify duplicate Check-in is idempotent.
8. Verify Session Check-in count updates.
9. Verify a realtime count event or equivalent publish path is emitted.
10. Verify audit events exist for the important state changes.

## UI State

Automated UI tests may run only where stable and fast, such as browser/H5/component tests. They should cover:

- Error code to user-facing state mapping
- Registration-required gate before My Agenda, QR Pass, Check-in, Survey, and protected Live
- Activity publication update prompt/state refresh
- My Agenda duplicate and time-overlap states
- Staff scan result states: success, duplicate, invalid token, activity mismatch, unauthorized Staff

Do not require the agent to control the user's desktop UI for routine automated acceptance. WeChat authorization, camera permission, scan interaction, touch behavior, and real-device feel belong to Manual UX Acceptance.
