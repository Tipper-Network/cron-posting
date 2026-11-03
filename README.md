# cron-posting

Dokploy Nest API + Next board. Cuts stay on the laptop. This service posts `scheduled` Sheet rows to Instagram and YouTube every 15 minutes.

## Cloud Connect (Option A)

Tokens are no longer pasted forever into env.

1. Fix deploy (API Dockerfile asserts `dist/main.js`).
2. Sheets: set `GOOGLE_SERVICE_ACCOUNT_JSON` and share the spreadsheet with that email.
3. YouTube: Google Cloud OAuth **Web** client. Authorized redirect URI =  
   `https://api.cron-posting.psyferblock.io/oauth/youtube/callback`  
   Consent screen **In production**. Set `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`.
4. Instagram: Meta app Live. Valid OAuth redirect =  
   `https://api.cron-posting.psyferblock.io/oauth/instagram/callback`  
   Set `META_APP_ID` / `META_APP_SECRET` / `IG_BUSINESS_ID`.
5. Set `OAUTH_GATE`, `PUBLIC_API_URL`, `PUBLIC_WEB_URL` on the API.
6. Open the web board → Connect → paste gate → Connect YouTube / Connect Instagram.
7. Refresh tokens land at `s3://socials.bucket/socials/secrets/oauth-tokens.json` (private). Instagram extends itself daily when under 14 days remain.

`GET /oauth/status` and `GET /health` show whether platforms are alive. Do not put `YOUTUBE_TOKEN_PATH` or `GOOGLE_OAUTH_TOKEN_PATH` on the server.
