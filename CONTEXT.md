# Event OS

Event OS is a reusable, multi-tenant WeChat mini program platform for operating company-hosted activities such as summits, forums, exhibitions, launches, trainings, and roadshows.

## Language

**Activity**:
The canonical top-level product entity representing one concrete summit, forum, exhibition, launch, training, or roadshow instance in the platform.
_Avoid_: Event, activity instance

**Event**:
A technical occurrence emitted by the system, such as a realtime payload, audit record, or integration message. It is not the business term for an activity.
_Avoid_: Business event

**Audit Event**:
A durable technical event recording who performed an important action, under which tenant or activity scope, against which resource, and with what relevant metadata. Audit Events are owned by Event OS even when authentication and permission source come from Authing.
_Avoid_: Business event, activity

**Tenant**:
A system boundary for data isolation, administration, and commercial ownership. A tenant may operate one or more organizer brands and is linked one-to-one with an Authing organization in MVP.
_Avoid_: Account, company, organizer

**Session**:
A scheduled agenda item within an activity, such as a talk, presentation, workshop, or panel. Joining a session to My Agenda does not imply registration or check-in.
_Avoid_: Agenda item, agenda, talk

**QR Pass**:
The participant credential issued from a confirmed registration and used to identify and validate attendance for an activity. Pending, cancelled, or missing registrations do not have a valid QR Pass.
_Avoid_: Ticket, QR ticket, attendee QR code

**Check-in**:
The attendance action for a session, validated against a QR Pass and recorded as a durable participation event. The QR Pass activity and the session activity must match.
_Avoid_: Sign-in

**My Agenda**:
The set of sessions a participant has intentionally added to their personal schedule within an activity.
_Avoid_: My plan, my arrangement, favorite sessions, favorites

**Activity Template**:
A reusable configuration and content blueprint for activities. It is copied into activity-owned configuration when an activity is created; later template changes do not affect existing activities unless an operator explicitly applies the template update.
_Avoid_: Event template

**Expo**:
An exhibition area or booth space within an activity.
_Avoid_: Exhibition, booth area

**Sponsor**:
A tenant-scoped sponsoring brand that can be displayed on activities, expo booths, sessions, live entries, or other sponsor placements. Sponsor is not the organizer of an activity.
_Avoid_: Organizer, booth sponsor string

**Participant**:
A person's activity-scoped participation identity. A user can become a participant in multiple activities, with registration, QR Pass, My Agenda, and Check-in state scoped to each activity participation.
_Avoid_: Attendee, visitor

**Registration**:
The record that a participant has signed up for an activity. Only a confirmed registration can issue a QR Pass.
_Avoid_: Signup

**Speaker**:
A person who presents a session or is associated with content in an activity.

**Operator**:
A user granted tenant-scoped or activity-scoped permission, sourced from Authing access management, to configure and manage activities through the CMS or related back-office tools.
_Avoid_: Admin, manager

**Staff**:
A user granted activity-scoped permission, sourced from Authing access management, to perform on-site operational tasks such as check-in and attendance handling.

**Page Config**:
The activity-scoped configuration that controls which pages and settings are enabled. Operators edit draft Page Config, while participants only see the activity-level published version.

**Block**:
A configurable content unit within a page. Blocks are edited as part of draft Page Config and become participant-visible only after publish.

**Command**:
An explicit request to change business facts, such as registering for an activity, adding a session to My Agenda, submitting a survey, sending a notification, or performing a check-in. Commands must pass the normal API permission checks and produce audit evidence for important state changes.

**Idempotency Key**:
A client-provided key used to make retried commands safe. Business-changing commands use idempotency keys scoped by actor, command, and resource context.

**Assistant**:
An in-app helper feature for activity-related questions, guidance, recommendations, and support. In MVP, Assistant can guide users to actions but cannot directly perform irreversible actions such as registration, check-in, or adding sessions to My Agenda.
_Avoid_: AI bot

**Home**:
The primary landing page for an activity.

**Me**:
The personal center page for a participant.
_Avoid_: Profile, personal center

**Agenda**:
The schedule view for an activity.
_Avoid_: Schedule page

**User**:
The local projection of an Authing identity subject used to connect authentication with Event OS business records. User is not the activity-scoped participation record, and WeChat openid/unionid binding is delegated to Authing.

**Authing Identity**:
The external identity and access-management subject owned by Authing. Event OS uses Authing for login, WeChat Mini Program identity binding, tenant/operator/staff permission source, and general access-management integration, while keeping activity participation facts in Event OS.
_Avoid_: Local password account

**Realtime**:
The live update capability for attendance, counts, and broadcast state. Realtime messages are hints and increments; clients recover by fetching current snapshots from the API.

**CMS**:
The content management surface used by operators to configure activities and publish content. CMS content is tenant-scoped by default and can be specialized per activity.

**Survey**:
A questionnaire or feedback form associated with an activity.

**Survey Response**:
A participant's submitted response to a survey, tied to the relevant survey target and form version. Survey questions and answers are strongly modeled resources, with typed option payloads where needed.

**Live**:
The livestream, replay, or live content entry associated with an activity or session. Live entries are strongly modeled resources with access policy, provider/link information, timing, status, and ordering.

**Organizer**:
The attendee-facing host or brand presented on an activity. An organizer is usually operated by a tenant, but it is not the data isolation boundary.
_Avoid_: Tenant

**Notification**:
An activity-scoped message sent to a rule-defined audience such as confirmed participants, staff, or participants with a session in My Agenda. Notification deliveries track per-recipient channel status and delivery result.

**Business Resource**:
A strongly modeled domain object owned by Event OS, such as Activity, Organizer, Session, Speaker, Registration, QR Pass, My Agenda, Check-in, Expo Booth, Sponsor, Live Entry, Survey, Notification, or Audit Event. Business resources are not stored as opaque Page Config or Block JSON.
_Avoid_: JSON-only content object
