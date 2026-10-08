/**
 * Voice work log — Google Apps Script backend.
 *
 * Bound to a Google Sheet. Receives a Hebrew transcript from the web page,
 * asks Claude to extract date / hours / activity, and appends a row.
 *
 * Script Properties (Project Settings → Script Properties):
 *   ANTHROPIC_API_KEY  – your Claude API key
 *   ACCESS_TOKEN       – any long random string; the web page must send it
 */

const SHEET_NAME = 'יומן עבודה';
const HEADERS = [
  'תאריך', 'יום', 'שעת התחלה', 'שעת סיום', 'שעות',
  'פרויקט / לקוח', 'פעילות', 'הערות', 'תמליל מקורי', 'נרשם ב-',
];
const MODEL = 'claude-opus-5-5';
const TZ = 'Asia/Jerusalem';
const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function doGet() {
  return json_({ ok: true, message: 'Work log endpoint is running' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    if (!req.token || req.token !== props.getProperty('ACCESS_TOKEN')) {
      return json_({ ok: false, error: 'Unauthorized' });
    }
    if (req.action === 'parse') {
      return json_({ ok: true, entry: parseTranscript_(req.transcript) });
    }
    if (req.action === 'save') {
      return json_({ ok: true, row: saveEntry_(req.entry) });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function parseTranscript_(transcript) {
  if (!transcript || !transcript.trim()) throw new Error('Empty transcript');
  const now = new Date();
  const today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  const weekday = HEBREW_DAYS[Number(Utilities.formatDate(now, TZ, 'u')) % 7];

  const system =
    'You turn short spoken Hebrew work-log notes into a structured timesheet entry. ' +
    'Today is ' + today + ' (יום ' + weekday + '), timezone Israel. ' +
    'Resolve relative dates (היום, אתמול, שלשום, ביום שני) to YYYY-MM-DD; default to today. ' +
    'Times are HH:MM in 24h. Spoken times are working hours, so "משמונה וחצי עד ארבע" is 08:30–16:00. ' +
    'If start and end are given, hours = the difference minus any break mentioned. ' +
    'If only a duration is given, fill hours and leave start/end empty. ' +
    'Write activity as a concise Hebrew summary of what was done. ' +
    'Use an empty string for anything not mentioned and 0 for unknown hours. Do not invent details.';

  const schema = {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'YYYY-MM-DD' },
      start_time: { type: 'string', description: 'HH:MM or empty' },
      end_time: { type: 'string', description: 'HH:MM or empty' },
      hours: { type: 'number', description: 'Hours worked, decimal' },
      project: { type: 'string', description: 'Client or project name, or empty' },
      activity: { type: 'string', description: 'What was done, in Hebrew' },
      notes: { type: 'string', description: 'Anything else worth recording, or empty' },
    },
    required: ['date', 'start_time', 'end_time', 'hours', 'project', 'activity', 'notes'],
    additionalProperties: false,
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
      system: system,
      messages: [{ role: 'user', content: transcript }],
    }),
  });

  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Claude API ' + res.getResponseCode() + ': ' + (body.error && body.error.message));
  }
  if (body.stop_reason === 'refusal') throw new Error('Claude declined to process this note');
  const text = body.content.filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('');
  const entry = JSON.parse(text);
  entry.transcript = transcript;
  if (!entry.hours && entry.start_time && entry.end_time) {
    entry.hours = hoursBetween_(entry.start_time, entry.end_time);
  }
  return entry;
}

function saveEntry_(entry) {
  if (!entry || !entry.date) throw new Error('Missing date');
  const sheet = getSheet_();
  const d = new Date(entry.date + 'T12:00:00');
  const hours = Number(entry.hours) ||
    (entry.start_time && entry.end_time ? hoursBetween_(entry.start_time, entry.end_time) : '');
  sheet.appendRow([
    entry.date,
    HEBREW_DAYS[d.getDay()],
    entry.start_time || '',
    entry.end_time || '',
    hours,
    entry.project || '',
    entry.activity || '',
    entry.notes || '',
    entry.transcript || '',
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
  ]);
  return sheet.getLastRow();
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.setRightToLeft(true);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('C:D').setNumberFormat('@'); // keep HH:MM as typed
    sheet.getRange('E:E').setNumberFormat('0.00');
  }
  return sheet;
}

function hoursBetween_(start, end) {
  const toMin = function (t) { const p = t.split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); };
  let diff = toMin(end) - toMin(start);
  if (diff < 0) diff += 24 * 60; // crossed midnight
  return Math.round(diff / 60 * 100) / 100;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create the sheet and check the API key. */
function setupAndTest() {
  getSheet_();
  Logger.log(JSON.stringify(parseTranscript_('היום עבדתי משמונה וחצי עד ארבע על הדוח הרבעוני ללקוח כהן, כולל חצי שעה הפסקה'), null, 2));
}
