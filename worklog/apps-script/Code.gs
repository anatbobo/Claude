/**
 * Voice work log — Google Apps Script backend.
 *
 * Bound to a Google Sheet. The web page parses the Hebrew voice note itself
 * and sends the reviewed entry here; this script appends it to the tab of the
 * month the work was done in ("אוקטובר 2026"). Each month tab shows its total
 * hours at the top, and the "סיכום" tab lists every month's total.
 *
 * Script Property (Project Settings → Script Properties):
 *   ACCESS_TOKEN – any long random string; the web page must send it
 */

const HEADERS = [
  'תאריך', 'יום', 'שעת התחלה', 'שעת סיום', 'שעות',
  'פרויקט / לקוח', 'פעילות', 'הערות', 'תמליל מקורי', 'נרשם ב-',
];
const SUMMARY_SHEET = 'סיכום';
const OLD_SHEET = 'יומן עבודה'; // single tab used before monthly tabs
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט',
                       'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const FIRST_DATA_ROW = 3; // row 1: monthly total, row 2: headers
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
      return json_({ ok: true, sheet: saveEntry_(req.entry) });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function saveEntry_(entry) {
  if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '')) throw new Error('Missing date');
  const d = new Date(entry.date + 'T12:00:00');
  const hours = Number(entry.hours) ||
    (entry.start_time && entry.end_time ? hoursBetween_(entry.start_time, entry.end_time) : '');
  const sheet = appendToMonth_(d, [
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
  return sheet.getName();
}

/** Appends a row to the tab of the month the work was done in, keeping it sorted by date and time. */
function appendToMonth_(date, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getMonthSheet_(date);
    sheet.appendRow(row);
    const count = sheet.getLastRow() - FIRST_DATA_ROW + 1;
    if (count > 1) {
      sheet.getRange(FIRST_DATA_ROW, 1, count, HEADERS.length).sort([{ column: 1 }, { column: 3 }]);
    }
    return sheet;
  } finally {
    lock.releaseLock();
  }
}

function monthName_(date) {
  return HEBREW_MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

function getMonthSheet_(date) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = monthName_(date);
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  sheet = ss.insertSheet(name, tabPosition_(ss, date)); // tabs run newest month first
  sheet.setRightToLeft(true);
  const last = 'E' + FIRST_DATA_ROW + ':E';
  sheet.getRange('A1:F1').setValues([[
    'סה״כ שעות בחודש:', '', '', '', '=SUM(' + last + ')',
    '=COUNTUNIQUE(A' + FIRST_DATA_ROW + ':A) & " ימי עבודה"',
  ]]);
  sheet.getRange('A1:F1').setFontWeight('bold').setFontSize(12).setBackground('#e8f0fe');
  sheet.getRange(2, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold')
    .setBackground('#f1f3f4');
  sheet.setFrozenRows(2);
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('C:D').setNumberFormat('@'); // keep HH:MM as typed
  sheet.getRange('E:E').setNumberFormat('0.00');

  addToSummary_(name, date);
  return sheet;
}

/** Index for a new month tab: after the summary tab and any newer month tabs. */
function tabPosition_(ss, date) {
  const key = date.getFullYear() * 12 + date.getMonth();
  let pos = 0;
  ss.getSheets().forEach(function (sh, i) {
    const m = sh.getName().match(/^(\S+) (\d{4})$/);
    const month = m ? HEBREW_MONTHS.indexOf(m[1]) : -1;
    if (sh.getName() === SUMMARY_SHEET || (month >= 0 && Number(m[2]) * 12 + month > key)) pos = i + 1;
  });
  return pos;
}

/** One row per month on the summary tab, linked to that month's totals. */
function addToSummary_(name, date) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let summary = ss.getSheetByName(SUMMARY_SHEET);
  if (!summary) {
    summary = ss.insertSheet(SUMMARY_SHEET, 0);
    summary.setRightToLeft(true);
    summary.getRange('A1:D1').setValues([['חודש', 'סה״כ שעות', 'ימי עבודה', 'מפתח']])
      .setFontWeight('bold').setBackground('#f1f3f4');
    summary.setFrozenRows(1);
    summary.getRange('B:B').setNumberFormat('0.00');
    summary.getRange('D:D').setFontColor('#9aa0a6');
  }
  const ref = "'" + name.replace(/'/g, "''") + "'!";
  summary.appendRow([
    name,
    '=' + ref + 'E1',
    '=COUNTUNIQUE(' + ref + 'A' + FIRST_DATA_ROW + ':A)',
    Utilities.formatDate(date, TZ, 'yyyy-MM'),
  ]);
  const rows = summary.getLastRow() - 1;
  if (rows > 1) summary.getRange(2, 1, rows, 4).sort({ column: 4, ascending: false });
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

/** Run once from the editor: creates this month's tab and the summary, and approves permissions. */
function setup() {
  getMonthSheet_(new Date());
}

/**
 * Optional, run once from the editor: moves rows from the old single "יומן עבודה" tab
 * into the monthly tabs, then renames the old tab so nothing is lost.
 */
function migrateOldLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName(OLD_SHEET);
  if (!old) { Logger.log('No "' + OLD_SHEET + '" tab found, nothing to move.'); return; }
  const rows = old.getDataRange().getValues().slice(1).filter(function (r) { return r[0]; });
  rows.forEach(function (r) {
    const d = r[0] instanceof Date ? r[0] : new Date(String(r[0]) + 'T12:00:00');
    r[0] = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
    appendToMonth_(d, r.slice(0, HEADERS.length));
  });
  old.setName(OLD_SHEET + ' (הועבר)');
  Logger.log('Moved ' + rows.length + ' rows.');
}
