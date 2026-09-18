// Given an observance_instance (or facility_renewal) row plus its ancestor,
// compute the next Gregorian occurrence date. This is the single source of
// truth the daily reminder job relies on — the admin app's "preview" only
// mirrors it for display, it never decides scheduling itself.

import {
  formatISO,
  lunarToSolar,
  nextGregorianForLunarDate,
  nextGregorianForSolarTerm,
  solarToLunar,
} from './lunar.ts';

// Minimal shapes — match the DB columns we actually read.
export interface AncestorRow {
  id: string;
  dob_solar: string | null; // ISO date, optional -- powers MING_DAN only
  dod_lunar_month: number;
  dod_lunar_day: number;
  dod_is_leap: boolean;
  dod_solar_reference: string; // ISO date
  leap_month_handling: 'observe_in_leap_month' | 'observe_in_following_month';
  observance_offset_days: number;
  combined_with_sannian: boolean;
}

export interface ObservanceInstanceRow {
  id: string;
  ancestor_id: string | null;
  type_code: string;
  lunar_month: number | null;
  lunar_day: number | null;
  day_offset: number | null;
  completed_at: string | null;
}

export interface FacilityRenewalRow {
  id: string;
  renewal_basis: 'solar' | 'lunar';
  renewal_month: number;
  renewal_day: number;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Effective (non-leap) lunar month to use for an ancestor's annual 忌日, per their leap-month preference. */
function effectiveDeathMonth(ancestor: AncestorRow): number {
  if (!ancestor.dod_is_leap) return ancestor.dod_lunar_month;
  if (ancestor.leap_month_handling === 'observe_in_leap_month') {
    return ancestor.dod_lunar_month;
  }
  // observe_in_following_month
  return (ancestor.dod_lunar_month % 12) + 1;
}

/**
 * Compute the next occurrence for a person-specific (per_ancestor) or
 * family-wide (per_family_group) observance instance, on or after `today`.
 * Returns null for a ONCE-type instance that has already fired.
 */
export function computeNextOccurrence(
  instance: ObservanceInstanceRow,
  ancestor: AncestorRow | null,
  today: Date,
): Date | null {
  if (instance.completed_at) return null;

  switch (instance.type_code) {
    case 'DEATH_ANNIV': {
      if (!ancestor) throw new Error('DEATH_ANNIV requires an ancestor');
      const month = effectiveDeathMonth(ancestor);
      const base = nextGregorianForLunarDate(month, ancestor.dod_lunar_day, false, today);
      return addDays(base, ancestor.observance_offset_days);
    }

    case 'DUI_NIAN': {
      // ~1 lunar year after death. 對年不對日: never delay past the death
      // day within that month — lunarToSolar's day-count fallback already
      // only ever trims backward, so this is safe by construction.
      if (!ancestor) throw new Error('DUI_NIAN requires an ancestor');
      const deathYear = new Date(ancestor.dod_solar_reference).getFullYear();
      // Approximate the lunar year of death by converting the reference date;
      // callers should have stored dod_lunar_month/day consistent with it.
      const targetLunarYear = lunarYearOf(ancestor.dod_solar_reference) + 1;
      const month = effectiveDeathMonth(ancestor);
      return lunarToSolar(targetLunarYear, month, ancestor.dod_lunar_day, false);
    }

    case 'SAN_NIAN': {
      if (!ancestor) throw new Error('SAN_NIAN requires an ancestor');
      const targetLunarYear = lunarYearOf(ancestor.dod_solar_reference) + 2;
      const month = effectiveDeathMonth(ancestor);
      return lunarToSolar(targetLunarYear, month, ancestor.dod_lunar_day, false);
    }

    case 'QI_7':
    case 'BAI_RI': {
      if (!ancestor) throw new Error(`${instance.type_code} requires an ancestor`);
      if (instance.day_offset == null) {
        throw new Error(`${instance.type_code} instance is missing day_offset`);
      }
      return addDays(new Date(ancestor.dod_solar_reference), instance.day_offset);
    }

    case 'ZHONGYUAN':
      return nextGregorianForLunarDate(7, 15, false, today);

    case 'CNY_DAY':
      return nextGregorianForLunarDate(1, 1, false, today);

    case 'CNY_EVE': {
      // Always the day immediately before CNY Day, regardless of whether
      // that lunar month has 29 or 30 days.
      const cnyDay = nextGregorianForLunarDate(1, 1, false, today);
      return addDays(cnyDay, -1);
    }

    case 'FIRST_15TH': {
      if (!instance.lunar_day) {
        throw new Error('FIRST_15TH instance is missing lunar_day (should be 1 or 15)');
      }
      return nextGregorianForLunarDate(
        instance.lunar_month ?? nextLunarMonthGuess(today),
        instance.lunar_day,
        false,
        today,
      );
    }

    case 'QINGMING':
      return nextGregorianForSolarTerm('清明', today);

    case 'WINTER_SOLSTICE':
      return nextGregorianForSolarTerm('冬至', today);

    case 'MING_DAN': {
      // Birthday remembrance -- deliberately Gregorian, not lunar (unlike
      // every other yearly type here): recurs on the ancestor's fixed
      // birth month/day each year, same as an ordinary birthday would.
      if (!ancestor || !ancestor.dob_solar) {
        throw new Error('MING_DAN requires an ancestor with a recorded dob_solar');
      }
      const dob = new Date(ancestor.dob_solar);
      let year = today.getFullYear();
      for (let i = 0; i < 2; i++) {
        const candidate = new Date(year, dob.getMonth(), dob.getDate());
        if (candidate >= stripTime(today)) return candidate;
        year += 1;
      }
      return new Date(year, dob.getMonth(), dob.getDate());
    }

    default:
      throw new Error(`Unhandled observance type_code: ${instance.type_code}`);
  }
}

export function computeNextRenewal(renewal: FacilityRenewalRow, today: Date): Date {
  if (renewal.renewal_basis === 'lunar') {
    return nextGregorianForLunarDate(renewal.renewal_month, renewal.renewal_day, false, today);
  }
  // Solar: next occurrence of this month/day on or after today.
  let year = today.getFullYear();
  for (let i = 0; i < 2; i++) {
    const candidate = new Date(year, renewal.renewal_month - 1, renewal.renewal_day);
    if (candidate >= stripTime(today)) return candidate;
    year += 1;
  }
  return new Date(year, renewal.renewal_month - 1, renewal.renewal_day);
}

// --- small helpers -----------------------------------------------------

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Lunar calendar year corresponding to a Gregorian reference date (for anchoring DUI_NIAN/SAN_NIAN math). */
function lunarYearOf(isoDate: string): number {
  return solarToLunar(new Date(isoDate)).year;
}

/** Fallback lunar month for a FIRST_15TH instance that wasn't given an explicit lunar_month. */
function nextLunarMonthGuess(today: Date): number {
  return solarToLunar(today).month;
}

export { formatISO };