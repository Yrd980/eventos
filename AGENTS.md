# Agent Instructions

## Project Shape

Event OS is a reusable, multi-tenant WeChat mini program platform for operating company-hosted activities. It is a Bun/TypeScript monorepo with:

- `apps/web-miniapp`: Taro + React WeChat mini program
- `apps/api`: Bun + Hono API
- `apps/cms`: TDesign React CMS
- `apps/realtime`: uWebSockets.js realtime service
- `packages/contracts`: shared API, domain, realtime, and command contracts
- `packages/config`: shared runtime configuration
- `packages/shared`: framework-free shared helpers

Use `bun` for JavaScript/TypeScript work unless a package script says otherwise.

## Required Reading

Before changing behavior, read:

- `CONTEXT.md` for canonical domain language
- Relevant ADRs in `docs/adr/`
- `docs/acceptance/automated.md` for automated acceptance expectations
- `docs/acceptance/manual-ux.md` for role-based manual UX acceptance
- `packages/contracts/src/index.ts` before adding or changing API payloads, realtime payloads, or domain resource shapes

If your change contradicts an ADR, call that out explicitly before implementing.

## Domain Language

Use the vocabulary in `CONTEXT.md`.

Important rules:

- Business activities are `Activity`, never `Event`.
- `Event` is reserved for technical events such as realtime payloads, audit records, or integration messages.
- `QR Pass` replaces `Ticket`.
- `My Agenda` replaces favorites/bookmarks for participant-selected sessions.
- `Tenant` is the data and administration boundary.
- `Organizer` and `Sponsor` are attendee-facing or commercial brands, not isolation boundaries.
- Authing owns authentication, WeChat Mini Program identity binding, and the permission source.
- Event OS owns business facts: Participant, Registration, QR Pass, My Agenda, Check-in, Publication, Survey, Live Entry, Notification, and Audit Event.

Do not reintroduce `/events`, `event_id`, `Ticket`, `favorite`, local password accounts, or local WeChat `openid` ownership unless the user explicitly asks to reopen the decision.

## Architecture Rules

- Core business resources must be strongly modeled. Do not hide Activity, Session, Registration, QR Pass, Survey, Live, Expo, Sponsor, Notification, or Audit Event inside opaque Page Config or Block JSON.
- Page Config and Blocks are for display composition, ordering, copy, styling, and resource references.
- Operators edit draft content/configuration. Participants read the activity-level published version.
- Publishing creates an immutable Activity Publication. Rollback creates a new publication from an older snapshot.
- PostgreSQL is the source of truth.
- Redis is only for realtime/cache state that can be rebuilt.
- Realtime payloads are hints and increments. Clients recover by fetching API snapshots.
- All business-changing operations are Commands with permission checks, domain error codes, idempotency keys, and audit evidence for important state changes.
- API responses use the shared envelope from `packages/contracts`: success `{ data, meta? }`, failure `{ error: { code, message, details?, trace_id? } }`.
- Cursor pagination, sort keys, and filter schemas must be explicit endpoint contracts.

## Identity And Permissions

- Event OS `User` is a local projection of an Authing subject.
- `Tenant` maps one-to-one to an Authing organization in MVP.
- Tenant-scoped Operator permission comes from Authing.
- Activity-scoped Staff grants are business mappings in Event OS, while Authing remains the identity and base permission source.
- Participant identity is not an Authing role. Participant, Registration, QR Pass, My Agenda, and Check-in stay in Event OS.
- Audit Events must capture enough actor, scope, resource, and metadata to explain historical actions even if Authing permissions later change.

## MVP Product Loop

The core MVP loop is:

`Activity list or direct Activity entry -> Activity Home -> Registration -> QR Pass -> Session Agenda -> My Agenda -> Staff Session Check-in -> Realtime count`

Do not optimize for isolated demo screens at the cost of this loop.

## Testing And Acceptance

Automated tests should cover deterministic behavior:

- API/domain rules
- contracts
- command idempotency
- Authing scope projection boundaries
- publication version behavior
- realtime payloads and API snapshot recovery
- core service-level integration loop

Manual UX acceptance is role based:

- Participant
- Staff
- Operator

Do not default to controlling the user's desktop or WeChat Developer Tools for slow UI clicking. The user prefers to run real mini program interaction through Codex App, WeChat Developer Tools, or a real device. Provide clear role-flow acceptance scripts and expected results instead.

## Issue Tracker

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

## Triage Labels

Use the canonical triage labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

## Domain Docs

This repo uses a single-context layout with one root `CONTEXT.md` and one root `docs/adr/`. See `docs/agents/domain.md`.
