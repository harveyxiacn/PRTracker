# Reddit timelines (optional)

PR Tracker can add anonymised processing timelines from public posts on
[r/ImmigrationCanada](https://www.reddit.com/r/ImmigrationCanada/) to the community dataset.
It is **off by default**: the weekly workflow `.github/workflows/reddit.yml` does nothing until
the repository owner adds the secrets below.

## How it works

1. Once a week the workflow gets an app-only OAuth token and runs one search on
   r/ImmigrationCanada: `(eCOPR OR COPR OR AOR OR "PPR") timeline`, newest first, past week,
   at most 3 pages of 100 posts, 2 s apart (Reddit allows 60 requests per minute; the script
   also waits when the `X-Ratelimit-Remaining` header runs low).
2. Each post's title and text go through the same parser as the app's "Paste a timeline"
   feature (`src/domain/pasteParser.ts`). A post is used only when:
   - the program is clear (CEC, FSW, spousal, PNP…). A bare "Express Entry" is skipped,
     because the parser would have to guess CEC and FSW timelines would skew CEC statistics;
   - it has at least 3 dated milestones, including a submission or AOR date;
   - no date is ambiguous (03/04/2026) or missing its year, and none is in the future;
   - it hasn't been removed or deleted.
3. The result is converted to the same anonymised record the app shares
   (`scripts/fetch-reddit.ts` → `src/data/redditCore.ts`) and checked with the same validator
   as app submissions (`validate` in `scripts/build-community.mjs`), then appended to
   `community/reddit.jsonl`. `scripts/build-community.mjs` merges it with
   `community/records.jsonl` into `public/data/community.json` (identical timelines count once),
   and the workflow commits and redeploys the site.

## What is stored

| File | Contents |
|---|---|
| `community/reddit.jsonl` | One record per post: program id, month of submission (`2026-02`), days from submission to each milestone, and only if present: province code, country code, an IRCC office from the allowed list, `"source": "reddit"`. |
| `community/reddit-seen.txt` | One salted SHA-256 hash per post already used, so it isn't counted twice. |

**Never stored:** post ids or links, usernames, titles, post text, exact dates, or anything
else from the post. The hash salt is a secret, so the hashes can't be matched back to posts.

## Enabling it

1. Sign in to Reddit with the account that will own the app and open
   <https://www.reddit.com/prefs/apps>. Click **create another app…**, choose **script**
   (or **web app**), give it a name such as `pr-tracker-community`, and set the redirect URI
   to `http://localhost:8080` (unused: the app-only flow has no redirect).
2. Note the client id (the string under the app name) and the secret.
3. Make sure your use complies with Reddit's
   [Data API Terms](https://redditinc.com/policies/data-api-terms) and
   [Developer Terms](https://redditinc.com/policies/developer-terms); register your use if
   Reddit asks you to.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:

   | Secret | Value |
   |---|---|
   | `REDDIT_CLIENT_ID` | the app's client id |
   | `REDDIT_CLIENT_SECRET` | the app's secret |
   | `REDDIT_USERNAME` | the Reddit username that owns the app (used in the User-Agent) |
   | `REDDIT_HASH_SALT` | a long random string, e.g. the output of `openssl rand -hex 32`. Keep it stable: changing it makes old posts look new. |

5. Run **Actions → Collect Reddit timelines → Run workflow** once and check the log, e.g.
   `fetch-reddit: 87 posts, 4 new records { kind_uncertain: 30, few_milestones: 41, … }`.

To run it locally: `REDDIT_CLIENT_ID=… REDDIT_CLIENT_SECRET=… REDDIT_USERNAME=… REDDIT_HASH_SALT=… npx tsx scripts/fetch-reddit.ts`.
Without the secrets the script logs a line and exits successfully.

To turn it off, delete the secrets (or disable the workflow). To remove the collected data,
delete `community/reddit.jsonl` and `community/reddit-seen.txt` and run
`node scripts/build-community.mjs`.

## Reddit Data API considerations

- **Non-commercial.** PR Tracker is free, open source and has no ads; the data is used only
  to show aggregate processing-time statistics. Commercial use needs Reddit's approval.
- **Rate limits.** One run a week, at most 4 requests (1 token + 3 search pages), a descriptive
  User-Agent `pr-tracker-community/1.0 (by u/<username>)`, and the rate-limit headers are honoured.
- **No user content or identities kept.** Only derived, aggregate-friendly facts are stored;
  no usernames, text or post ids, and records are never displayed individually with a link
  back to Reddit.
- **Deletion.** Records are not linked to posts (only a salted hash of the id is kept, to
  avoid double counting), so a deleted post leaves no content or identifier in the dataset.
  Posts already removed or deleted when the search runs are skipped. If someone asks for
  their timeline to be removed, it can be found by its facts (program, month, day counts)
  and deleted from `community/reddit.jsonl`.
- **No training, resale or redistribution** of Reddit content: the repository only contains
  the anonymised records described above.
