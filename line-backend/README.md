# Yoshioka Backend

Cloudflare Worker for receiving LINE Messaging API webhooks. It verifies every webhook signature before parsing, stores events and guided-flow sessions in D1, prevents duplicate delivery, and asks the user to confirm before an event reaches the app.

The Expo app creates a one-time, 8-character pairing code in Settings. Send `LINK CODE` to the LINE bot within 10 minutes. Confirmed events are imported when the app opens, returns to the foreground, or while it remains open (a one-minute polling interval). Phone reminders use the device scheduler, while LINE reminders are stored and delivered independently by this Worker.

## LINE reminder delivery

The Worker runs a cron trigger every minute, claims due rows in `line_reminders`, sends them with the LINE Messaging API push endpoint, and records `sent_at`. Conditional claims and the sent timestamp prevent duplicate delivery when cron executions overlap. Failed sends release the claim so a later execution can retry while the event is still in the future.

LINE-created events ask the user to choose an at-time, 10-minute, 30-minute, 1-hour, 3-hour, 1-day, or 2-day reminder before confirmation. A paired app can securely update the reminder time or disable delivery through its hashed bearer-token-authenticated API. The phone never receives or stores the LINE channel access token.

## Guided creation

Type `เพิ่มกิจกรรม`, `Add Event`, or use the bot's **เพิ่มกิจกรรม** quick reply. The Worker guides the user through LINE's date picker, time picker, description, reminder, detected category, and final confirmation. Sessions expire after 30 minutes and are stored in D1, so they do not depend on a particular Worker instance. The confirmation also supports editing the description, correcting the category, and cancelling.

## Supported message formats

```text
15/08/2026 14:00 Project Meeting
15/08/2026 14:00-15:30 Project Meeting
15 สิงหาคม 2569 เวลา 14:00 ประชุมโปรเจกต์
15 August 2026 14:00 Project Meeting
พรุ่งนี้บ่ายสองประชุมโปรเจกต์
Doctor appointment Friday at 3 PM
```

All parsed date-times are stored with the Bangkok offset (`+07:00`). Thai and English named dates, relative dates, weekdays, common Thai spoken times, `HH:mm`, `HH.mm`, and English AM/PM are supported. If only the date or time is detected, the bot asks only for the missing field. Bare numbers such as `ทำข้อ 15 ถึงข้อ 20` are not interpreted as dates or times.

Event titles are categorized with weighted Thai/English phrase scoring as `Personal`, `Work`, `School`, `Study`, `Assignment`, `Exam`, `Meeting`, `Health`, `Travel`, `Exercise`, `Important`, or `Other`. Low-confidence ties fall back to `Other`. The detected category is shown in LINE, can be corrected before saving, and is sent to the app for color coding.

## Cloudflare Git deployment

Use these settings when importing the repository:

```text
Project name: calendar-notification
Root directory: line-backend
Build command: (leave empty)
Deploy command: npm run deploy
Production branch: main
```

For a brand-new Worker, deploy once to provision the D1 binding and then run the migrations. This repository already has its production D1 database, so the Git deploy script applies migrations before publishing the Worker; this ensures the reminder table exists before the cron handler becomes active.

After deployment, add these encrypted secrets in **Worker > Settings > Variables and Secrets**:

```text
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
```

Never add their values to GitHub, `wrangler.jsonc`, or the Expo application.

For live Discord health checks, also add the Discord bot token as an encrypted runtime secret:

```text
DISCORD_BOT_TOKEN
```

If Discord action endpoints are added later, configure both comma-separated allowlists. Target checks fail closed when either list is absent:

```text
DISCORD_ALLOWED_GUILD_IDS
DISCORD_ALLOWED_CHANNEL_IDS
```

The current mobile Discord module is monitoring-only and exposes no send-message endpoint. Monitoring APIs require the hashed bearer token of a LINE-paired owner device. Structured D1 logs redact secret-like metadata keys, important alerts use a five-minute deduplication cooldown, detailed logs are retained for 30 days, and active alerts are preserved. The Worker checks Discord every minute and delivers pending owner alerts through Expo Push without exposing the Discord token to the app.

Discord monitoring endpoints:

```text
GET  /api/discord/health
GET  /api/discord/logs
GET  /api/discord/logs/:id
GET  /api/discord/alerts
GET  /api/discord/alerts/:id
POST /api/discord/alerts/:id/acknowledge
POST /api/discord/push/register
```

Use the deployed webhook URL in LINE Developers:

```text
https://calendar-notification.<account>.workers.dev/api/line/webhook
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
