/**
 * Rule-based parser for spoken Hebrew work-log notes. Runs in the browser, no API.
 *
 *   parseWorkLog("היום משמונה וחצי עד ארבע ללקוח כהן הכנת דוח, חצי שעה הפסקה", {projects: ["כהן"]})
 *   → {date: "2026-10-08", start_time: "08:30", end_time: "16:00", hours: 7, project: "כהן",
 *      activity: "הכנת דוח", notes: "הפסקה: 0.5 ש'"}
 */
(function (root) {
  'use strict';

  const PREFIX = '[משבלוהכ]{0,3}?'; // attached prepositions: מ-, ב-, ל-, ו-, ה-, כ-, ומ-, ...
  const WORD_END = '(?=$|[\\s,.!?;:])';
  const WORD_START = '(^|[\\s,.!?;:])';

  // Longest first so "אחת עשרה" wins over "אחת".
  const NUMBER_WORDS = [
    ['שתים עשרה', 12], ['שתיים עשרה', 12], ['שנים עשר', 12], ['שתים עשר', 12],
    ['אחת עשרה', 11], ['אחד עשר', 11], ['אחת עשר', 11],
    ['חמישים', 50], ['ארבעים', 40], ['שלושים', 30], ['עשרים', 20],
    ['שתיים', 2], ['שתים', 2], ['שניים', 2], ['שלושה', 3], ['שלוש', 3],
    ['ארבעה', 4], ['ארבע', 4], ['חמישה', 5], ['חמש', 5], ['שישה', 6], ['שש', 6],
    ['שבעה', 7], ['שבע', 7], ['שמונה', 8], ['תשעה', 9], ['תשע', 9],
    ['עשרה', 10], ['עשר', 10], ['אחת', 1], ['אחד', 1],
  ];
  const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  // Ordinal day/month, as in "השמיני לעשירי" (8th of October).
  const ORDINALS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני', 'תשיעי', 'עשירי'];
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט',
                  'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const PM_WORDS = 'אחר הצהריים|אחרי הצהריים|אחה"צ|אחה״צ|בצהריים|בערב|בלילה';
  const AM_WORDS = 'בבוקר';
  const FILLER = /(^|\s)(עבדתי|עבדנו|עבודה|היום|סך הכל|בסך הכל|בערך|בסביבות|כמו כן|ואז|אחר כך|גם)(?=\s|$)/g;
  const LEADING_JUNK = /^(?:[,.\-–:;]|\s|ו?על|ו?עם|ב|ו|ש|זה|של)+\s/;

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtTime(h, m) { return pad(h) + ':' + pad(m); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function round2(x) { return Math.round(x * 100) / 100; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Spoken Hebrew numbers → digits; spoken fractions of hours → decimals / HH:MM. */
  function normalize(text) {
    let t = ' ' + text.replace(/\s+/g, ' ').trim() + ' ';
    t = t.replace(/([משבלוהכ]{1,3})[-־](?=\d)/g, '$1 ');           // "מ-8" → "מ 8"
    t = t.replace(/(\d)\s?[-–]\s?(\d)/g, '$1 - $2');                 // "8:30-16:00"

    // Hour durations spoken as words, before number words get converted.
    t = t.replace(/(^|\s)([ול]?)שעתיים(?=\s|$)/g, '$1$2 2 שעות');
    t = t.replace(/(^|\s)(?:חצי|כחצי) שעה/g, '$1 0.5 שעות');
    t = t.replace(/(^|\s)רבע שעה/g, '$1 0.25 שעות');
    t = t.replace(/(^|\s)(?:שלושת|3) רבעי שעה/g, '$1 0.75 שעות');
    t = t.replace(/(^|\s)שעה וחצי/g, '$1 1.5 שעות');
    t = t.replace(/(^|\s)שעה ורבע/g, '$1 1.25 שעות');
    t = t.replace(/(^|\s)(כ?)שעה(?!\s*\d)(?=$|[\s,.])/g, '$1 1 שעות');       // "שעה" alone = one hour

    for (const [word, value] of NUMBER_WORDS) {
      const re = new RegExp(WORD_START + '(' + PREFIX + ')' + word.replace(' ', '\\s+') + WORD_END, 'g');
      t = t.replace(re, function (m, start, prefix) { return start + (prefix ? prefix + ' ' : '') + value; });
    }
    t = t.replace(/\b([2-5]0) ?ו ?([1-9])(?!\d)/g, function (m, a, b) { return String(Number(a) + Number(b)); });

    // Durations: "3 שעות וחצי", "3 וחצי שעות", "2 שעות ו 20 דקות", "45 דקות".
    t = t.replace(/(\d+(?:\.\d+)?) ?שעות ?ו ?(חצי|רבע)/g, function (m, n, f) {
      return (Number(n) + (f === 'חצי' ? 0.5 : 0.25)) + ' שעות';
    });
    t = t.replace(/(\d+) ?ו ?(חצי|רבע) ?שעות/g, function (m, n, f) {
      return (Number(n) + (f === 'חצי' ? 0.5 : 0.25)) + ' שעות';
    });
    t = t.replace(/(\d+(?:\.\d+)?) ?שעות ?ו ?-?(\d{1,2}) ?דקות/g, function (m, h, mm) {
      return round2(Number(h) + Number(mm) / 60) + ' שעות';
    });
    t = t.replace(/(^|\s)(\d{1,3}) ?דקות/g, function (m, s, mm) { return s + round2(Number(mm) / 60) + ' שעות'; });
    t = t.replace(/(\d+(?:\.\d+)?) ?שעה(?=\s|$)/g, '$1 שעות');

    // Clock times: "8 וחצי", "8 ורבע", "8 פחות רבע", "8 ו 20" (not followed by שעות).
    t = t.replace(/(\d{1,2}) ?וחצי(?! ?שעות)/g, '$1:30');
    t = t.replace(/(\d{1,2}) ?ורבע(?! ?שעות)/g, '$1:15');
    t = t.replace(/(\d{1,2}) ?פחות רבע/g, function (m, h) { return (Number(h) + 10) % 12 + 1 + ':45'; });
    t = t.replace(/(\d{1,2}) ?פחות (\d{1,2})(?! ?שעות)(?: ?דקות)?/g, function (m, h, mm) {
      return Number(mm) < 60 ? (Number(h) + 10) % 12 + 1 + ':' + pad(60 - Number(mm)) : m;
    });
    t = t.replace(/(^|[^:\d.])(\d{1,2}) ?ו ?-?(\d{1,2})(?! ?שעות)(?: ?דקות)?(?=\s|$)/g, function (m, s, h, mm) {
      return Number(h) <= 24 && Number(mm) >= 5 && Number(mm) < 60 ? s + h + ':' + pad(mm) : m;
    });
    return t.replace(/\s+/g, ' ');
  }

  function ordOrNum(x) {
    const i = ORDINALS.indexOf(x);
    return i >= 0 ? i + 1 : Number(x);
  }

  function extractDate(t, today) {
    const r = extractDateOnly(t, today);
    // An explicit date wins; drop a weekday said alongside it ("ביום חמישי השמיני לעשירי").
    if (r.explicit) {
      r.text = r.text.replace(new RegExp('(?:^|\\s)(?:ב|ו?ב)?יום (' + WEEKDAYS.join('|') + ')(?=\\s|$)'), ' ');
    }
    return r;
  }

  function fromDayMonth(day, month, today) {
    const date = new Date(today.getFullYear(), month - 1, day);
    if (date > today) date.setFullYear(today.getFullYear() - 1);
    return date;
  }

  function extractDateOnly(t, today) {
    let date = today, m;
    const ORD = ORDINALS.join('|');

    // "השמיני לעשירי", "ה 8 לעשירי", "השמיני ל 10", "ה 23 ל 10"
    const dmRe = new RegExp('(?:^|\\s)(ב|ה|בה) ?(' + ORD + '|\\d{1,2}) ?[לב] ?(' + ORD + '|\\d{1,2})(?=$|[\\s,.])');
    if ((m = t.match(dmRe)) && (ORDINALS.includes(m[2]) || ORDINALS.includes(m[3]) || m[1] === 'ה')) {
      const day = ordOrNum(m[2]), month = ordOrNum(m[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: fromDayMonth(day, month, today), text: t.replace(m[0], ' '), explicit: true };
      }
    }

    // Explicit dates: 5/10, 5.10.2026, "5 באוקטובר", "ה 5 לחודש"
    if ((m = t.match(/(?:^|\s)(?:[בה]|בתאריך|תאריך)?\s?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$)(?! ?שעות)/))) {
      let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : today.getFullYear();
      date = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && date > today) date.setFullYear(y - 1);
      return { date: date, text: t.replace(m[0], ' '), explicit: true };
    }
    const monthRe = new RegExp('(?:^|\\s)(?:[בה] ?)?(' + ORD + '|\\d{1,2}) ?[בל](' + MONTHS.join('|') + ')(?=\\s|$)');
    if ((m = t.match(monthRe))) {
      date = fromDayMonth(ordOrNum(m[1]), MONTHS.indexOf(m[2]) + 1, today);
      return { date: date, text: t.replace(m[0], ' '), explicit: true };
    }
    if ((m = t.match(/(?:^|\s)(?:[בה] )?(\d{1,2}) ?(?:לחודש|בחודש)(?=\s|$)/))) {
      date = new Date(today.getFullYear(), today.getMonth(), Number(m[1]));
      if (date > today) date.setMonth(date.getMonth() - 1);
      return { date: date, text: t.replace(m[0], ' '), explicit: true };
    }

    // Relative words
    const rel = [['שלשום', -2], ['אתמול', -1], ['אמש', -1], ['היום', 0]];
    for (const [w, n] of rel) {
      const re = new RegExp('(^|\\s)(?:ו)?' + w + '(?=\\s|$)');
      if (re.test(t)) return { date: addDays(today, n), text: t.replace(re, ' ') };
    }

    // Weekday: "ביום שני" → the most recent such day (today counts)
    const dayRe = new RegExp('(?:^|\\s)(?:ב|ו?ב)?יום (' + WEEKDAYS.join('|') + ')(?: האחרון| שעבר)?(?=\\s|$)');
    if ((m = t.match(dayRe))) {
      const back = (today.getDay() - WEEKDAYS.indexOf(m[1]) + 7) % 7;
      return { date: addDays(today, -back), text: t.replace(m[0], ' ') };
    }
    return { date: date, text: t };
  }

  /** Spoken times are assumed to be working hours: "from 8 to 4" means 08:00–16:00. */
  function toClock(h, m, ampm, isEnd, startMin) {
    h = Number(h); m = Number(m || 0);
    if (ampm === 'pm' && h < 12) h += 12;
    else if (!ampm && !isEnd && h >= 1 && h <= 6) h += 12;     // nobody starts at 3am
    if (isEnd && !ampm && h < 12 && h * 60 + m <= startMin && (h + 12) * 60 + m > startMin) h += 12;
    return h * 60 + m;
  }

  function extractRange(t) {
    const T = '(\\d{1,2})(?::(\\d{2}))?(?:\\s?(' + PM_WORDS + '|' + AM_WORDS + '))?';
    const re = new RegExp(
      '(?:^|\\s)(?:(?:ו)?(?:מ|מה|ב)?\\s?(?:ה?שעה)?|בין(?: השעות)?)\\s?' + T +
      '\\s?(?:עד|ועד|ל|-|–)\\s?(?:ה?שעה\\s?)?' + T + '(?=$|[\\s,.])');
    const m = t.match(re);
    if (!m) return null;
    const ampm = function (w) { return !w ? null : new RegExp(AM_WORDS).test(w) ? 'am' : 'pm'; };
    if (Number(m[1]) > 24 || Number(m[4]) > 24) return null;
    const start = toClock(m[1], m[2], ampm(m[3]), false);
    const end = toClock(m[4], m[5], ampm(m[6]), true, start);
    let minutes = end - start;
    if (minutes <= 0) minutes += 24 * 60;                        // crossed midnight
    return {
      start: fmtTime(Math.floor(start / 60) % 24, start % 60),
      end: fmtTime(Math.floor(end / 60) % 24, end % 60),
      hours: minutes / 60,
      text: t.replace(m[0], ' '),
    };
  }

  function extractBreak(t) {
    const D = '(\\d+(?:\\.\\d+)?) שעות';
    const res = [
      new RegExp('(?:^|\\s)(?:כולל|בלי|עם|מינוס|פחות|ו)?\\s?' + D + ' (?:של )?הפסק[^\\s,.]*(?=$|[\\s,.])'),
      new RegExp('(?:^|\\s)(?:כולל|בלי|עם|מינוס|פחות|ו)?\\s?הפסק[^\\s,.]* (?:של )?' + D + '(?=$|[\\s,.])'),
    ];
    for (const re of res) {
      const m = t.match(re);
      if (m) return { hours: Number(m[1]), text: t.replace(m[0], ' ') };
    }
    return { hours: 0, text: t };
  }

  function extractDuration(t) {
    const m = t.match(/(?:^|\s)(?:במשך|סה"כ|סך הכל|כ)?\s?(\d+(?:\.\d+)?) שעות(?=$|[\s,.])/);
    return m ? { hours: Number(m[1]), text: t.replace(m[0], ' ') } : { hours: 0, text: t };
  }

  function extractProject(t, known) {
    // Known projects first (longest match wins), anywhere in the text.
    const sorted = (known || []).filter(Boolean).slice().sort(function (a, b) { return b.length - a.length; });
    for (const p of sorted) {
      const re = new RegExp('(^|\\s)(?:(?:ו?(?:ל|ב|עבור|אצל|של)\\s?)?(?:ה?לקוח|ה?פרויקט)\\s)?' +
                            PREFIX + escapeRe(p) + WORD_END, 'i');
      const m = t.match(re);
      if (m) return { project: p, text: t.replace(m[0], m[1] + ' ') };
    }
    // Otherwise: "ללקוח X", "בפרויקט X", "עבור X" – up to a comma, or one word.
    const m = t.match(/(^|\s)(?:ו?(?:ל|ב|עבור |אצל |של )?ה?(?:לקוח|לקוחה|פרויקט)|עבור|אצל) ([^,.]+?)(?=[,.]|$)/);
    if (m) {
      let name = m[2].trim();
      const hadComma = /[,.]/.test(t.slice(m.index + m[0].length, m.index + m[0].length + 1));
      if (!hadComma) name = name.split(' ')[0];
      const consumed = m[0].slice(0, m[0].indexOf(m[2])) + name;
      return { project: name, text: t.replace(consumed, m[1] + ' ') };
    }
    return { project: '', text: t };
  }

  function cleanActivity(t) {
    let a = t.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
    let prev;
    do { prev = a; a = a.replace(LEADING_JUNK, '').trim(); } while (a !== prev);
    a = a.replace(/(\s[,.;:])+/g, function (m) { return m.trim(); }).replace(/^[,.\-–;:\s]+|[,\-–;:\s]+$/g, '');
    a = a.replace(/,\s*,/g, ',').replace(/\s+/g, ' ');
    // A preposition left dangling by a removed phrase: "פגישה של [שעה] עם בקי" → "פגישה עם בקי"
    a = a.replace(/(^|\s)(?:של|על|עם|ב|ל)(?=\s(?:ו?(?:של|על|עם|עבור|אצל))(?:\s|$))/g, '$1').replace(/\s+/g, ' ').trim();
    a = a.replace(/(\s(?:ו?(?:עם|של|על|עבור|אצל|ל|ב|כולל)))+$/, '').replace(/[,\s]+$/, '');
    return a;
  }

  function parseWorkLog(transcript, opts) {
    opts = opts || {};
    const today = opts.today ? new Date(opts.today) : new Date();
    today.setHours(12, 0, 0, 0);

    let t = normalize(transcript || '');
    const d = extractDate(t, today); t = d.text;
    const brk = extractBreak(t); t = brk.text;
    const range = extractRange(t); if (range) t = range.text;
    const dur = extractDuration(t); t = dur.text;
    const proj = extractProject(t, opts.projects); t = proj.text;

    let hours = range ? range.hours : dur.hours;
    if (hours && brk.hours) hours -= brk.hours;
    hours = hours > 0 ? round2(hours) : 0;

    const notes = [];
    if (brk.hours) notes.push('הפסקה: ' + round2(brk.hours) + " ש'");
    if (range && dur.hours && Math.abs(dur.hours - range.hours) > 0.01) notes.push('נאמר גם: ' + dur.hours + ' שעות');

    return {
      date: fmtDate(d.date),
      start_time: range ? range.start : '',
      end_time: range ? range.end : '',
      hours: hours,
      project: proj.project,
      activity: cleanActivity(t),
      notes: notes.join('; '),
    };
  }

  /**
   * Join speech-recognition results into one transcript. Chrome on Android sends each
   * result as the whole sentence so far ("פגישה", "פגישה של", "פגישה של שעה", ...);
   * desktop Chrome sends separate pieces. Handle both without repeating words.
   */
  function mergeTranscripts(segments) {
    let acc = '';
    for (const raw of segments) {
      const s = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!s) continue;
      if (!acc || s.startsWith(acc)) acc = s;                  // grew: replace
      else if (acc.startsWith(s) || acc.endsWith(s)) continue;  // older / repeated piece
      else if (s.length >= 8 && acc.slice(0, 8) === s.slice(0, 8)) acc = s; // revised from the start
      else acc += ' ' + s;                                      // a genuinely new piece
    }
    return acc;
  }

  root.parseWorkLog = parseWorkLog;
  root.mergeTranscripts = mergeTranscripts;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseWorkLog: parseWorkLog, normalize: normalize, mergeTranscripts: mergeTranscripts };
  }
})(typeof window !== 'undefined' ? window : globalThis);
