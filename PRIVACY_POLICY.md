# Yoshioka Privacy Policy

**Effective date:** August 13, 2026

This Privacy Policy explains how Yoshioka processes information when you use its Calendar features, LINE integration, Discord bot monitoring and announcement features, mobile application, web interface, and Cloudflare-hosted backend (collectively, the "Service").

## 1. Information Processed by Yoshioka

Depending on the features you enable, the Service may process the following information.

### Calendar data stored on your device

- event titles, dates, times, categories, notes, reminder settings, and source information;
- application preferences, theme, language, and notification preferences;
- local notification identifiers used to schedule or cancel reminders.

Calendar records created or imported by the mobile application are primarily stored locally on your device.

### LINE integration data

- LINE user ID and message ID;
- event text submitted to the LINE bot;
- parsed event title, date, time, category, notes, reminder selection, and confirmation status;
- pairing, guided-creation, delivery, reminder, and webhook-processing records.

### Device and authentication data

- randomly generated installation ID;
- a cryptographic hash of the device bearer token;
- device platform, connection status, and last-seen timestamps;
- one-time pairing-code hash and expiration time;
- Expo push token and Discord notification preferences when push notifications are enabled.

### Discord monitoring data

- structured health, activity, warning, error, critical, acknowledgement, and recovery records;
- action, severity, category, timestamp, status, error code, duration, and request identifier;
- Discord guild, channel, or message identifiers when relevant to a monitored operation;
- redacted and size-limited technical metadata;
- alert delivery and acknowledgement status for a paired owner device.
- owner-authenticated Discord Studio session, announcement request, idempotency, channel, delivery, and rate-limit records;
- announcement content and embed data sent to Discord, which Discord processes under its own policies.

### Security and diagnostic data

- request route and method;
- Cloudflare request identifier where available;
- a shortened cryptographic hash derived from a network source for rate-limited security monitoring;
- blocked-attempt counts and operational error information.

Yoshioka does not intentionally store Discord bot tokens, LINE channel secrets, LINE access tokens, passwords, authorization headers, or API secrets in monitoring logs or in the mobile application. Backend credentials are intended to remain encrypted runtime secrets with the infrastructure provider.

## 2. How Information Is Used

Information is processed to:

- create, synchronize, display, categorize, and remind you about calendar events;
- pair an authorized mobile device with the LINE account used by the owner;
- verify and process LINE webhook requests;
- check Discord API, authentication, backend, and database health;
- generate structured monitoring logs, alerts, acknowledgements, and recovery notices;
- deliver calendar reminders and important Discord monitoring notifications;
- prevent duplicate processing and notification spam;
- detect, block, rate-limit, and investigate unauthorized or abnormal access;
- troubleshoot reliability, latency, delivery, and configuration problems.

Yoshioka does not sell personal information and does not use Service data for advertising or user profiling.

## 3. Service Providers and Data Disclosure

Information may be processed by or transmitted through the following providers only as needed for enabled features:

- **Cloudflare Workers and D1** for backend execution, persistence, scheduled jobs, and security controls;
- **Expo Push Notification Service and EAS** for application builds and delivery of enabled mobile push notifications;
- **LINE Messaging API** for receiving bot messages, replying to users, and delivering enabled LINE reminders;
- **Discord API** for bot authentication, service-health checks, allowed-channel lookup, and explicitly authorized announcement delivery;
- **Apple, Google, and the device operating system** for application distribution and native notification delivery.

Information may also be disclosed when reasonably necessary to comply with applicable law, enforce these policies, protect the Service or connected accounts, or investigate suspected abuse. Source code hosted on GitHub does not include production bot tokens or channel secrets.

## 4. Retention

- One-time pairing codes expire after **10 minutes** and are cleared when pairing succeeds.
- Discord Studio browser sessions expire after **12 hours of inactivity** and can be revoked with Log out.
- In-progress LINE guided-event sessions expire after **30 minutes** and are deleted when completed or cancelled.
- Detailed Discord monitoring logs are scheduled for deletion after **30 days**.
- Active unresolved Discord alerts and logs required to explain those alerts may be retained beyond 30 days until the alert is resolved.
- Alert-delivery records, health snapshots, device-pairing records, LINE event records, and reminder records may be retained while necessary to operate the connected features, prevent duplicates, provide history, or protect the Service.
- Calendar information stored locally remains on the device until it is deleted in the application, the application data is cleared, or the application is uninstalled, subject to device backup behavior.

Where a fixed retention period is not stated, information is retained only for as long as reasonably necessary for the purposes described above, security, dispute resolution, or legal obligations.

## 5. Security

Yoshioka uses measures designed to reduce unauthorized access, including encrypted backend secrets, LINE webhook signature verification, cryptographically random device and web-session tokens, hashed bearer-token storage, one-time pairing codes, expiration limits, owner-only monitoring and announcement APIs, secure same-site cookies, restrictive browser security headers, input limits, idempotency checks, disabled Discord mention parsing, structured-log redaction, alert deduplication, rate limiting, and fail-closed Discord target allowlists.

No transmission or storage method is completely secure. You are responsible for protecting your device and provider accounts and for rotating any credential that may have been exposed.

## 6. Your Choices and Requests

You can:

- disable warning, error, or recovery phone notifications in Yoshioka Settings;
- manage the separate Android notification channels in system settings;
- delete local calendar events or clear the application's local data;
- revoke or reset Discord, LINE, Cloudflare, and Expo credentials through those providers;
- stop using the Service or uninstall the application.

To ask a privacy question or request deletion of backend data, open a minimal request through the [Yoshioka GitHub repository](https://github.com/Yoshioka1311/Calendar-Notification/issues). Because GitHub issues are public, do not post tokens, passwords, LINE or Discord identifiers, event contents, or other personal information. Request a private contact method instead.

## 7. International Processing

The infrastructure and third-party providers used by the Service may process information in countries other than your own. Their processing is also governed by their respective privacy policies and legal obligations.

## 8. Children's Privacy

The Service is not directed to children below the minimum age required by applicable law and the connected platforms. Do not use the Service if you are not eligible to use Discord, LINE, or the relevant application store in your jurisdiction.

## 9. Changes to This Policy

This Privacy Policy may be updated as Yoshioka changes. The effective date at the top of this document will be revised when changes are published.

## 10. Contact

Privacy questions may be submitted through the [Yoshioka GitHub repository](https://github.com/Yoshioka1311/Calendar-Notification/issues), without including sensitive or identifying information in the public issue.
