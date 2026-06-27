# Event OS

Monorepo for the Event OS mini program, API, CMS admin, and realtime service.

## Layout

- `apps/web-miniapp` - Taro WeChat mini program
- `apps/api` - Bun + Hono API
- `apps/cms` - TDesign React CMS admin connected to PostgreSQL
- `apps/realtime` - uWebSockets.js realtime service
- `packages/contracts` - shared DTOs and payload contracts
- `packages/shared` - shared utilities
- `packages/config` - env and runtime config

## Local development

1. Copy `.env.example` to `.env`
2. For local manual CMS/API testing, set these dev-only values in `.env` when you need the local token path:

```dotenv
NODE_ENV=development
POSTGRES_HOST=localhost
REDIS_HOST=localhost
EVENTOS_DEV_AUTH_ENABLED=true
EVENTOS_DEV_AUTH_TOKEN=dev-operator-token
EVENTOS_DEV_AUTH_USER_ID=authing-dev-operator
EVENTOS_DEV_AUTH_ORG_ID=authing-dev-org
```

3. Run `docker compose up -d postgres redis`
4. Run `bun run db:migrate`
5. Start the API with `bun run dev:api`
6. Start the CMS with `bun run dev:cms`
7. Open the CMS, set API Base to `http://localhost:3000`, set token to `dev-operator-token`, then click `Load Workspace`

The dev auth token is local-only. It works only when `NODE_ENV=development` and `EVENTOS_DEV_AUTH_ENABLED=true`; when disabled, the API continues to require real Authing tokens and claims.

## Local WeChat config

Put local WeChat credentials in `~/.secret.md` or `~/secret.md` with:

```dotenv
AppID=wx...
AppSecret=...
```

`QR_HMAC_SECRET` is fixed to `yrd` in this repository.

## Ports

- API: `3000`
- CMS: `5174`
- Realtime: `3001`
- PostgreSQL: `5432`
- Redis: `6379`
