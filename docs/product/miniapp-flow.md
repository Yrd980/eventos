# Mini Program Product Flow

This document describes the participant-facing product logic for a real company-hosted summit mini program. It is intentionally product-level: implementation should follow the domain model in `CONTEXT.md` and the ADRs.

## Core Shape

The participant mini program is centered on one current Activity, such as `2026 亚马逊云科技中国峰会`.

An Activity can span multiple dates. Dates such as `6月23日` and `6月24日` are facets inside the Activity, not separate Activities.

Correct hierarchy:

```text
Tenant
  Activity: 2026 亚马逊云科技中国峰会
    Sessions grouped by date, time, track, room, replay availability
    Expo Booths grouped by zone, category, sponsor, collection/check-in state
    Registration Form
    QR Pass
    My Agenda
    My Booths
    Venue Guide
    Attendee Guide
    Live Entries
    Surveys
    Notifications
```

Incorrect hierarchy:

```text
Tenant
  Activity: 6月23日
  Activity: 6月24日
```

Only use multiple Activities when the user is choosing between distinct summits, trainings, roadshows, or other independent business activities.

## Participant Loop

Primary loop:

```text
Home
  -> Registration
  -> QR Pass
  -> Agenda
  -> Add Sessions to My Agenda
  -> Me
  -> Expo
  -> Collect or Check in at Booths
  -> Assistant recommends next actions
```

The loop must feel like one summit experience, not a generic multi-activity demo.

## Home

Home is the landing page for the current Activity.

Home should show:

- Summit identity and brand signal.
- Activity dates, venue, theme, and key entry points.
- Quick actions such as Attendee Guide, Venue Guide, Agenda, Expo, Assistant, and Me.
- Sponsor or partner sections.
- Share entry.
- Bottom tab navigation and Assistant input entry when applicable.

Home should not expose technical configuration controls in participant mode.

## Agenda

Agenda displays Sessions for the current Activity.

Agenda should support:

- `全部日程` and `我的日程` view switching.
- Date filters such as `全部`, `6月23日`, `6月24日`.
- Optional filters such as replay-only, downloadable materials, track, room, topic, or time.
- Session cards with title, time, room, speaker, intro, replay/material state, and add/remove action.

`My Agenda` is a participant's selected Sessions within the current Activity. Adding to My Agenda must update the local visible state immediately after the Command succeeds.

Do not model dates as Activities. Do not show Activity switching inside Agenda for a single summit.

## Assistant

Assistant is an Activity-scoped helper, not a generic chat surface.

Assistant can help with:

- Recommended Sessions based on current Activity and My Agenda.
- Managing or adjusting My Agenda.
- Recommended Expo Booths or booth routes.
- Summit highlights.
- Venue, traffic, registration, Session Check-in, and Booth Check-in information.
- Registration and QR Pass guidance.

Assistant can guide users to actions. In MVP it must not bypass normal Commands for irreversible changes such as Registration, My Agenda changes, Session Check-in, Booth Check-in, or Survey submission.

## Expo

Expo displays Expo Booths for the current Activity.

Expo should support:

- Theme or zone filters, such as `Agent 构建的理想之地`, `业务智能体`, `行业智能体`, or `开发者乐园`.
- Booth cards and booth detail.
- Booth Collection through My Booths.
- Booth Check-in when a booth visit or task completion is required.
- Venue Guide or map entry.
- Star or featured booth actions when configured.

Do not show Activity switching inside Expo for a single summit. Use category, zone, sponsor, collection state, and check-in state as filters.

## Me

Me is the participant center for the current Activity.

Me should show:

- QR Pass for the confirmed Registration.
- My Agenda.
- Registration status and Registration details.
- My Booths.
- Survey or questionnaire entries.
- Invitation or share metrics when configured.

Me should not behave like a generic account profile. The content is scoped to the current Activity.

## QR Pass

QR Pass is issued from a confirmed Registration for the current Activity.

QR Pass can be used for:

- Activity attendance identity.
- Staff Session Check-in.
- Venue access flows, if configured.

QR Pass must not be reused as a Booth Check-in record. Booth Check-in is a separate business fact, though a booth scanner may use QR Pass to identify the Participant.

## CMS And Publication

Operators manage strong business resources in CMS:

- Activity details.
- Sessions.
- Expo Booths.
- Sponsors.
- Registration Form.
- Venue Guide and Attendee Guide content.
- Page Config and Blocks.
- Notifications.
- Surveys.
- Live Entries.

Participants read the published Activity version. Draft changes must not leak into participant pages before publication.

## Implementation Guardrails

- Do not add `/events`, `event_id`, `Ticket`, or `favorite`.
- Do not hide Activity, Session, Registration, QR Pass, Expo Booth, Booth Collection, Booth Check-in, Venue Guide, Attendee Guide, Survey, Live Entry, Notification, or Audit Event inside opaque Page Config JSON.
- Do not split dates of one summit into multiple Activities.
- Do not add participant-facing Activity switching unless the user is explicitly choosing between distinct Activities.
- Use Activity-scoped filters for date, track, room, category, zone, sponsor, My Agenda, My Booths, replay, materials, and check-in state.
