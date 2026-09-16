import Link from 'next/link';
import { createAncestor } from '@/lib/actions';
import DeathDateInput from './DeathDateInput';
import SubmitButton from '@/app/admin/_components/SubmitButton';

export default async function NewAncestorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const boundCreate = createAncestor.bind(null, id);

  return (
    <div className="space-y-6">
      <Link href={`/admin/family-groups/${id}`} className="text-sm text-stone-500 hover:underline">← Back</Link>
      <h1 className="text-xl font-semibold">Add an ancestor</h1>

      <form action={boundCreate} className="card max-w-xl space-y-4">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="tablet_name">Tablet name (神主牌名, optional)</label>
          <input id="tablet_name" name="tablet_name" className="input" />
        </div>

        <div>
          <p className="label">Date of death</p>
          <DeathDateInput />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dod_is_approximate" /> Date is approximate / uncertain
        </label>

        <div>
          <label className="label" htmlFor="leap_month_handling">If the death fell in a leap month, observe the annual rite:</label>
          <select id="leap_month_handling" name="leap_month_handling" className="input" defaultValue="observe_in_following_month">
            <option value="observe_in_following_month">In the following ordinary month (most common)</option>
            <option value="observe_in_leap_month">In the same-numbered ordinary month each year</option>
          </select>
          <p className="mt-1 text-xs text-stone-500">Only matters if the death date above was a leap month — ignored otherwise.</p>
        </div>

        <div>
          <label className="label" htmlFor="observance_offset_days">Observance day offset</label>
          <input id="observance_offset_days" name="observance_offset_days" type="number" defaultValue={0} className="input w-32" />
          <p className="mt-1 text-xs text-stone-500">e.g. -1 for families who observe 忌日 one day before the actual date (忌日提前).</p>
        </div>

        <div>
          <label className="label" htmlFor="resting_place">Resting place</label>
          <input id="resting_place" name="resting_place" placeholder="Grave / columbarium name & address, or 'home altar'" className="input" />
        </div>

        <div>
          <label className="label" htmlFor="niche_number">Niche / plot number</label>
          <input id="niche_number" name="niche_number" placeholder="e.g. Level 3, Block B, Niche 245" className="input" />
        </div>

        <div>
          <label className="label" htmlFor="tablet_location">Tablet location (神主牌, optional)</label>
          <input id="tablet_location" name="tablet_location" placeholder="Only if different from the resting place above, e.g. 'home altar'" className="input" />
        </div>

        <fieldset className="rounded-lg border border-stone-200 p-4">
          <legend className="px-1 text-sm font-medium">Also set up first-year milestones</legend>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="milestone_bai_ri" /> 百日 (100th day)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="milestone_qi_7" /> 頭七 through 尾七/滿七 (weekly through day 49)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="milestone_dui_nian" defaultChecked /> 對年 (first-year memorial)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="milestone_san_nian" /> 三年 / 合爐 (third-year rite)
            </label>
          </div>
          <p className="mt-2 text-xs text-stone-500">These are one-time reminders — they fire once, then stop. The annual 忌日 is always set up automatically and continues indefinitely.</p>
        </fieldset>

        <SubmitButton pendingText="Adding…">Add ancestor</SubmitButton>
      </form>
    </div>
  );
}