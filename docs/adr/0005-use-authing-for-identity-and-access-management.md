# Use Authing for Identity and Access Management

Event OS uses Authing for authentication, WeChat Mini Program identity binding, tenant/operator/staff permission source, and general access-management integration instead of building a local identity provider. Event OS keeps local projections linked to Authing subjects and scopes, while business-scoped records such as Participant, Registration, QR Pass, My Agenda, Check-in, Activity publication, and Audit Event remain owned by Event OS.

In MVP, each Event OS Tenant maps one-to-one to an Authing organization. This keeps tenant isolation and permission lookup clear while leaving room for metadata-based adaptation if Authing organization modeling becomes more complex later.
