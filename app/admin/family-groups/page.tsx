import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createFamilyGroup } from '@/lib/actions';
import SubmitButton from '@/app/admin/_components/SubmitButton';

export const dynamic = 'force-dynamic';

export default async function FamilyGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = q?.trim() ?? '';
  const supabase = await createClient();

  let groupsQuery = supabase
    .from('family_groups')
    .select('*, ancestors(count), family_group_members(count)')
    .order('created_at', { ascending: false });

  if (term) {
    // Match either the family group's own name, or the name of any ancestor
    // inside it -- e.g. searching "Tin Kim Ping" finds the family group that
    // ancestor belongs to, not just family groups literally named that.
    const { data: matchedAncestors } = await supabase
      .from('ancestors')
      .select('family_group_id')
      .ilike('name', `%${term}%`);
    const matchedGroupIds = Array.from(new Set((matchedAncestors ?? []).map((a) => a.family_group_id)));

    const orParts = [`name.ilike.%${term}%`];
    if (matchedGroupIds.length > 0) {
      orParts.push(`id.in.(${matchedGroupIds.join(',')})`);
    }
    groupsQuery = groupsQuery.or(orParts.join(','));
  }

  const { data: groups } = await groupsQuery;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Family Groups</h1>

      <form method="get" className="flex max-w-md gap-2">
        <input
          type="text"
          name="q"
          defaultValue={term}
          placeholder="Search by family or ancestor name"
          className="input flex-1"
        />
        <button type="submit" className="btn-secondary">Search</button>
        {term && (
          <Link href="/admin/family-groups" className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <div className="card">
        {!groups || groups.length === 0 ? (
          <p className="text-sm text-stone-500">
            {term ? `No family or ancestor matches "${term}".` : 'No family groups yet — add the first one below.'}
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-3">
                <div>
                  <Link href={`/admin/family-groups/${g.id}`} className="font-medium text-brand-700 hover:underline">
                    {g.name}
                  </Link>
                  {g.status !== 'approved' && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">pending</span>
                  )}
                  <p className="text-xs text-stone-500 capitalize">{g.dialect} · default send {g.default_send_time_local}</p>
                </div>
                <div className="text-xs text-stone-500">
                  {(g.ancestors as unknown as { count: number }[])?.[0]?.count ?? 0} ancestors ·{' '}
                  {(g.family_group_members as unknown as { count: number }[])?.[0]?.count ?? 0} members
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card max-w-md">
        <h2 className="mb-3 font-medium">Add a family group</h2>
        <form action={createFamilyGroup} className="space-y-3">
          <div>
            <label className="label" htmlFor="name">Client name</label>
            <input id="name" name="name" required className="input" placeholder='e.g. "Tan family — paternal side"' />
          </div>
          <div>
            <label className="label" htmlFor="dialect">Dialect / terminology</label>
            <select id="dialect" name="dialect" className="input" defaultValue="mandarin">
              <option value="mandarin">Mandarin</option>
              <option value="hokkien">Hokkien</option>
              <option value="teochew">Teochew</option>
              <option value="cantonese">Cantonese</option>
              <option value="hakka">Hakka</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="default_send_time_local">Default send time (D-day)</label>
            <input id="default_send_time_local" name="default_send_time_local" type="time" className="input" defaultValue="08:00" />
          </div>
          <SubmitButton pendingText="Creating…">Create family group</SubmitButton>
        </form>
      </div>
    </div>
  );
}