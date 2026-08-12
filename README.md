# Bousu Calendar

Expo calendar app with native Android/iOS event reminders and optional LINE reminders delivered by a Cloudflare Worker.

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
