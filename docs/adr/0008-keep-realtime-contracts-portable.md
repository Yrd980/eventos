# Keep Realtime Contracts Portable

The realtime service currently uses `uWebSockets.js` through the `@eventos/realtime` package. On local Windows + Bun development environments, the current GitHub-sourced package can fail during module loading before the service starts. This is an implementation blocker for the realtime process, not a product-contract blocker.

Realtime messages remain hints and increments. API recovery endpoints are the durable contract:

- `activity.publication_updated` recovers through `GET /activities/:activityId/publication`
- `session.checkin_count_updated` recovers through `GET /sessions/:sessionId/checkin-count`

PostgreSQL remains the source of truth, and Redis remains rebuildable realtime/cache state. If `uWebSockets.js` is not stable across the supported local development targets, replace only the WebSocket transport implementation with a more portable WebSocket server while keeping:

- `packages/contracts` realtime event names and payload shapes unchanged
- Redis channel input unchanged
- API recovery endpoints unchanged
- client subscription topics unchanged: `activity:{id}` and `session:{id}`
