# Voice work log (Hebrew) → Google Sheets

Record a short Hebrew voice note about your work day. Claude extracts the date, hours and activity, you review the result, and it's saved as a row in a Google Sheet.

```
Phone browser (docs/index.html)
  🎙 Hebrew speech-to-text (built into Chrome / Safari, he-IL)
  → transcript, which you can edit
        │  POST {action: "parse"}
        ▼
Google Apps Script web app (worklog/apps-script/Code.gs), attached to your sheet
  → Claude API returns JSON: date, start, end, hours, project, activity, notes
        │  shown back to you to check and fix
        ▼  POST {action: "save"}
  → new row in the "יומן עבודה" sheet
```

Example note: *"היום עבדתי משמונה וחצי עד ארבע על הדוח הרבעוני ללקוח כהן, כולל חצי שעה הפסקה"*
→ `2026-10-08 | חמישי | 08:30 | 16:00 | 7.00 | כהן | הכנת הדוח הרבעוני | חצי שעה הפסקה | …`

## Setup (about 10 minutes)

### 1. Claude API key
Create a key at https://console.anthropic.com/ (Settings → API Keys). Each note costs a fraction of a cent.

### 2. Google Sheet and Apps Script
1. Create a new Google Sheet, for example "דיווח שעות".
2. Open **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
4. Under **Project Settings** (⚙), tick *Show "appsscript.json" manifest file*, then replace that file's contents with [`apps-script/appsscript.json`](apps-script/appsscript.json).
5. Still in **Project Settings → Script Properties**, add:
   - `ANTHROPIC_API_KEY`: your key
   - `ACCESS_TOKEN`: a long random string you make up (it acts as the password for the endpoint)
6. Pick `setupAndTest` in the function dropdown and click **Run**. Approve the permissions. This creates the "יומן עבודה" tab and logs a sample parse.
7. Click **Deploy → New deployment → Web app**. Set *Execute as*: **Me** and *Who has access*: **Anyone**, then deploy. Copy the URL, which ends in `/exec`.

> "Anyone" is required so the page can reach the endpoint without a Google login. Every request has to include your `ACCESS_TOKEN`, so nobody else can write to the sheet.
>
> If you edit `Code.gs` later, go to **Deploy → Manage deployments → Edit → Version: New version** so the URL keeps working with the new code.

### 3. The recording page
The page has to be served over HTTPS for microphone access. The simplest option is GitHub Pages:
**repo Settings → Pages → Deploy from branch → `main` / `/docs`**. It will be published at `https://<user>.github.io/<repo>/`.
(GitHub Pages on a private repo needs a paid plan. Otherwise you can drag the `docs` folder onto https://app.netlify.com/drop.)

Open the page on your phone, tap ⚙, and paste the web app URL and the access token. They are saved on that device.
Alternatively, open it once with `…/index.html#url=<WEB_APP_URL>&token=<ACCESS_TOKEN>` and the page stores both and removes them from the address bar.

Then use **Add to Home Screen** so it opens like an app.

## Usage
1. Tap 🎙 and speak. Tap again to stop.
2. Correct the transcript if needed, then tap **נתח**.
3. Check the fields (date, times, hours, project, activity) and tap **שמירה לגיליון**.

Things you can say: relative dates ("אתמול", "ביום שני"), a time range ("מתשע עד חמש וחצי"), a duration only ("שלוש שעות"), breaks ("בלי שעה הפסקה"), a client or project name.

## Notes
- **Browsers:** Chrome on Android or desktop, and Safari on iPhone, support Hebrew speech recognition. If yours doesn't, the keyboard's own dictation mic works in the text box too.
- **Model:** `claude-opus-5-5` at `effort: "low"`, with structured JSON output so the reply always matches the sheet's columns. Server-side fallback (`fallbacks: "default"`) is on, so a rare refusal is retried on another model automatically. To change the model, edit `MODEL` at the top of `Code.gs`.
- **Columns:** the sheet tab and headers are created automatically. Rename `SHEET_NAME` / `HEADERS` in `Code.gs` if you want different ones. Add columns at the end so existing rows don't shift.
