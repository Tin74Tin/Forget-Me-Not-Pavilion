import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAdmin, updateAncestor } from '@/lib/actions';
import DeathDateInput from '../../new/DeathDateInput';
import SubmitButton from '@/app/admin/_components/SubmitButton';

export const dynamic = 'force-dynamic';

export default async function EditAncestorPage({
  params,
}: {
  params: Promise<{ id: string; ancestorId: string }>;
}) {
  const { id, ancestorId } = await params;

  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') redirect(`/admin/family-groups/${id}`);

  const supabase = await createClient();
  const { data: ancestor } = await supabase.from('ancestors').select('*').eq('id', ancestorId).single();
  if (!ancestor) notFound();

  const boundUpdate = updateAncestor.bind(null, ancestorId, id);

  return (
    <div className="space-y-6">
      <Link href={`/admin/family-groups/${id}`} className="text-sm text-stone-500 hover:underline">← Back</Link>
      <h1 className="text-xl font-semibold">Edit {ancestor.name}</h1>

      <form action={boundUpdate} className="card max-w-xl space-y-4">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required defaultValue={ancestor.name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="tablet_name">Tablet name (神主牌名, optional)</label>
          <input id="tablet_name" name="tablet_name" defaultValue={ancestor.tablet_name ?? ''} className="input" />
        </div>

        <div>
          <label className="label" htmlFor="dob_solar">Date of birth (optional)</label>
          <input id="dob_solar" name="dob_solar" type="date" defaultValue={ancestor.dob_solar ?? ''} className="input" />
          <p className="mt-1 text-xs text-stone-500">
            If given, sets up an optional yearly 冥誕 (birthday remembrance) reminder on this Gregorian date — unlike
            the date of death below, this one is not converted to the lunar calendar. Clearing this field removes
            that reminder.
          </p>
        </div>

        <div>
          <p className="label">Date of death</p>
          <DeathDateInput initialSolarISO={ancestor.dod_solar_reference ?? ''} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dod_is_approximate" defaultChecked={ancestor.dod_is_approximate} /> Date is approximate / uncertain
        </label>

        <div>
          <label className="label" htmlFor="leap_month_handling">If the death fell in a leap month, observe the annual rite:</label>
          <select
            id="leap_month_handling"
            name="leap_month_handling"
            className="input"
            defaultValue={ancestor.leap_month_handling ?? 'observe_in_following_month'}
          >
            <option value="observe_in_following_month">In the following ordinary month (most common)</option>
            <option value="observe_in_leap_month">In the same-numbered ordinary month each year</option>
          </select>
          <p className="mt-1 text-xs text-stone-500">Only matters if the death date above was a leap month — ignored otherwise.</p>
        </div>

        <div>
          <label className="label" htmlFor="observance_offset_days">Observance day offset</label>
          <input
            id="observance_offset_days"
            name="observance_offset_days"
            type="number"
            defaultValue={ancestor.observance_offset_days ?? 0}
            className="input w-32"
          />
          <p className="mt-1 text-xs text-stone-500">e.g. -1 for families who observe 忌日 one day before the actual date (忌日提前).</p>
        </div>

        <div>
          <label className="label" htmlFor="resting_place">Resting place</label>
          <input
            id="resting_place"
            name="resting_place"
            defaultValue={ancestor.resting_place ?? ''}
            placeholder="Grave / columbarium name & address, or 'home altar'"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="niche_number">Niche / plot number</label>
          <input
            id="niche_number"
            name="niche_number"
            defaultValue={ancestor.niche_number ?? ''}
            placeholder="e.g. Level 3, Block B, Niche 245"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="tablet_location">Tablet location (神主牌, optional)</label>
          <input
            id="tablet_location"
            name="tablet_location"
            defaultValue={ancestor.tablet_location ?? ''}
            placeholder="Only if different from the resting place above, e.g. 'home altar'"
            className="input"
          />
        </div>

        <p className="text-xs text-stone-500">
          First-year milestones (百日, 頭七.../對年/三年) aren't re-set-up from here — this only corrects the
          ancestor's own details and keeps the annual 忌日 reminder in sync with the date above.
        </p>

        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </form>
    </div>
  );
}