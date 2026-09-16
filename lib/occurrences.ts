// Node-side port of supabase/functions/_shared/occurrences.ts, used by the
// admin dashboard to preview upcoming dates. The Edge Function's copy is
// authoritative for actual scheduling — keep the two in sync if this logic
// changes.

import { lunarToSolar, nextGregorianForLunarDate, solarToLunar, solarTermDate } from '@/lib/lunar';
import type { Ancestor, ObservanceInstance } from '@/lib/types';

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function effectiveDeathMonth(ancestor: Ancestor): number {
  if (!ancestor.dod_is_leap) return ancestor.dod_lunar_month;
  if (ancestor.leap_month_handling === 'observe_in_leap_month') return ancestor.dod_lunar_month;
  return (ancestor.dod_lunar_month % 12) + 1;
}

function nextSolarTerm(term: '清明' | '冬至', after: Date): Date {
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

export function computeNextOccurrence(
  instance: ObservanceInstance,
  ancestor: Ancestor | null,
  today: Date,
): Date | null {
  if (instance.completed_at) return null;

  switch (instance.type_code) {
    case 'DEATH_ANNIV': {
      if (!ancestor) return null;
      const month = effectiveDeathMonth(ancestor);
      const base = nextGregorianForLunarDate(month, ancestor.dod_lunar_day, false, today);
      return addDays(base, ancestor.observance_offset_days);
    }
    case 'DUI_NIAN': {
      if (!ancestor) return null;
      const targetLunarYear = solarToLunar(new Date(ancestor.dod_solar_reference)).year + 1;
      const month = effectiveDeathMonth(ancestor);
      return lunarToSolar(targetLunarYear, month, ancestor.dod_lunar_day, false);
    }
    case 'SAN_NIAN': {
      if (!ancestor) return null;
      const targetLunarYear = solarToLunar(new Date(ancestor.dod_solar_reference)).year + 2;
      const month = effectiveDeathMonth(ancestor);
      return lunarToSolar(targetLunarYear, month, ancestor.dod_lunar_day, false);
    }
    case 'QI_7':
    case 'BAI_RI': {
      if (!ancestor || instance.day_offset == null) return null;
      return addDays(new Date(ancestor.dod_solar_reference), instance.day_offset);
    }
    case 'ZHONGYUAN':
      return nextGregorianForLunarDate(7, 15, false, today);
    case 'CNY_DAY':
      return nextGregorianForLunarDate(1, 1, false, today);
    case 'CNY_EVE':
      return addDays(nextGregorianForLunarDate(1, 1, false, today), -1);
    case 'FIRST_15TH':
      if (!instance.lunar_day) return null;
      return nextGregorianForLunarDate(instance.lunar_month ?? solarToLunar(today).month, instance.lunar_day, false, today);
    case 'QINGMING':
      return nextSolarTerm('清明', today);
    case 'WINTER_SOLSTICE':
      return nextSolarTerm('冬至', today);
    default:
      return null;
  }
}
