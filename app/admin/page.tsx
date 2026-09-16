import { createClient } from '@/lib/supabase/server';
import { computeNextOccurrence } from '@/lib/occurrences';
import type { Ancestor, ObservanceInstance } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date();

  const { data: instances } = await supabase
    .from('observance_instances')
    .select('*, ancestors(*), family_groups(name, status), observance_types(default_label)')
    .is('completed_at', null);

  const { data: renewals } = await supabase
    .from('facility_renewals')
    .select('*, ancestors(name, status, family_groups(name, status))');

  // Pending status doesn't hide a row here — this dashboard is a working
  // preview for both admin tiers, so a data_entry admin should be able to
  // see what they just entered. It's just clearly flagged, since only
  // status='approved' rows are ever actually picked up by the daily
  // WhatsApp job (see supabase/functions/daily-reminders).
  type Row = { date: Date; label: string; sub: string; pending: boolean };
  const rows: Row[] = [];

  const effectiveStatus = (...statuses: (string | undefined)[]) =>
    statuses.some((s) => s && s !== 'approved') ? 'pending' : 'approved';

  for (const row of instances ?? []) {
    const ancestor = (row.ancestors as unknown as Ancestor | null) ?? null;
    const next = computeNextOccurrence(row as unknown as ObservanceInstance, ancestor, today);
    if (!next) continue;
    const label = (row.observance_types as { default_label?: string } | null)?.default_label ?? row.type_code;
    const familyGroup = row.family_groups as { name?: string; status?: string } | null;
    const groupName = familyGroup?.name ?? '';
    const who = ancestor?.name ?? groupName;
    const pending =
      effectiveStatus(
        (row as { status?: string }).status,
        familyGroup?.status,
        ancestor ? (ancestor as unknown as { status?: string }).status : undefined,
      ) === 'pending';
    rows.push({ date: next, label, sub: `${who}${ancestor ? ` · ${groupName}` : ''}`, pending });
  }

  for (const row of renewals ?? []) {
    const ancestorInfo = row.ancestors as unknown as { name: string; status?: string; family_groups?: { name?: string; status?: string } } | null;
    if (!row.renewal_month || !row.renewal_day) continue;
    // Lightweight preview only — the edge function computes this authoritatively.
    const candidate = new Date(today.getFullYear(), row.renewal_month - 1, row.renewal_day);
    const next = candidate >= today ? candidate : new Date(today.getFullYear() + 1, row.renewal_month - 1, row.renewal_day);
    const pending =
      effectiveStatus((row as { status?: string }).status, ancestorInfo?.status, ancestorInfo?.family_groups?.status) === 'pending';
    rows.push({
      date: next,
      label: `Renewal: ${row.facility_name}`,
      sub: `${ancestorInfo?.name ?? ''}${ancestorInfo?.family_groups?.name ? ` · ${ancestorInfo.family_groups.name}` : ''}`,
      pending,
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const upcoming = rows.slice(0, 30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Upcoming</h1>
        <p className="text-sm text-stone-500">
          Live preview computed from the lunar/solar rules — the daily job (once deployed) sends WhatsApp reminders on the D-30/14/7/3/1/0 schedule for each of these.
        </p>
      </div>

      <div className="card">
        {upcoming.length === 0 ? (
          <p className="text-sm text-stone-500">No families set up yet. Start under Family Groups.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Occasion</th>
                <th className="py-2 pr-4">For</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((r, i) => (
                <tr key={i} className="border-b border-stone-100 last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap font-medium">
                    {r.date.toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="py-2 pr-4">{r.label}</td>
                  <td className="py-2 pr-4 text-stone-600">{r.sub}</td>
                  <td className="py-2">
                    {r.pending ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        pending approval
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        approved
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
