import { DateTime } from 'luxon';

export const TZ = 'Asia/Jerusalem';

export function parseDateChoice(choice, ddmmyy, now = DateTime.now().setZone(TZ)) {
  if (choice === '1') return now.startOf('day');
  if (choice === '2') return now.plus({ days: 1 }).startOf('day');
  if (choice === '3') {
    if (!/^\d{6}$/.test(ddmmyy || '')) throw new Error('תאריך לא תקין');
    const dd = parseInt(ddmmyy.slice(0,2), 10);
    const mm = parseInt(ddmmyy.slice(2,4), 10);
    const yy = 2000 + parseInt(ddmmyy.slice(4,6), 10);
    const dt = DateTime.fromObject({ day: dd, month: mm, year: yy }, { zone: TZ });
    if (!dt.isValid) throw new Error('תאריך לא תקין');
    return dt.startOf('day');
  }
  throw new Error('בחירה לא תקינה');
}

export function combineDateAndHHMM(dateDay, hhmm) {
  if (!/^\d{4}$/.test(hhmm || '')) throw new Error('שעה לא תקינה');
  const hh = parseInt(hhmm.slice(0,2), 10);
  const mm = parseInt(hhmm.slice(2,4), 10);
  const dt = dateDay.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
  if (!dt.isValid) throw new Error('שעה לא תקינה');
  return dt.toUTC();
}
