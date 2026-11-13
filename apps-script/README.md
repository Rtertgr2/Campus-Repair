# Green Walk Audit — Apps Script backend

Google Apps Script web app that persists field-audit issues to Google Sheets,
stores photos in Google Drive and requires the staff PIN for status updates.

## 1. Prepare the spreadsheet

1. Create (or open) the Google Sheet that will hold the audit data.
2. Inside it: **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with this folder's `Code.gs`, and
   `appsscript.json` with this folder's `appsscript.json`
   (enable **Project Settings → Show "appsscript.json"** to see it).

You do not need to create the `Issues` sheet or its header row by hand — the
script creates the `Issues` tab with these columns on first use:

| id | createdDate | dueDate | groupId | zone | category | riskLevel | locationDetail | suggestion | beforePhotoUrl | status | closedDate | afterPhotoUrl | staffNote |
| -- | ----------- | ------- | ------- | ---- | -------- | --------- | -------------- | ---------- | -------------- | ------ | ---------- | ------------- | --------- |

`dueDate` is set to 30 days after the report date. Status values are
`รอแก้ไข` (open) and `ปิดงานแล้ว` (closed).

Assessment results land in a second tab, `Assessments`, created the same way:

| id | timestamp | studentId | studentName | level | groupId | knowledgeCorrect | knowledgeTotal | knowledgePercent | awarenessPoints | awarenessMax | awarenessPercent |
| -- | --------- | --------- | ----------- | ----- | ------- | ---------------- | -------------- | ---------------- | --------------- | ------------ | ---------------- |

`id` is sequential (`A-001`). Percentages are recomputed server-side
(`Math.round(score / max * 100)`); the totals and points sent by the client are
clamped so a malformed request cannot inflate a score. Group and overall
averages are computed in the app from these rows, not stored.

## 2. Script properties

**Project Settings → Script properties**:

| Property         | Required | Purpose                                                      |
| ---------------- | -------- | ------------------------------------------------------------ |
| `STAFF_PIN`      | yes      | PIN required to change a status. Keep it out of the frontend. |
| `SPREADSHEET_ID` | no       | Only needed if the script is **not** bound to the sheet.      |
| `TIMEZONE`       | no       | Defaults to the script's time zone (e.g. `Asia/Bangkok`).     |

The script refuses PIN checks until `STAFF_PIN` is set — there is no fallback
PIN in the deployed backend.

## 3. Deploy

**Deploy → New deployment → Web app**

- Execute as: **Me**
- Who has access: **Anyone** (the app is public; only status changes need the PIN)

Copy the deployment URL ending in `/exec`.

## 4. Connect the React app

```bash
cp .env.example .env
# then set:
# VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
```

Restart `npm run dev`. The warning banner in the header disappears once the URL
is set. Without it the frontend runs on an in-memory sample store that does
**not** persist and never writes to Sheets or Drive.

`/exec` must be public and must be the *deployment* URL, not the `/dev` URL:
`/dev` requires a Google login and answers with HTML.

## API contract

Every request is `POST` with `Content-Type: text/plain;charset=utf-8` and a JSON
body. `text/plain` is deliberate: it keeps the request "simple", so the browser
skips the CORS preflight that Apps Script cannot answer. All responses are
`{ ok: true, ... }` or `{ ok: false, error: "..." }`.

| `action`       | Request body                                                                    | Response                  |
| -------------- | ------------------------------------------------------------------------------- | ------------------------- |
| `listIssues`   | `{ action }`                                                                    | `{ ok, issues }`          |
| `createIssue`  | `{ action, issue: { groupId, zone, category, riskLevel, locationDetail, suggestion, beforePhotoDataUrl?, beforePhotoName? } }` | `{ ok, issue }` |
| `updateStatus` | `{ action, pin, rowIndex, status, staffNote?, afterPhotoDataUrl? }`             | `{ ok, issue }`           |
| `verifyPin`    | `{ action, pin }`                                                               | `{ ok }` / `{ ok:false }` |
| `listAssessments` | `{ action }`                                                                 | `{ ok, assessments }`     |
| `submitAssessment` | `{ action, assessment: { studentId, studentName, level, groupId, knowledgeCorrect, knowledgeTotal, awarenessPoints, awarenessMax } }` | `{ ok, assessment }` |

`Issue` objects use `beforePhotoUrl` / `afterPhotoUrl` on the wire; the React
client maps them to `beforePhoto` / `afterPhoto`.

## Photos

Photos arrive as base64 data URLs (the React app downscales them to at most
1280px / JPEG 0.8 before upload) and are written to the Drive folder
`Green Walk Audit Photos`. Each file is shared as "anyone with the link can
view" so it renders in `<img>`. If your domain policy forbids link sharing the
sharing call is skipped and the returned URL only works for signed-in staff.

## Assessment scoring

The answer key and the awareness weights live in `src/lib/assessment.ts` — the
repo contained no scoring spec, so they are explicit there for review:

- **Knowledge (pre-test, 10 questions):** each question has an `answerIndex`;
the score is correct answers out of 10.
- **Awareness (post-test, 12 questions):** a survey with no wrong answers, so
each option carries `points` from 0 to 1 and the score is the sum (max 12).
- **Averages:** every student is expressed as a percentage of the maximum, then
 averaged per `groupId` and overall. Averages are computed from the stored rows,
 so they include results submitted from any device.

## Limitations

- Photos are held in memory in the browser until submit; there is no offline queue.
- `rowIndex` is the sheet row number, so deleting/inserting rows manually in the
  sheet will break in-flight edits. Use the app rather than editing rows by hand.
- The backend has no per-user accounts: the PIN is a single shared secret.
