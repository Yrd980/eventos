# Use Portable Realtime Transport

The realtime service originally used `uWebSockets.js` through the `@eventos/realtime` package. On local Windows + Bun development environments, the GitHub-sourced package fails during module loading before the service starts:

```text
TypeError: symbol 'napi_register_module_v1' not found in native module
```

The service now uses Bun's native WebSocket server so the realtime process runs on the same runtime as the rest of the service code without a Node native module dependency. This changes only the WebSocket transport implementation.

Realtime messages remain hints and increments. API recovery endpoints are the durable contract:

- `activity.publication_updated` recovers through `GET /activities/:activityId/publication`
- `session.checkin_count_updated` recovers through `GET /sessions/:sessionId/checkin-count`

PostgreSQL remains the source of truth, and Redis remains rebuildable realtime/cache state. Realtime transport changes must keep:

- `packages/contracts` realtime event names and payload shapes unchanged
- Redis channel input unchanged
- API recovery endpoints unchanged
- client subscription topics unchanged: `activity:{id}` and `session:{id}`
