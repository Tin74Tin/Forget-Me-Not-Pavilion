// Node-side port of supabase/functions/_shared/lunar.ts, for the admin app's
// "preview the computed date" UX only. The Edge Function's copy is the
// authoritative one actually used for scheduling — keep the two in sync if
// you change the conversion logic. (Verified against known reference dates
// before writing — see project notes.)

// @ts-ignore -- lunar-javascript ships without its own type declarations
import { Lunar, LunarYear, LunarMonth, Solar } from 'lunar-javascript';

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
}

export function leapMonthOf(year: number): number {
  return LunarYear.fromYear(year).getLeapMonth();
}

export function lunarMonthDayCount(year: number, month: number): number | null {
  const lm = LunarMonth.fromYm(year, month);
  return lm ? lm.getDayCount() : null;
}

export function solarToLunar(solarDate: Date): LunarDate {
  const s = Solar.fromYmd(solarDate.getFullYear(), solarDate.getMonth() + 1, solarDate.getDate());
  const l = s.getLunar();
  const rawMonth = l.getMonth();
  return { year: l.getYear(), month: Math.abs(rawMonth), day: l.getDay(), isLeap: rawMonth < 0 };
}

export function lunarToSolar(year: number, month: number, day: number, isLeap: boolean): Date {
  let effectiveMonth = month;
  if (isLeap) {
    const leap = leapMonthOf(year);
    if (leap === month) effectiveMonth = -month;
  }
  const dayCount = lunarMonthDayCount(year, Math.abs(effectiveMonth));
  const effectiveDay = dayCount && day > dayCount ? dayCount : day;
  const l = Lunar.fromYmd(year, effectiveMonth, effectiveDay);
  const s = l.getSolar();
  return new Date(s.getYear(), s.getMonth() - 1, s.getDay());
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function nextGregorianForLunarDate(month: number, day: number, isLeap: boolean, after: Date): Date {
  let year = solarToLunar(after).year;
  for (let i = 0; i < 3; i++) {
    const candidate = lunarToSolar(year, month, day, isLeap);
    if (candidate >= stripTime(after)) return candidate;
    year += 1;
  }
  return lunarToSolar(year, month, day, isLeap);
}

export function solarTermDate(term: '清明' | '冬至', year: number): Date {
  const anchor = term === '清明' ? new Date(year, 6, 1) : new Date(year + 1, 0, 1);
  const table = Lunar.fromDate(anchor).getJieQiTable();
  const solar = table[term];
  if (!solar) throw new Error(`Could not find ${term} for ${year}`);
  return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
}

export function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
