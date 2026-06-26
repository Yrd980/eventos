# Manual UX Acceptance

Manual UX Acceptance verifies real user task flow in the WeChat Mini Program, Codex App, WeChat Developer Tools, or a physical device. It covers platform behavior that should not be delegated to slow desktop clicking by the agent, such as WeChat authorization, camera permission, scanning, touch interaction, weak network feel, and field operation ergonomics.

## Participant Flow

Goal: a participant can discover an activity, register, receive a QR Pass, and manage My Agenda.

1. Open the tenant mini program entry without an `activityId`.
   - Expected: the current published Activity list is shown.
   - Expected: archived activities are not shown in the current list.

2. Open a published Activity from the list, or open a valid direct `activityId` entry.
   - Expected: Activity Home loads with the correct organizer, theme, core activity information, and configured blocks.
   - Expected: unpublished or cross-tenant activities show an unavailable state.

3. Open Agenda.
   - Expected: published Sessions are visible in the configured order.
   - Expected: hidden Sessions are not visible.
   - Expected: cancelled Sessions are clearly marked when visible through an existing My Agenda reference.

4. Start Registration.
   - Expected: WeChat/Authing login is requested only when entering the participation flow.
   - Expected: successful login returns to the registration flow.

5. Submit Registration.
   - Expected: MVP registration becomes confirmed immediately.
   - Expected: QR Pass is issued or available after registration succeeds.
   - Expected: repeated taps do not create duplicate registrations.

6. Open QR Pass.
   - Expected: QR Pass displays the current participant and activity information.
   - Expected: QR token is not exposed as user-editable data.

7. Add a Session to My Agenda.
   - Expected: confirmed participants can add a Session.
   - Expected: duplicate taps do not create duplicate My Agenda entries.
   - Expected: time-overlapping Sessions are allowed with a warning, not blocked.

8. Open Me.
   - Expected: My Agenda and QR Pass are discoverable.
   - Expected: archived activities are readable but do not allow new participation actions.

## Staff Flow

Goal: staff can check in participants for a specific Session and understand success, duplicate, and failure outcomes.

1. Sign in as Staff.
   - Expected: Authing identity is accepted.
   - Expected: only activities with Staff grant are available for check-in.

2. Choose an Activity and Session check-in entry.
   - Expected: the current Session context is visible before scanning.
   - Expected: cancelled, hidden, draft, or archived Sessions cannot accept Check-in.

3. Scan a valid QR Pass for the same Activity.
   - Expected: Check-in succeeds.
   - Expected: participant and Session details are shown for confirmation.
   - Expected: Session count updates through Realtime or after refresh.

4. Scan the same QR Pass for the same Session again.
   - Expected: duplicate Check-in is reported as already checked in.
   - Expected: no duplicate count is added.

5. Scan an invalid, expired, cancelled, cross-activity, or unauthorized QR Pass.
   - Expected: the failure reason is specific and understandable.
   - Expected: no Check-in is created.
   - Expected: security-relevant failure is auditable.

## Operator Flow

Goal: operators can manage activity content/configuration, publish it, and verify participant-visible updates.

1. Sign in to CMS as Operator.
   - Expected: Authing identity and tenant-scoped Operator permission are accepted.
   - Expected: only the operator's tenant data is visible.

2. Create or edit Activity basic information.
   - Expected: draft changes do not affect the participant mini program before publish.
   - Expected: Activity uses structured venue/timezone fields.

3. Create or edit Organizer, Sponsor, Speaker, Session, Expo Booth, Live Entry, Registration Form, and Page Config as applicable.
   - Expected: business resources are edited as strong resources, not only opaque block JSON.
   - Expected: Page Config and Blocks reference business resources.

4. Publish the Activity.
   - Expected: validation prevents publishing incomplete required content.
   - Expected: a new activity-level published version is created.
   - Expected: participant mini program loads the new published version.

5. Modify a Session time or title after publish.
   - Expected: participants do not see the draft change before publish.
   - Expected: after publish, Agenda and My Agenda show the updated published Session.
   - Expected: existing My Agenda entries remain linked and are not deleted.

6. Archive the Activity.
   - Expected: the Activity becomes read-only for participants.
   - Expected: new Registration, QR Pass issuance, My Agenda changes, and Check-in are blocked.
   - Expected: historical Registration, QR Pass, My Agenda, Check-in, and Audit Events remain readable.
