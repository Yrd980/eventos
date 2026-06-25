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
2. Run `docker compose up -d postgres redis`
3. Start the services you need from the workspace

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
