# Manual UX Acceptance

Manual UX Acceptance verifies real user task flow in the WeChat Mini Program, Codex App, WeChat Developer Tools, or a physical device. It covers platform behavior that should not be delegated to slow desktop clicking by the agent, such as WeChat authorization, camera permission, scanning, touch interaction, weak network feel, and field operation ergonomics.

## Participant Flow

Goal: a participant can use one current summit Activity end to end: understand the summit, register, receive a QR Pass, manage My Agenda across multiple dates, use Expo, and find personal state in Me.

1. Open the tenant mini program entry for the current summit.
   - Expected: the current published Activity Home is shown when the tenant is operating one active summit.
   - Expected: Activity identity, dates, venue, organizer brand, sponsor or partner sections, and core entry points are visible.
   - Expected: dates such as `6月23日` and `6月24日` are presented as schedule facets, not as separate Activity choices.

2. Open a valid direct `activityId` entry, or choose an Activity only when multiple independent Activities are intentionally available.
   - Expected: Activity Home loads with the correct organizer, theme, core activity information, and configured blocks.
   - Expected: unpublished or cross-tenant activities show an unavailable state.
   - Expected: participant pages do not expose Activity switching inside one summit.

3. Open Agenda.
   - Expected: published Sessions for the current Activity are visible in the configured order.
   - Expected: date filters such as `全部`, `6月23日`, and `6月24日` filter Sessions inside the same Activity.
   - Expected: optional filters such as track, room, replay, materials, or topic narrow Sessions without changing Activity.
   - Expected: `全部日程` and `我的日程` switch between all published Sessions and the participant's My Agenda.
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
   - Expected: the visible My Agenda state updates immediately after the command succeeds.
   - Expected: My Agenda remains scoped to the current Activity and does not mix Sessions from other Activities.

8. Open Expo.
   - Expected: Expo Booths for the current Activity are visible by zone, theme, category, sponsor, or recommendation state.
   - Expected: filters narrow booths inside the current Activity; there is no date-as-Activity or summit-as-Activity switching for one summit.
   - Expected: Venue Guide or map entry is discoverable when configured.

9. Collect or check in at an Expo Booth.
   - Expected: Booth Collection adds the booth to My Booths after the command succeeds.
   - Expected: duplicate collection does not create duplicate My Booths entries.
   - Expected: Booth Check-in records a booth visit or task completion without using a Session ID.
   - Expected: booth scanners may use QR Pass to identify the Participant, but the recorded fact is Booth Check-in, not Session Check-in.

10. Open Assistant.
   - Expected: Assistant answers and recommendations are scoped to the current Activity.
   - Expected: Assistant can guide the participant to Sessions, My Agenda, Expo Booths, Venue Guide, Attendee Guide, Registration, QR Pass, Live, or Survey entries.
   - Expected: Assistant does not directly perform Registration, My Agenda changes, Session Check-in, Booth Check-in, or Survey submission without the normal command flow.

11. Open Me.
   - Expected: QR Pass, My Agenda, Registration status/details, My Booths, Surveys, and invite or share metrics are discoverable when configured.
   - Expected: Me behaves as the participant center for the current Activity, not as a generic account profile.
   - Expected: archived activities are readable but do not allow new participation actions.

## Staff Flow

Goal: staff can perform Session Check-in for a specific Session and understand success, duplicate, and failure outcomes.

1. Sign in as Staff.
   - Expected: Authing identity is accepted.
   - Expected: only activities with Staff grant are available for check-in.

2. Choose an Activity and Session Check-in entry.
   - Expected: the current Session context is visible before scanning.
   - Expected: cancelled, hidden, draft, or archived Sessions cannot accept Session Check-in.

3. Scan a valid QR Pass for the same Activity.
   - Expected: Session Check-in succeeds.
   - Expected: participant and Session details are shown for confirmation.
   - Expected: Session count updates through Realtime or after refresh.

4. Scan the same QR Pass for the same Session again.
   - Expected: duplicate Session Check-in is reported as already checked in.
   - Expected: no duplicate count is added.

5. Scan an invalid, expired, cancelled, cross-activity, or unauthorized QR Pass.
   - Expected: the failure reason is specific and understandable.
   - Expected: no Session Check-in is created.
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
   - Expected: new Registration, QR Pass issuance, My Agenda changes, Booth Collection, Session Check-in, and Booth Check-in are blocked.
   - Expected: historical Registration, QR Pass, My Agenda, Booth Collection, Session Check-in, Booth Check-in, and Audit Events remain readable.
