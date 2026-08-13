# Yoshioka

Personal Expo app with two primary modules: Calendar and Discord Bot Monitoring. Calendar keeps native Android/iOS event reminders and LINE event sync. Discord shows owner-only health, structured activity logs, alerts, acknowledgements, and native alert deep links backed by Cloudflare Workers and D1.

## Run locally

PowerShell may block `npm.ps1`, so use the Windows command wrappers:

```powershell
npm.cmd install
npm.cmd start
```

Local notifications use the operating-system scheduler. A native rebuild is required after changing notification permissions or plugin configuration; Expo Go is not the final notification test environment.

## Physical Android notification test

Create an installable development client:

```powershell
npx.cmd eas build --platform android --profile development
```

Install it, run `npm.cmd start -- --dev-client`, open **Settings > Notifications**, and use the 10-second or 1-minute internal test. Preview APKs include these test buttons; production builds do not. Also create an event one minute in the future, background/close the app, and verify the lock screen and notification tray. Android may require enabling notifications, sound, and **Alarms & reminders** in system settings; manufacturer battery-saving rules can also affect exact delivery.

For a normal standalone APK:

```powershell
npx.cmd eas build --platform android --profile preview
```

## Checks

```powershell
npm.cmd run typecheck
npx.cmd eslint app components contexts services types utils --no-cache
cd line-backend
npm.cmd run check
```

The backend setup and LINE webhook instructions are in [line-backend/README.md](line-backend/README.md).

## Policies

- [Terms of Service](TERMS_OF_SERVICE.md)
- [Privacy Policy](PRIVACY_POLICY.md)

## Discord monitoring

The Discord tab intentionally contains observability only: Overview, Logs, and Alerts. It does not contain an announcement editor or a Discord bot token. Pair this device with the existing LINE owner flow before monitoring APIs become readable.

Android uses separate `Event Reminders` and `Discord Bot Alerts` notification channels. Foreground alerts can use the native scheduler; background alerts are sent through Expo Push after the paired device securely registers its Expo push token. A physical-device test and valid Android push credentials are still required before treating background delivery as verified.
