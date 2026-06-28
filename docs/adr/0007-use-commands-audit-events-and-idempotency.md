# Use Commands, Audit Events, and Idempotency for Business Changes

Business-changing operations are modeled as explicit commands with normal permission checks, domain error codes, idempotency keys, and audit evidence for important state changes. This applies to flows such as registration, QR Pass regeneration, My Agenda changes, Session Check-in, Booth Collection, Booth Check-in, survey submission, notification sending, and future Assistant tool actions, so retries and AI-assisted actions cannot bypass the same business rules.
