# CHANGELOG

## V2.0.0 (Current & Stable)

### Feature (Server)
In this version we actually removed the single fastify file and broke it into routes.

#### `server/db.ts`
- Handles pocketbase auth
- Handles pocketbase REST helpers
- Handles the filter, event and guest helpers for the actual checkin of guests

#### `server/server.ts`
- Main entry file 