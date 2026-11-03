# cron-posting

Dokploy Nest API + Next board. Cuts stay on the laptop. This service posts `scheduled` Sheet rows to Instagram and YouTube every 15 minutes.

## Cloud Connect (Option A)

Tokens are no longer pasted forever into env. Connect runs on the **live board** in your normal browser — see [`docs/ONLINE_CONNECT.md`](docs/ONLINE_CONNECT.md).

Locked callbacks:

- YouTube: `https://api.cron-posting.psyferblock.io/oauth/youtube/callback`
- Instagram: `https://api.cron-posting.psyferblock.io/oauth/instagram/callback`
- Board: `https://cron-posting.psyferblock.io/`

Dokploy API needs `OAUTH_GATE`, `PUBLIC_API_URL`, `PUBLIC_WEB_URL`, YouTube **Web** client, Meta app id/secret, and `GOOGLE_SERVICE_ACCOUNT_JSON`. Empty `OAUTH_GATE` → Connect returns 401.

After Connect, tokens live at `s3://socials.bucket/socials/secrets/oauth-tokens.json`. Check `/oauth/status` and `/health`.
