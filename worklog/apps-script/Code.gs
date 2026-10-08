/**
 * Voice work log — Google Apps Script backend.
 *
 * Bound to a Google Sheet. The web page parses the Hebrew voice note itself
 * and sends the reviewed entry here; this script only appends the row.
 *
 * Script Property (Project Settings → Script Properties):
 *   ACCESS_TOKEN – any long random string; the web page must send it
 */

const SHEET_NAME = 'יומן עבודה';
const HEADERS = [
  'תאריך', 'יום', 'שעת התחלה', 'שעת סיום', 'שעות',
  'פרויקט / לקוח', 'פעילות', 'הערות', 'תמליל מקורי', 'נרשם ב-',
];
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
    if (req.action === 'save') {
      return json_({ ok: true, row: saveEntry_(req.entry) });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
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

/** Run once from the editor to create the sheet tab and approve permissions. */
function setup() {
  getSheet_();
}
