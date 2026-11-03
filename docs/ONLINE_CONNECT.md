# Online Connect (live board only)

Do this in your normal browser — not Cursor’s IDE browser.

Board: https://cron-posting.psyferblock.io/  
Status: https://api.cron-posting.psyferblock.io/oauth/status  
Health: https://api.cron-posting.psyferblock.io/health

## 1. Google Cloud (project `socials-511219`)

1. Open [Credentials](https://console.cloud.google.com/apis/credentials?project=socials-511219).
2. Use an OAuth client type **Web application** (not Desktop).
3. Authorized redirect URI — exact:

   `https://api.cron-posting.psyferblock.io/oauth/youtube/callback`

4. Consent screen → **In production**.
5. Put that Web client’s ID/secret on Dokploy API as `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`.

## 2. Meta (same Business app as `IG_BUSINESS_ID`)

1. Open the app → Facebook Login → Settings (Valid OAuth Redirect URIs).
2. Add exact:

   `https://api.cron-posting.psyferblock.io/oauth/instagram/callback`

3. App mode **Live**.
4. Dokploy API: `META_APP_ID`, `META_APP_SECRET`, `IG_BUSINESS_ID`.

## 3. Dokploy API env (clients + gate, not user tokens)

```
PUBLIC_API_URL=https://api.cron-posting.psyferblock.io
PUBLIC_WEB_URL=https://cron-posting.psyferblock.io
OAUTH_GATE=<long random secret>
YOUTUBE_CLIENT_ID=…
YOUTUBE_CLIENT_SECRET=…
META_APP_ID=…
META_APP_SECRET=…
IG_BUSINESS_ID=…
GOOGLE_SERVICE_ACCOUNT_JSON={…}
```

After Connect writes S3, you can drop `YOUTUBE_REFRESH_TOKEN` / `META_ACCESS_TOKEN` from env.

Web service only needs `API_URL` / `NEXT_PUBLIC_API_URL` = `https://api.cron-posting.psyferblock.io`.

## 4. Connect once on the live board

1. Open https://cron-posting.psyferblock.io/
2. Paste `OAUTH_GATE` into Connect.
3. **Connect YouTube** → pick **The G.A.F. Brand Account**.
4. **Connect Instagram**.
5. Confirm `/oauth/status` and `/health` show youtube + instagram ok (source `s3`).

Tokens land at `s3://socials.bucket/socials/secrets/oauth-tokens.json`.

## 5. Sheets service account

1. Create a Google service account in the same project.
2. Paste JSON into Dokploy `GOOGLE_SERVICE_ACCOUNT_JSON`.
3. Share spreadsheet `1kxKUbKUETiRT-bf69AcAMOERAbNdRsf9yobZrNWuyvw` with the SA email (Editor).
