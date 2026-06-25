# Local Secret Handling

This repository expects local-only secret values to stay outside git history.

## Source of truth

- `~/.secret.md` for local machine secrets
- `.env` for development-only environment values

## Expected keys in `~/.secret.md`

```dotenv
AppID=wx...
AppSecret=...
```

## Event OS local env

- `QR_HMAC_SECRET=yrd`
- `WECHAT_APP_ID` should be read from local secret material
- `WECHAT_APP_SECRET` should be read from local secret material

## Notes

- Do not commit real secrets
- Keep `.env.example` sanitized
- Prefer machine-local `~/.secret.md` for WeChat credentials
