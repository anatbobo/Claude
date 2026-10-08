// Run: node worklog/test/parser.test.js
const assert = require('assert');
const { parseWorkLog } = require('../../docs/parser.js');

const today = '2026-10-08T12:00:00'; // Thursday
const projects = ['כהן', 'בנק הפועלים'];
const cases = [
  ['היום עבדתי משמונה וחצי עד ארבע על הדוח הרבעוני ללקוח כהן, כולל חצי שעה הפסקה',
   { date: '2026-10-08', start_time: '08:30', end_time: '16:00', hours: 7, project: 'כהן', activity: 'הדוח הרבעוני' }],
  ['אתמול מ-9 עד 17:30 פגישות עם בנק הפועלים',
   { date: '2026-10-07', start_time: '09:00', end_time: '17:30', hours: 8.5, project: 'בנק הפועלים', activity: 'פגישות' }],
  ['ביום שני עבדתי שלוש שעות וחצי על תיקון באגים',
   { date: '2026-10-05', start_time: '', end_time: '', hours: 3.5, activity: 'תיקון באגים' }],
  ['שלשום שעתיים הכנת מצגת',
   { date: '2026-10-06', hours: 2, activity: 'הכנת מצגת' }],
  ['מתשע ורבע עד חמש פחות רבע כתיבת קוד',
   { start_time: '09:15', end_time: '16:45', hours: 7.5, activity: 'כתיבת קוד' }],
  ['בין 8 ל 12 ישיבת צוות',
   { start_time: '08:00', end_time: '12:00', hours: 4, activity: 'ישיבת צוות' }],
  ['משתיים עד שש בערב ייעוץ טלפוני ללקוח לוי',
   { start_time: '14:00', end_time: '18:00', hours: 4, project: 'לוי', activity: 'ייעוץ טלפוני' }],
  ['5/10 מ 10 עד 14 הדרכה',
   { date: '2026-10-05', start_time: '10:00', end_time: '14:00', hours: 4, activity: 'הדרכה' }],
  ['ב-3 לחודש שש שעות עבודה מהבית',
   { date: '2026-10-03', hours: 6, activity: 'מהבית' }],
  ['8:30 - 16:00 הפסקה של שעה, ניהול פרויקט',
   { start_time: '08:30', end_time: '16:00', hours: 6.5, activity: 'ניהול פרויקט' }],
  ['מאחת עשרה עד שבע וחצי פיתוח',
   { start_time: '11:00', end_time: '19:30', hours: 8.5, activity: 'פיתוח' }],
  ['שעה ורבע שיחות עם ספקים',
   { hours: 1.25, activity: 'שיחות עם ספקים' }],
  ['45 דקות מענה למיילים',
   { hours: 0.75, activity: 'מענה למיילים' }],
  ['משמונה ועשרים עד שלוש תכנון',
   { start_time: '08:20', end_time: '15:00', hours: 6.67, activity: 'תכנון' }],
  ['מ 22 עד 6 משמרת לילה',
   { start_time: '22:00', end_time: '06:00', hours: 8, activity: 'משמרת לילה' }],
  ['ב 7 באוקטובר שלוש שעות אדמיניסטרציה',
   { date: '2026-10-07', hours: 3, activity: 'אדמיניסטרציה' }],
  ['היום 6 שעות כולל חצי שעה הפסקה, סידור מחסן',
   { hours: 5.5, activity: 'סידור מחסן', notes: "הפסקה: 0.5 ש'" }],
  ['עבדתי מ 8 עד 4 אחר הצהריים בפרויקט אלפא בדיקות',
   { start_time: '08:00', end_time: '16:00', hours: 8, project: 'אלפא', activity: 'בדיקות' }],
  ['ביום ראשון משבע בבוקר עד שלוש, שתי פגישות ודוחות',
   { date: '2026-10-04', start_time: '07:00', end_time: '15:00', hours: 8, activity: 'שתי פגישות ודוחות' }],
  ['הכנת הצעת מחיר',
   { date: '2026-10-08', hours: 0, start_time: '', activity: 'הכנת הצעת מחיר' }],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = parseWorkLog(input, { today, projects });
  try {
    for (const k in expected) assert.deepStrictEqual(got[k], expected[k], k);
    console.log('✓', input);
  } catch (e) {
    failed++;
    console.log('✗', input, '\n   field:', e.message, '\n   got:', JSON.stringify(got));
  }
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
