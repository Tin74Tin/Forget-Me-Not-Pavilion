'use client';

import { useMemo, useState } from 'react';
import { lunarToSolar, solarToLunar, formatISO } from '@/lib/lunar';

// Lets the admin enter the date of death either way — most people know the
// Gregorian date (from a certificate), some (especially for older
// ancestors) only know the lunar date. Whichever is entered, the other is
// computed live, demonstrating the lunar<->solar conversion the whole app
// is built around.
export default function DeathDateInput({ initialSolarISO }: { initialSolarISO?: string } = {}) {
  const [mode, setMode] = useState<'solar' | 'lunar'>('solar');
  const [solarDate, setSolarDate] = useState(initialSolarISO ?? '');
  const [lunarYear, setLunarYear] = useState('');
  const [lunarMonth, setLunarMonth] = useState('');
  const [lunarDay, setLunarDay] = useState('');
  const [isLeap, setIsLeap] = useState(false);

  const computed = useMemo(() => {
    try {
      if (mode === 'solar') {
        if (!solarDate) return null;
        const d = new Date(solarDate);
        const l = solarToLunar(d);
        return { lunar: l, solarISO: solarDate };
      } else {
        const y = Number(lunarYear);
        const m = Number(lunarMonth);
        const d = Number(lunarDay);
        if (!y || !m || !d) return null;
        const solar = lunarToSolar(y, m, d, isLeap);
        return { lunar: { year: y, month: m, day: d, isLeap }, solarISO: formatISO(solar) };
      }
    } catch {
      return null;
    }
  }, [mode, solarDate, lunarYear, lunarMonth, lunarDay, isLeap]);

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 p-4">
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === 'solar'} onChange={() => setMode('solar')} /> I know the Gregorian date
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === 'lunar'} onChange={() => setMode('lunar')} /> I know the lunar date
        </label>
      </div>

      {mode === 'solar' ? (
        <div>
          <label className="label" htmlFor="solar_input">Date of death (Gregorian)</label>
          <input
            id="solar_input"
            type="date"
            className="input"
            value={solarDate}
            onChange={(e) => setSolarDate(e.target.value)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label" htmlFor="lunar_year">Lunar year</label>
            <input id="lunar_year" type="number" className="input" value={lunarYear} onChange={(e) => setLunarYear(e.target.value)} placeholder="e.g. 2023" />
          </div>
          <div>
            <label className="label" htmlFor="lunar_month">Lunar month</label>
            <input id="lunar_month" type="number" min={1} max={12} className="input" value={lunarMonth} onChange={(e) => setLunarMonth(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="lunar_day">Lunar day</label>
            <input id="lunar_day" type="number" min={1} max={30} className="input" value={lunarDay} onChange={(e) => setLunarDay(e.target.value)} />
          </div>
          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isLeap} onChange={(e) => setIsLeap(e.target.checked)} /> This was a leap month (闰月)
          </label>
        </div>
      )}

      {computed && (
        <p className="text-sm text-stone-600">
          ≈ Lunar {computed.lunar.month}/{computed.lunar.day}{('isLeap' in computed.lunar && computed.lunar.isLeap) ? ' (leap)' : ''} · Gregorian {computed.solarISO}
        </p>
      )}

      {/* Hidden fields the surrounding <form action={createAncestor}> actually submits. */}
      <input type="hidden" name="dod_lunar_month" value={computed?.lunar.month ?? ''} />
      <input type="hidden" name="dod_lunar_day" value={computed?.lunar.day ?? ''} />
      <input type="hidden" name="dod_solar_reference" value={computed?.solarISO ?? ''} />
      <input type="hidden" name="dod_is_leap" value={computed?.lunar.isLeap ? 'on' : ''} />
    </div>
  );
}