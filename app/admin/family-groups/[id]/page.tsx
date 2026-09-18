import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  addFacilityRenewal,
  addFamilyMember,
  getCurrentAdmin,
  setupFamilyWideObservances,
  updateFacilityRenewal,
  updateFamilyGroup,
  updateFamilyMember,
} from '@/lib/actions';
import SubmitButton from '@/app/admin/_components/SubmitButton';

export const dynamic = 'force-dynamic';

export default async function FamilyGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const admin = await getCurrentAdmin();
  const isSuperAdmin = admin?.role === 'super_admin';

  const { data: group } = await supabase.from('family_groups').select('*').eq('id', id).single();
  if (!group) notFound();

  const { data: members } = await supabase
    .from('family_group_members')
    .select('*, people(*)')
    .eq('family_group_id', id);

  const { data: ancestors } = await supabase
    .from('ancestors')
    .select('*, facility_renewals(*)')
    .eq('family_group_id', id)
    .order('created_at');

  const { data: familyWideInstances } = await supabase
    .from('observance_instances')
    .select('type_code, observance_types(default_label)')
    .eq('family_group_id', id)
    .is('ancestor_id', null);

  const boundSetup = setupFamilyWideObservances.bind(null, id);
  const boundAddMember = addFamilyMember.bind(null, id);
  const boundUpdateGroup = updateFamilyGroup.bind(null, id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/family-groups" className="text-sm text-stone-500 hover:underline">← Family Groups</Link>
          <h1 className="text-xl font-semibold">
            {group.name}
            {group.status !== 'approved' && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-700">
                pending approval
              </span>
            )}
          </h1>
          <p className="text-sm text-stone-500 capitalize">{group.dialect} · default send {group.default_send_time_local}</p>
          {isSuperAdmin && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-brand-700">Edit family group</summary>
              <form action={boundUpdateGroup} className="mt-2 max-w-sm space-y-2">
                <div>
                  <label className="label" htmlFor="fg_name">Client name</label>
                  <input id="fg_name" name="name" required defaultValue={group.name} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="fg_dialect">Dialect</label>
                  <select id="fg_dialect" name="dialect" className="input" defaultValue={group.dialect}>
                    <option value="mandarin">Mandarin</option>
                    <option value="hokkien">Hokkien</option>
                    <option value="teochew">Teochew</option>
                    <option value="cantonese">Cantonese</option>
                    <option value="hakka">Hakka</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="fg_send_time">Default send time</label>
                  <input
                    id="fg_send_time"
                    name="default_send_time_local"
                    type="time"
                    defaultValue={group.default_send_time_local}
                    className="input"
                  />
                </div>
                <SubmitButton className="btn-secondary" pendingText="Saving…">Save changes</SubmitButton>
              </form>
            </details>
          )}
        </div>
        <Link href={`/admin/family-groups/${id}/ancestors/new`} className="btn">Add ancestor</Link>
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Family-wide occasions</h2>
          <form action={boundSetup}>
            <SubmitButton className="btn-secondary" pendingText="Setting up…">Set up CNY / Zhongyuan / Qingming / Winter Solstice</SubmitButton>
          </form>
        </div>
        {!familyWideInstances || familyWideInstances.length === 0 ? (
          <p className="text-sm text-stone-500">Not set up yet — one reminder will cover every ancestor in this group, never duplicated per ancestor.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-xs">
            {familyWideInstances.map((i, idx) => (
              <li key={idx} className="rounded-full bg-stone-100 px-3 py-1">
                {(i.observance_types as { default_label?: string } | null)?.default_label ?? i.type_code}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Family members</h2>
        {!members || members.length === 0 ? (
          <p className="mb-4 text-sm text-stone-500">No members yet.</p>
        ) : (
          <ul className="mb-4 divide-y divide-stone-100">
            {members.map((m) => {
              const boundUpdateMember = updateFamilyMember.bind(null, m.id, m.person_id, id);
              return (
                <li key={m.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{m.people?.name}</span>
                      <span className="text-stone-500"> — {m.relationship || 'member'} · {m.role} · {m.people?.contact_channel}: {m.people?.contact_value}</span>
                      {m.status !== 'approved' && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">pending</span>
                      )}
                    </div>
                  </div>
                  {isSuperAdmin && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-brand-700">Edit</summary>
                      <form action={boundUpdateMember} className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="label" htmlFor={`m_name_${m.id}`}>Name</label>
                          <input id={`m_name_${m.id}`} name="name" required defaultValue={m.people?.name ?? ''} className="input" />
                        </div>
                        <div>
                          <label className="label" htmlFor={`relationship_${m.id}`}>Relationship</label>
                          <input id={`relationship_${m.id}`} name="relationship" defaultValue={m.relationship ?? ''} className="input" />
                        </div>
                        <div>
                          <label className="label" htmlFor={`role_${m.id}`}>Role</label>
                          <select id={`role_${m.id}`} name="role" className="input" defaultValue={m.role}>
                            <option value="member">Member (receive only)</option>
                            <option value="organizer">Organizer (can edit rituals)</option>
                            <option value="keeper">Keeper (can edit ancestor records)</option>
                          </select>
                        </div>
                        <div>
                          <label className="label" htmlFor={`contact_channel_${m.id}`}>Channel</label>
                          <select id={`contact_channel_${m.id}`} name="contact_channel" className="input" defaultValue={m.people?.contact_channel ?? 'whatsapp'}>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="sms">SMS</option>
                            <option value="email">Email</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="label" htmlFor={`contact_value_${m.id}`}>Contact (e.g. +65XXXXXXXX)</label>
                          <input id={`contact_value_${m.id}`} name="contact_value" required defaultValue={m.people?.contact_value ?? ''} className="input" />
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                          <input id={`digest_mode_${m.id}`} name="digest_mode" type="checkbox" defaultChecked={m.people?.digest_mode} />
                          <label htmlFor={`digest_mode_${m.id}`} className="text-sm text-stone-700">Bundle same-day reminders into one digest message</label>
                        </div>
                        <div className="col-span-2">
                          <SubmitButton className="btn-secondary" pendingText="Saving…">Save changes</SubmitButton>
                        </div>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Add a family member</summary>
          <form action={boundAddMember} className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="m_name">Name</label>
              <input id="m_name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="relationship">Relationship</label>
              <input id="relationship" name="relationship" placeholder="e.g. eldest son" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select id="role" name="role" className="input" defaultValue="member">
                <option value="member">Member (receive only)</option>
                <option value="organizer">Organizer (can edit rituals)</option>
                <option value="keeper">Keeper (can edit ancestor records)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="contact_channel">Channel</label>
              <select id="contact_channel" name="contact_channel" className="input" defaultValue="whatsapp">
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="contact_value">Contact (e.g. +65XXXXXXXX)</label>
              <input id="contact_value" name="contact_value" required className="input" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input id="digest_mode" name="digest_mode" type="checkbox" defaultChecked />
              <label htmlFor="digest_mode" className="text-sm text-stone-700">Bundle same-day reminders into one digest message</label>
            </div>
            <div className="col-span-2">
              <SubmitButton pendingText="Adding…">Add member</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Ancestors</h2>
        {!ancestors || ancestors.length === 0 ? (
          <p className="text-sm text-stone-500">No ancestors added yet.</p>
        ) : (
          <ul className="space-y-4">
            {ancestors.map((a) => {
              const boundAddRenewal = addFacilityRenewal.bind(null, a.id, id);
              return (
                <li key={a.id} className="rounded-lg border border-stone-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {a.name}{a.tablet_name ? ` (${a.tablet_name})` : ''}
                        {a.status !== 'approved' && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">pending approval</span>
                        )}
                      </p>
                      <p className="text-xs text-stone-500">
                        Died lunar {a.dod_lunar_month}/{a.dod_lunar_day}{a.dod_is_leap ? ' (leap month)' : ''}
                        {a.dod_is_approximate ? ' · approximate' : ''} — {a.dod_solar_reference}
                      </p>
                      {a.resting_place && (
                        <p className="text-xs text-stone-500">
                          {a.resting_place}{a.niche_number ? ` — ${a.niche_number}` : ''}
                        </p>
                      )}
                      {a.tablet_location && (
                        <p className="text-xs text-stone-500">Tablet: {a.tablet_location}</p>
                      )}
                    </div>
                    {isSuperAdmin && (
                      <Link
                        href={`/admin/family-groups/${id}/ancestors/${a.id}/edit`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                    )}
                  </div>

                  {a.facility_renewals && a.facility_renewals.length > 0 && (
                    <ul className="mt-2 space-y-2 text-xs text-stone-600">
                      {a.facility_renewals.map((r: {
                        id: string;
                        facility_name: string;
                        provider_contact: string | null;
                        renewal_basis: string;
                        renewal_month: number;
                        renewal_day: number;
                        fee_amount: number | null;
                        payment_notes: string | null;
                      }) => {
                        const boundUpdateRenewal = updateFacilityRenewal.bind(null, r.id, id);
                        if (!isSuperAdmin) {
                          return (
                            <li key={r.id}>
                              • {r.facility_name} — renews {r.renewal_month}/{r.renewal_day}{r.fee_amount ? ` (~$${r.fee_amount})` : ''}
                            </li>
                          );
                        }
                        return (
                          <li key={r.id}>
                            <details>
                              <summary className="cursor-pointer">
                                • {r.facility_name} — renews {r.renewal_month}/{r.renewal_day}{r.fee_amount ? ` (~$${r.fee_amount})` : ''}
                                <span className="ml-2 font-medium text-brand-700">Edit</span>
                              </summary>
                                <form action={boundUpdateRenewal} className="mt-2 grid grid-cols-2 gap-2 text-sm normal-case text-stone-800">
                                  <input name="facility_name" placeholder="Temple / columbarium name" required defaultValue={r.facility_name} className="input col-span-2" />
                                  <input name="provider_contact" placeholder="Contact (optional)" defaultValue={r.provider_contact ?? ''} className="input col-span-2" />
                                  <select name="renewal_basis" className="input" defaultValue={r.renewal_basis}>
                                    <option value="solar">Solar date</option>
                                    <option value="lunar">Lunar date</option>
                                  </select>
                                  <div className="flex gap-2">
                                    <input name="renewal_month" type="number" min={1} max={12} defaultValue={r.renewal_month} required className="input" />
                                    <input name="renewal_day" type="number" min={1} max={31} defaultValue={r.renewal_day} required className="input" />
                                  </div>
                                  <input name="fee_amount" type="number" step="0.01" placeholder="Fee amount (optional)" defaultValue={r.fee_amount ?? ''} className="input" />
                                  <input name="payment_notes" placeholder="Payment notes (optional)" defaultValue={r.payment_notes ?? ''} className="input" />
                                  <SubmitButton className="btn-secondary col-span-2" pendingText="Saving…">Save changes</SubmitButton>
                                </form>
                            </details>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-brand-700">+ Add facility/niche renewal reminder</summary>
                    <form action={boundAddRenewal} className="mt-2 grid grid-cols-2 gap-2">
                      <input name="facility_name" placeholder="Temple / columbarium name" required className="input col-span-2" />
                      <input name="provider_contact" placeholder="Contact (optional)" className="input col-span-2" />
                      <select name="renewal_basis" className="input" defaultValue="solar">
                        <option value="solar">Solar date</option>
                        <option value="lunar">Lunar date</option>
                      </select>
                      <div className="flex gap-2">
                        <input name="renewal_month" type="number" min={1} max={12} placeholder="Month" required className="input" />
                        <input name="renewal_day" type="number" min={1} max={31} placeholder="Day" required className="input" />
                      </div>
                      <input name="fee_amount" type="number" step="0.01" placeholder="Fee amount (optional)" className="input" />
                      <input name="payment_notes" placeholder="Payment notes (optional)" className="input" />
                      <SubmitButton className="btn-secondary col-span-2" pendingText="Adding…">Add renewal reminder</SubmitButton>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}