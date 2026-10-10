# Voice work log (Hebrew) → Google Sheets — free

Record a short Hebrew voice note about your work day. The page picks out the date, hours, project and activity, you check the result, and it's saved as a row in a Google Sheet.

**It costs nothing to run:** no API keys and no paid services.

```
Phone browser (docs/index.html + docs/parser.js)
  🎙 Hebrew speech-to-text, built into Chrome / Safari
  → transcript, which you can edit
  → parser.js picks out date, times, hours, break, project, activity (on the phone)
  → you check and fix the fields
        │  POST {action: "save"}
        ▼
Google Apps Script web app (worklog/apps-script/Code.gs), attached to your sheet
  → new row in that month's tab ("אוקטובר 2026"), sorted by date
```

## The spreadsheet

| Tab | What's in it |
|---|---|
| **סיכום** | One row per month: total hours and working days. Newest month first. |
| **אוקטובר 2026**, **נובמבר 2026**, … | That month's entries. **Row 1 shows the month's total hours and working days** and updates with every entry, so at the end of the month it shows the final total. |

- A new month's tab is created automatically when the first entry for that month is saved.
- Entries go by **the date you worked**, not the day you recorded them. "אתמול" said on the 1st goes into the previous month's tab.
- Rows are kept sorted by date and start time, so recording entries out of order is fine.
- You can fix or delete rows by hand. The totals update automatically.

| Part | Cost |
|---|---|
| Speech recognition (Chrome / Safari) | free |
| Parser (runs on your phone) | free |
| Google Sheet + Apps Script | free |
| Page hosting (GitHub Pages or Netlify) | free |

## How to speak

The parser looks for set patterns, so it works best if you mention, in any order:
**when** (a day), **hours** (a range or a duration), **for whom** (client or project), and **what you did**.

> *"היום משמונה וחצי עד ארבע ללקוח כהן, הכנת הדוח הרבעוני, חצי שעה הפסקה"*
> → `08:30–16:00 · 7 hours · כהן · הכנת הדוח הרבעוני · break: 0.5`

| What it recognizes | Examples |
|---|---|
| Day | היום (default) · אתמול · שלשום · ביום שני · 5/10 · ה-3 לחודש · 7 באוקטובר |
| Time range | משמונה עד ארבע · מ-9 עד 17:30 · בין 8 ל-12 · מתשע ורבע עד חמש פחות רבע · משמונה ועשרים עד שלוש |
| Morning / evening | משתיים עד שש **בערב** · עד ארבע **אחר הצהריים** · משבע **בבוקר** |
| Duration (no range) | שלוש שעות · שעתיים וחצי · שעה ורבע · 45 דקות |
| Break (subtracted from hours) | חצי שעה הפסקה · הפסקה של שעה · כולל רבע שעה הפסקה |
| Project / client | ללקוח כהן · בפרויקט אלפא · עבור לוי · or any name on your saved list |
| Activity | everything else that's left |

Notes:
- Spoken times are read as working hours: "משמונה עד ארבע" becomes 08:00–16:00, and "משתיים עד שש" becomes 14:00–18:00. Night shifts work too: "מ-22 עד 6" gives 8 hours.
- Without a list, only **one word** after "ללקוח" or "בפרויקט" is taken as the project name, unless you pause (comma) after the name. For multi-word names like "בנק הפועלים", add them under ⚙ → **פרויקטים / לקוחות קבועים**. Each project you save is also added to that list automatically.
- Nothing is saved until you tap **שמירה לגיליון**, so you can always fix a field first.

## Setup (about 10 minutes)

### 1. Google Sheet and Apps Script
1. Create a new Google Sheet, for example "דיווח שעות".
2. Open **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
4. Under **Project Settings** (⚙), tick *Show "appsscript.json" manifest file*, then replace that file's contents with [`apps-script/appsscript.json`](apps-script/appsscript.json).
5. Under **Project Settings → Script Properties**, add `ACCESS_TOKEN` with a long random string you make up. It acts as the password for saving to your sheet.
6. Pick `setup` in the function dropdown and click **Run**. Approve the permissions; the script can only access this one spreadsheet. This creates the "סיכום" tab and this month's tab.
7. Click **Deploy → New deployment → Web app**. Set *Execute as*: **Me** and *Who has access*: **Anyone**, then deploy. Copy the URL, which ends in `/exec`.

> "Anyone" lets the page reach the script without a Google login. Every request must include your `ACCESS_TOKEN`, so nobody else can write to the sheet.
>
> If you edit `Code.gs` later, go to **Deploy → Manage deployments → Edit → Version: New version** so the URL keeps working with the new code.

### 2. The recording page
The page needs HTTPS for microphone access. Free options:
- **GitHub Pages** (free for public repos): repo **Settings → Pages → Deploy from branch → `main` / `/docs`**. It will be published at `https://<user>.github.io/<repo>/`.
- **Netlify Drop** (works with any repo): drag the `docs` folder onto https://app.netlify.com/drop.

Open the page on your phone, tap ⚙, and paste the web app URL and the access token. They're stored on that device only.
Alternatively, open it once with `…/index.html#url=<WEB_APP_URL>&token=<ACCESS_TOKEN>` and the page saves both and removes them from the address bar.

Then use **Add to Home Screen** so it opens like an app.

### Updating an existing installation
If you set this up before monthly tabs existed:
1. Replace `Code.gs` in Apps Script with the new version and save.
2. Go to **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The URL stays the same, so the phone needs no changes.
3. Optional: to move entries from the old "יומן עבודה" tab into monthly tabs, pick `migrateOldLog` in the function dropdown and click **Run**. The old tab is renamed "יומן עבודה (הועבר)" rather than deleted; delete it yourself once you've checked.

## Usage
1. Tap 🎙 and speak. Tap again to stop.
2. Correct the transcript if needed, then tap **נתח**.
3. Check the fields and tap **שמירה לגיליון**.

## Development
Parser tests (Node, no dependencies):
```
node worklog/test/parser.test.js
```
To support a new phrasing, add a case to the test file, then adjust `docs/parser.js` until it passes.

**Browsers:** Chrome on Android or desktop and Safari on iPhone support Hebrew speech recognition. In other browsers, the keyboard's own dictation mic works in the text box.
