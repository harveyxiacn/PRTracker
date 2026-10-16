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

A shared record contains only: program, **month** of submission, optional office label
(≤ 40 characters), optional province code (PNP) and country code (permits), a `source` tag
(`app` or `paste`), and day counts between submission and each milestone. The intake
workflow rejects any other field. Records are published under CC0.

The “Paste a timeline” parser runs entirely on the device. When someone shares a timeline
they found in a public post, only the same anonymised fields are kept: no usernames, post
text or links.

## Documents, history, encryption and lock (v0.3)

- **Documents:** only the kind, holder (me/spouse/child), dates, country and a free note. The app asks you never to enter document numbers.
- **Personal history:** addresses and activities you type yourself, stored only on the device. Exports are files you choose to save.
- **Encrypted backups:** PBKDF2-SHA-256 (310,000 iterations, random 16-byte salt) and AES-256-GCM (random 12-byte IV) via WebCrypto. A forgotten passphrase cannot be recovered.
- **App lock:** only a salted PBKDF2 hash of the PIN is stored. After 5 wrong tries there is an exponential back-off. The only reset is wiping all data.
- **Calendar export (.ics):** reminder titles and trip destinations go into a file you choose to import into your calendar app. That calendar may sync to a cloud account.

## Threat model notes

- Someone with your unlocked phone can open the app unless you set the PIN lock.
- Plain JSON backups are readable by anyone with the file; prefer the encrypted backup.
