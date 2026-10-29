# Privacy

PR Tracker handles some of the most sensitive data a person has: travel history and immigration status.
It is built so that **nobody but you, not even the developer, ever receives it.** The only
exception is a timeline you choose to share with the community (see below).

## What is stored, and where

| Data | Where | Leaves the device? |
|---|---|---|
| Profile (PR date, card expiry, status periods, tax years) | On device: IndexedDB database `pr-tracker` (web) / SharedPreferences (Android) / UserDefaults (iOS) | No |
| Trips, applications, assistant chat, eligibility answers | Same | No |
| Backups | A JSON file *you* export and keep | Only where you put it |

- No account, login, analytics, crash reporting, ads or third-party SDKs.
- **Android cloud backup is disabled** (`allowBackup=false`), so app data is not copied to Google Drive.
  Use *Settings → Export backup* before switching phones.
- iOS: app data is part of your device’s own (encrypted) iCloud/Finder backup, if you have that turned on.
- Files you export (backup, CSV, calendar, report, person file) are written to the app's private
  cache only long enough for the share sheet, then deleted. Any left over (e.g. if the app was
  closed while sharing) are removed on the next start.
- *Settings → Delete all data* wipes everything the app stored on the device: the data, scheduled
  reminders and leftover export files. On the web it clears only PR Tracker's own IndexedDB database.
- **Data is not encrypted at rest.** It sits in the app's private storage, protected by the
  operating system's app sandbox and your device lock. The app PIN is a screen lock, not encryption
  (see below).

## Network requests the app makes

| Request | When | What is sent |
|---|---|---|
| `GET <dataUrl>/ircc.json`, `draws.json`, `community.json` | app start / *Refresh* | Nothing personal; no cookies, `credentials: omit`, no referrer |
| `GET <dataUrl>/ircc-history.json` | opening processing-time trends / curves | Same: nothing personal |
| `GET api.github.com/repos/harveyxiacn/PRTracker/releases/latest` (Android GitHub build only) | at most once a day with *Check automatically* on (default), or when you tap *Check for updates* | Nothing personal: a plain request for public release metadata. GitHub sees the request (IP address) like any website |
| Downloading an update (Android GitHub build only) | only when you tap *Download and install* | Nothing personal; the APK comes from GitHub's release storage |
| Opening Reddit/Google/IRCC/GitHub links | only when you tap them | the generic search text shown (stream + month) |
| Sharing a timeline | only when you tap *Review & share* and confirm | opens a GitHub "new issue" page in your browser with the anonymised record (program, month, day counts) **in the page address**. GitHub receives that record as soon as the page opens, linked to your GitHub account if you are signed in. It becomes public only if you submit the issue. |

`<dataUrl>` is `https://harveyxiacn.github.io/PRTracker/data/` unless you change it in
*Settings → Open data source* (https only; leave it empty to use only the data bundled with the app).
If you point it at another server, that server sees the same requests (your IP address and the
file names). Restoring a backup never changes this setting, the app lock or the screenshot block:
they always stay as set on this device.

The web build is a static site; the hosting (GitHub Pages) sees ordinary request logs (IP, user
agent) like any website. The native apps load the UI from the device itself.

**Web version and the shared github.io origin.** The web app is served from
`harveyxiacn.github.io/PRTracker/`. Browsers isolate storage per *origin*
(`https://harveyxiacn.github.io`), not per path, so any other page the owner publishes on that
GitHub Pages site could in principle read the web app's IndexedDB. The app uses its own database
name to avoid clashes, but this is not a security boundary. Before the web version is promoted, it
should move to a dedicated custom domain (owner action). The Android and iOS apps are not affected.

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
- **Encrypted backups:** PBKDF2-SHA-256 (600,000 iterations, random 16-byte salt) and AES-256-GCM (random 12-byte IV) via WebCrypto. A forgotten passphrase cannot be recovered.
- **App lock:** a **screen lock**, not encryption. It stops someone holding your unlocked phone from opening the app; the data itself is stored unencrypted next to a salted PBKDF2 hash of the PIN, so someone who can read the app's private storage (e.g. a rooted or forensically examined device) can read it without the PIN. After 5 wrong tries there is a back-off (based on the device clock). Face ID / fingerprint unlock accepts any biometric enrolled on the device. The only reset is wiping all data.
- **While a PIN is set:** reminder notifications show only "PR Tracker: You have a reminder", with no names, numbers or status, because notifications are visible on the lock screen. Without a PIN they include details such as days remaining and household members' names. On Android, screenshots and the recent-apps preview are blocked (FLAG_SECURE); on iOS the app is covered by a blank screen in the app switcher.
- **Calendar export (.ics):** reminder titles and trip destinations go into a file you choose to import into your calendar app. That calendar may sync to a cloud account.

## Household, widget and Reddit (v0.4)

- **Household:** names are only labels you choose (a first name or nickname is enough), stored on this device like the rest of your data.
- **Android widget:** shows a short snapshot (citizenship countdown, residency status, PR card expiry or "abroad since" date) on your home screen. It contains no names or free text. Anyone who can see your home screen can see it, so don't add the widget if that's a concern.
- **Block screenshots:** an opt-in Android setting (FLAG_SECURE) that also hides the app preview in recent apps. It is always on while a PIN lock is set.
- **Reddit ingestion:** runs only in the project's GitHub Actions, never in the app. It reads public posts through Reddit's official API and stores only anonymised facts (program, month, day counts, province/country/office from a fixed list), plus salted hashes of post ids for de-duplication. No usernames, post ids, links or text are stored. See docs/REDDIT.md.

## Sharing between phones (v0.8)

- "Send a person" creates a file containing only that person's PR/status dates and trips, encrypted with the same envelope as encrypted backups (PBKDF2-SHA-256 600,000 iterations, AES-256-GCM). The file name does not contain the person's name.
- Send the passphrase by a different channel (in person, by phone). Anyone with both the file and the passphrase can read it. There is no server; the file goes wherever you send it.

## Threat model notes

- Someone with your unlocked phone can open the app unless you set the PIN lock.
- The PIN lock does not protect against someone who can extract the app's storage; use the device's own lock and encryption for that.
- A shared timeline record reaches GitHub when the issue page opens, before you decide to post it.
- Plain JSON backups are readable by anyone with the file; prefer the encrypted backup.
