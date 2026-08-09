# Calendar Notification LINE API

Cloudflare Worker for receiving LINE Messaging API webhooks. It verifies every webhook signature before parsing, stores pending events in D1, prevents duplicate webhook delivery, and replies with a detected event summary.

## Supported message formats

```text
15/08/2026 14:00 Project Meeting
15/08/2026 14:00-15:30 Project Meeting
15 สิงหาคม 2569 เวลา 14:00 ประชุมโปรเจกต์
15 August 2026 14:00 Project Meeting
```

All parsed date-times are stored with the Bangkok offset (`+07:00`). Free-form NLP such as `ประชุมพรุ่งนี้บ่ายสอง` is intentionally rejected until a later parser is implemented.

## Cloudflare Git deployment

Use these settings when importing the repository:

```text
Project name: calendar-notification-line-api
Root directory: line-backend
Build command: (leave empty)
Deploy command: npm run deploy
Production branch: main
```

Wrangler automatically provisions the D1 binding named `DB` during the first deployment. The deploy script then applies all remote migrations.

After deployment, add these encrypted secrets in **Worker > Settings > Variables and Secrets**:

```text
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
```

Never add their values to GitHub, `wrangler.jsonc`, or the Expo application.

Use the deployed webhook URL in LINE Developers:

```text
https://calendar-notification-line-api.<account>.workers.dev/api/line/webhook
```

Click **Verify**, enable **Use webhook**, and enable **Webhook redelivery**.

## Local checks

```powershell
npm.cmd install
npm.cmd run check
```

For local Worker development, copy `.dev.vars.example` to `.dev.vars`, use non-production LINE credentials, and initialize local D1:

```powershell
npm.cmd run db:migrate:local
npm.cmd run dev
```
