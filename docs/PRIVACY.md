# Privacy

PR Tracker handles some of the most sensitive data a person has: travel history and immigration status.
It is built so that **nobody but you, not even the developer, ever receives it.**

## What is stored, and where

| Data | Where | Leaves the device? |
|---|---|---|
| Profile (PR date, card expiry, status periods, tax years) | On device: IndexedDB (web) / SharedPreferences (Android) / UserDefaults (iOS) | No |
| Trips, applications, assistant chat, eligibility answers | Same | No |
| Backups | A JSON file *you* export and keep | Only where you put it |

- No account, login, analytics, crash reporting, ads or third-party SDKs.
- **Android cloud backup is disabled** (`allowBackup=false`), so app data is not copied to Google Drive.
  Use *Settings → Export backup* before switching phones.
- iOS: app data is part of your device’s own (encrypted) iCloud/Finder backup, if you have that turned on.
- *Settings → Delete all data* wipes everything on the device.

## Network requests the app makes

| Request | When | What is sent |
|---|---|---|
| `GET <dataUrl>/ircc.json`, `draws.json`, `community.json` | app start / *Refresh* | Nothing personal; no cookies, `credentials: omit`, no referrer |
| Opening Reddit/Google/IRCC/GitHub links | only when you tap them | the generic search text shown (stream + month) |
| Sharing a timeline | only when you tap *Review & share* | opens a GitHub issue **draft** you review and post yourself (needs a GitHub account; it is public) |

The web build is a static site; the hosting (GitHub Pages) sees ordinary request logs (IP, user
agent) like any website. The native apps load the UI from the device itself.

## Community records

A shared record contains only: application type, **month** of submission, optional office
label (≤ 40 characters), and day counts between submission and each milestone. The intake
workflow rejects any other field. Records are published under CC0.

## Threat model notes

- Someone with your unlocked phone can open the app. Use your device lock; an app lock is on the roadmap.
- Exported backups are plain JSON. Store them somewhere private.
