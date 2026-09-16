// Lunar <-> solar (Gregorian) conversion helpers, built on lunar-javascript.
//
// API behaviour used here was verified directly against known reference
// dates before writing this (see project notes) — in particular:
//   - Lunar.fromYmd(year, month, day): a NEGATIVE month means "the leap
//     month with this number" (e.g. month -2 = 闰二月). Only pass a negative
//     month when that year actually has a leap month with that number —
//     check via LunarYear.fromYear(year).getLeapMonth() first, or it throws.
//   - Constructing a day that doesn't exist in that lunar month (e.g. day 30
//     in a 29-day month) throws — callers must catch and fall back.
//   - getJieQiTable()'s Chinese-keyed entry for a solar term always refers
//     to the most recent occurrence at-or-before the query date, so the
//     anchor date matters:
//       * Qingming (清明, ~Apr): query from July 1 of the target year.
//       * Winter Solstice (冬至, ~Dec): query from Jan 1 of target year + 1.

// deno-lint-ignore no-explicit-any
import { Lunar, LunarYear, LunarMonth, Solar } from 'npm:lunar-javascript@1.7.4';

export interface LunarDate {
  year: number;
  month: number; // 1-12, always positive here (isLeap carried separately)
  day: number;
  isLeap: boolean;
}

/** Does `year` have a leap month, and if so which one? Returns 0 if none. */
export function leapMonthOf(year: number): number {
  return LunarYear.fromYear(year).getLeapMonth();
}

/** How many days are in lunar (year, month)? Returns null if the month/year is invalid. */
export function lunarMonthDayCount(year: number, month: number): number | null {
  const lm = LunarMonth.fromYm(year, month);
  return lm ? lm.getDayCount() : null;
}

/** Convert a Gregorian date to its lunar equivalent. */
export function solarToLunar(solarDate: Date): LunarDate {
  const s = Solar.fromYmd(
    solarDate.getFullYear(),
    solarDate.getMonth() + 1,
    solarDate.getDate(),
  );
  const l = s.getLunar();
  const rawMonth = l.getMonth();
  return {
    year: l.getYear(),
    month: Math.abs(rawMonth),
    day: l.getDay(),
    isLeap: rawMonth < 0,
  };
}

/**
 * Find the Gregorian date for a given lunar (year, month, day), where
 * `isLeap` requests the leap-month variant of that month if the year has one.
 *
 * Handles two real-world edge cases:
 *  - Requested leap month doesn't exist that year -> falls back to the
 *    ordinary (non-leap) month of the same number.
 *  - Requested day doesn't exist in that month (29 vs 30 days) -> falls back
 *    to the last valid day of that month.
 */
export function lunarToSolar(
  year: number,
  month: number,
  day: number,
  isLeap: boolean,
): Date {
  let effectiveMonth = month;
  if (isLeap) {
    const leap = leapMonthOf(year);
    if (leap === month) {
      effectiveMonth = -month;
    }
    // else: requested leap month doesn't exist this year -> fall back to
    // the ordinary month (effectiveMonth stays positive `month`).
  }

  const dayCount = lunarMonthDayCount(year, Math.abs(effectiveMonth));
  const effectiveDay = dayCount && day > dayCount ? dayCount : day;

  const l = Lunar.fromYmd(year, effectiveMonth, effectiveDay);
  const s = l.getSolar();
  return new Date(s.getYear(), s.getMonth() - 1, s.getDay());
}

/**
 * Given a recurring lunar (month, day) and an "after" date, find the next
 * Gregorian occurrence on or after `after`. Tries the lunar year matching
 * `after`'s year first, then rolls forward until found (handles the case
 * where this year's date has already passed).
 */
export function nextGregorianForLunarDate(
  month: number,
  day: number,
  isLeap: boolean,
  after: Date,
): Date {
  let year = solarToLunar(after).year;
  for (let i = 0; i < 3; i++) {
    const candidate = lunarToSolar(year, month, day, isLeap);
    if (candidate >= stripTime(after)) {
      return candidate;
    }
    year += 1;
  }
  // Should be unreachable, but never return nothing.
  return lunarToSolar(year, month, day, isLeap);
}

/**
 * Solar-term lookup for Qingming and Winter Solstice, which are fixed to
 * the solar calendar rather than the lunar one. `year` is the Gregorian
 * calendar year the occurrence should fall in.
 */
export function solarTermDate(
  term: '清明' | '冬至',
  year: number,
): Date {
  const anchor = term === '清明'
    ? new Date(year, 6, 1) // July 1 of the same year
    : new Date(year + 1, 0, 1); // Jan 1 of the following year
  const table = Lunar.fromDate(anchor).getJieQiTable();
  const solar = table[term];
  if (!solar) throw new Error(`Could not find ${term} for ${year}`);
  return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
}

/** Next occurrence of a fixed solar term on or after `after`. */
export function nextGregorianForSolarTerm(
  term: '清明' | '冬至',
  after: Date,
): Date {
  let year = after.getFullYear();
  for (let i = 0; i < 3; i++) {
    const candidate = solarTermDate(term, year);
    if (candidate >= stripTime(after)) return candidate;
    year += 1;
  }
  return solarTermDate(term, year);
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
