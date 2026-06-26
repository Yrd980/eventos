# Recover Realtime from API Snapshots

Realtime messages are treated as hints and increments, not durable state. Clients recover from disconnects or missed messages by fetching current snapshots from the API, while PostgreSQL remains the source of truth and Redis only stores rebuildable realtime/cache state.
