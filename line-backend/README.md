# Yoshioka Backend

Cloudflare Worker for receiving LINE Messaging API webhooks. It verifies every webhook signature before parsing, stores events and guided-flow sessions in D1, prevents duplicate delivery, and asks the user to confirm before an event reaches the app.

The Expo app creates a one-time, 8-character pairing code in Settings. Send `LINK CODE` to the LINE bot within 10 minutes. Confirmed events are imported when the app opens, returns to the foreground, or while it remains open (a one-minute polling interval). Phone reminders use the device scheduler, while LINE reminders are stored and delivered independently by this Worker.

The same Worker serves the Discord announcement composer at `/discord`. Discord Studio no longer uses LINE pairing. Its sending APIs instead require a valid Cloudflare Access JWT for an explicitly approved email address, and can send only to the configured guild/channel allowlist. Until email access is configured, the composer remains visible but sending fails closed.

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

For Discord health checks and owner-only slash commands, add the bot token as an encrypted **runtime** secret:

```text
DISCORD_BOT_TOKEN
```

Add these runtime variables as well. The application ID, public key, owner user ID, guild IDs, and channel IDs are identifiers rather than bot credentials, but keeping all Discord configuration at runtime avoids environment drift:

```text
DISCORD_APPLICATION_ID
DISCORD_APPLICATION_PUBLIC_KEY
DISCORD_OWNER_USER_ID
DISCORD_ALLOWED_GUILD_IDS
DISCORD_ALLOWED_CHANNEL_IDS
```

Discord Studio email authentication also requires these runtime variables:

```text
CF_ACCESS_TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
CF_ACCESS_AUD=<Access application audience tag>
DISCORD_STUDIO_ALLOWED_EMAILS=owner@example.com
```

`DISCORD_STUDIO_ALLOWED_EMAILS` accepts a comma-separated list and is checked in the Worker after Cloudflare validates the login. Do not store a one-time PIN, password, or Access JWT in these variables.

`DISCORD_ALLOWED_GUILD_IDS` accepts a comma-separated list. Slash commands are registered only in those guilds and are accepted only when the caller's Discord user ID exactly matches `DISCORD_OWNER_USER_ID`. The only send-message endpoint belongs to the private Discord Studio flow described below; the mobile app remains monitoring-only. Mobile monitoring APIs require the hashed bearer token of a LINE-paired owner device. Structured D1 logs redact secret-like metadata keys, important alerts use a five-minute deduplication cooldown, detailed logs are retained for 30 days, and active alerts are preserved. The Worker checks Discord every minute and delivers pending owner alerts through Expo Push without exposing the Discord token to the app or website.

Discord Studio is available after deployment at:

```text
https://calendar-notification.<account>.workers.dev/discord
```

It supports plain message content plus one embed with title, description, HTTPS link, accent color, HTTPS image, thumbnail, and footer. Bot credentials never reach the browser. Delivery is approved-email-only, same-origin protected, limited to five sends per minute per approved email, idempotent against duplicate clicks, constrained by both Discord allowlists, and uses `allowed_mentions.parse: []` to prevent accidental mass mentions. The bot needs **View Channel**, **Send Messages**, and **Embed Links** in each configured channel.

In Cloudflare Zero Trust, create a self-hosted Access application that protects both `/discord*` and `/api/discord/web/*` on the Worker hostname. Enable the One-time PIN identity provider and create an **Allow** policy containing only the exact email addresses that may use Discord Studio. Do not use a policy that permits every valid email. Leave `/api/line/webhook` outside this Access application because LINE must reach that webhook without an interactive login. Copy the Access application audience tag and team domain into the runtime variables above. The Worker independently verifies the Access JWT signature, issuer, audience, algorithm, and approved email before any Discord Studio API operation.

Set this URL under **Discord Developer Portal > General Information > Interactions Endpoint URL**:

```text
https://calendar-notification.<account>.workers.dev/api/discord/interactions
```

The endpoint validates Discord's Ed25519 signature and rejects missing, malformed, expired, or invalid signatures. It supports these private guild commands:

```text
/status
/health
/test-alert severity:<warning|error|critical>
```

Commands register automatically during the next one-minute cron run after all runtime variables are available. A paired owner can also force registration from **Settings > Discord Alerts > Register Discord slash commands**. Select the `applications.commands` scope when installing the app in Discord; no Gateway connection or privileged intent is needed for these HTTP interaction commands.

Discord monitoring endpoints:

```text
GET  /api/discord/health
GET  /api/discord/logs
GET  /api/discord/logs/:id
GET  /api/discord/alerts
GET  /api/discord/alerts/:id
POST /api/discord/alerts/:id/acknowledge
POST /api/discord/push/register
POST /api/discord/commands/register
POST /api/discord/interactions
GET  /api/discord/web/session
GET  /api/discord/web/channels
POST /api/discord/web/announcements
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
