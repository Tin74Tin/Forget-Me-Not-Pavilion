import { createClient } from '@/lib/supabase/server';
import {
  getCurrentAdmin,
  reviewEntity,
  applyRitualTemplateRevision,
  rejectRitualTemplateRevision,
  type ApprovableTable,
} from '@/lib/actions';

export const dynamic = 'force-dynamic';

const TABLE_LABELS: Record<ApprovableTable, { title: string; describe: (row: Record<string, unknown>) => string }> = {
  family_groups: { title: 'Family group', describe: (r) => `"${r.name}"` },
  ancestors: { title: 'Ancestor', describe: (r) => `"${r.name}"` },
  family_group_members: { title: 'Family member', describe: (r) => `relationship "${r.relationship}"` },
  observance_instances: { title: 'Observance instance', describe: (r) => `type ${r.type_code}` },
  facility_renewals: { title: 'Facility renewal', describe: (r) => `"${r.facility_name}"` },
};

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  const isSuperAdmin = admin?.role === 'super_admin';

  const tables = Object.keys(TABLE_LABELS) as ApprovableTable[];
  const results = await Promise.all(
    tables.map((t) => supabase.from(t).select('*').eq('status', 'pending').order('created_at', { ascending: true })),
  );
  const { data: revisions } = await supabase
    .from('ritual_template_revisions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const pendingCount = results.reduce((n, r) => n + (r.data?.length ?? 0), 0) + (revisions?.length ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Approvals</h1>
        <p className="text-sm text-stone-500">
          {isSuperAdmin
            ? 'New entries from data-entry admins land here first — nothing reaches the reminder engine until you approve it.'
            : "Entries you add land here as pending until a super admin approves them — they won't trigger reminders until then."}
        </p>
      </div>

      {pendingCount === 0 ? (
        <div className="card">
          <p className="text-sm text-stone-500">Nothing pending — everything is approved.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tables.map((t, i) => {
            const rows = results[i].data ?? [];
            if (rows.length === 0) return null;
            const { title, describe } = TABLE_LABELS[t];
            return (
              <div key={t} className="card">
                <h2 className="mb-3 font-medium">{title} ({rows.length})</h2>
                <ul className="divide-y divide-stone-100">
                  {rows.map((row) => (
                    <li key={row.id as string} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{describe(row)}</p>
                        <p className="text-xs text-stone-500">
                          submitted {new Date(row.created_at as string).toLocaleDateString('en-SG')}
                        </p>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex gap-2">
                          <form action={async () => { 'use server'; await reviewEntity(t, row.id as string, 'approved'); }}>
                            <button type="submit" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                              Approve
                            </button>
                          </form>
                          <form action={async () => { 'use server'; await reviewEntity(t, row.id as string, 'rejected'); }}>
                            <button type="submit" className="rounded-md bg-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-300">
                              Reject
                            </button>
                          </form>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {(revisions?.length ?? 0) > 0 && (
            <div className="card">
              <h2 className="mb-3 font-medium">Proposed ritual template edits ({revisions!.length})</h2>
              <ul className="divide-y divide-stone-100">
                {revisions!.map((rev) => (
                  <li key={rev.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{rev.type_code}</p>
                        {rev.notes && <p className="mt-1 text-xs text-stone-600">Notes: {rev.notes}</p>}
                        {rev.invocation_template && <p className="mt-1 text-xs text-stone-600">Invocation: {rev.invocation_template}</p>}
                        {rev.taboos && <p className="mt-1 text-xs text-stone-600">Taboos: {rev.taboos}</p>}
                        <p className="mt-1 text-xs text-stone-500">
                          submitted {new Date(rev.created_at as string).toLocaleDateString('en-SG')}
                        </p>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex shrink-0 gap-2">
                          <form action={async () => { 'use server'; await applyRitualTemplateRevision(rev.id as string); }}>
                            <button type="submit" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                              Apply
                            </button>
                          </form>
                          <form action={async () => { 'use server'; await rejectRitualTemplateRevision(rev.id as string); }}>
                            <button type="submit" className="rounded-md bg-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-300">
                              Reject
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
