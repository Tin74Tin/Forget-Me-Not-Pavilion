'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/types';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// --- Admin identity -----------------------------------------------------------
// Two-tier admin access (super_admin / data_entry) — see
// supabase/migrations/0005_admin_roles.sql for the full rationale. This is
// the one place server components/actions resolve "who is this, and what
// tier are they" so nav gating and role branches stay consistent.

export async function getCurrentAdmin(): Promise<{ id: string; name: string; role: AdminRole } | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('admin_users').select('id, name, role').eq('id', auth.user.id).single();
  return data as { id: string; name: string; role: AdminRole } | null;
}

/** Entity tables a data_entry admin can insert into, all carrying the
 * status/created_by/reviewed_by/reviewed_at approval columns from
 * migration 0005. Whitelisted here (rather than accepting any string) so a
 * server action taking a table name can't be pointed at an arbitrary table. */
const APPROVABLE_TABLES = [
  'family_groups',
  'ancestors',
  'family_group_members',
  'observance_instances',
  'facility_renewals',
] as const;
export type ApprovableTable = (typeof APPROVABLE_TABLES)[number];

/** Super-admin-only: approve or reject a pending row on any of the five
 * approvable tables. RLS also enforces this (only super_admin can UPDATE),
 * so a data_entry admin hitting this action gets a clean DB-level denial
 * either way — this check just gives a friendlier error. */
export async function reviewEntity(table: ApprovableTable, id: string, decision: 'approved' | 'rejected') {
  if (!APPROVABLE_TABLES.includes(table)) throw new Error('Unknown table');
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can review pending entries');

  const { error } = await supabase
    .from(table)
    .update({ status: decision, reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
}

// --- Admin management -----------------------------------------------------------

/** Super-admin-only: register a new admin (of either tier) by email. The
 * person must already have a Supabase Auth account — invite them first via
 * Dashboard -> Authentication -> Invite user, then register their role
 * here. There's no limit on how many admins of either tier can exist. */
export async function inviteAdmin(formData: FormData) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can add admins');

  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? 'data_entry') as AdminRole;
  if (!email || !name) throw new Error('Name and email are required');

  const { data: userId, error: lookupErr } = await supabase.rpc('admin_lookup_user_id', { p_email: email });
  if (lookupErr) throw lookupErr;
  if (!userId) {
    throw new Error(
      `No Supabase Auth account found for ${email} yet. Invite them first in the Supabase Dashboard ` +
        '(Authentication -> Users -> Invite user), then add them here once they exist.',
    );
  }

  const { error } = await supabase.from('admin_users').insert({ id: userId, name, role });
  if (error) throw error;

  revalidatePath('/admin/admins');
}

export async function updateAdminRole(id: string, role: AdminRole) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can change admin roles');

  const { error } = await supabase.from('admin_users').update({ role }).eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/admins');
}

export async function removeAdmin(id: string) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can remove admins');
  if (id === admin.id) throw new Error("You can't remove your own admin access");

  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/admins');
}

// --- Family groups ----------------------------------------------------------

export async function createFamilyGroup(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get('name') ?? '').trim();
  const dialect = String(formData.get('dialect') ?? 'mandarin');
  const default_send_time_local = String(formData.get('default_send_time_local') ?? '08:00');
  if (!name) throw new Error('Family group name is required');

  const { data, error } = await supabase
    .from('family_groups')
    .insert({ name, dialect, default_send_time_local })
    .select('id')
    .single();
  if (error) throw error;

  redirect(`/admin/family-groups/${data.id}`);
}

/** Super-admin-only: correct a family group's own details in place. RLS
 * also enforces this (only super_admin can UPDATE), so this check just
 * gives a friendlier error than a raw DB denial. */
export async function updateFamilyGroup(familyGroupId: string, formData: FormData) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can edit a family group');

  const name = String(formData.get('name') ?? '').trim();
  const dialect = String(formData.get('dialect') ?? 'mandarin');
  const default_send_time_local = String(formData.get('default_send_time_local') ?? '08:00');
  if (!name) throw new Error('Family group name is required');

  const { error } = await supabase
    .from('family_groups')
    .update({ name, dialect, default_send_time_local })
    .eq('id', familyGroupId);
  if (error) throw error;

  revalidatePath(`/admin/family-groups/${familyGroupId}`);
}

/** Creates the standard family-wide occasions (CNY, Zhongyuan, Qingming, Winter Solstice, 初一/十五)
 * for a group — one instance per group, never per ancestor, per the de-duplication design. */
export async function setupFamilyWideObservances(familyGroupId: string) {
  const supabase = await createClient();

  const { data: types } = await supabase
    .from('observance_types')
    .select('*')
    .eq('scope', 'per_family_group');

  for (const t of types ?? []) {
    if (t.code === 'FIRST_15TH') {
      for (const day of [1, 15]) {
        await supabase.from('observance_instances').insert({
          family_group_id: familyGroupId,
          type_code: t.code,
          lunar_day: day,
          lead_days: t.default_lead_days,
        }); // unique index silently rejects a duplicate; errors here are expected/ignored
      }
      continue;
    }
    await supabase.from('observance_instances').insert({
      family_group_id: familyGroupId,
      type_code: t.code,
      lead_days: t.default_lead_days,
    });
  }

  revalidatePath(`/admin/family-groups/${familyGroupId}`);
}

// --- Family members ----------------------------------------------------------

export async function addFamilyMember(familyGroupId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get('name') ?? '').trim();
  const relationship = String(formData.get('relationship') ?? '').trim();
  const role = String(formData.get('role') ?? 'member');
  const contact_channel = String(formData.get('contact_channel') ?? 'whatsapp');
  const contact_value = String(formData.get('contact_value') ?? '').trim();
  const digest_mode = formData.get('digest_mode') === 'on';
  if (!name || !contact_value) throw new Error('Name and contact are required');

  const { data: person, error: personErr } = await supabase
    .from('people')
    .insert({ name, contact_channel, contact_value, digest_mode })
    .select('id')
    .single();
  if (personErr) throw personErr;

  const { error: memberErr } = await supabase.from('family_group_members').insert({
    family_group_id: familyGroupId,
    person_id: person.id,
    relationship,
    role,
    notify: true,
  });
  if (memberErr) throw memberErr;

  revalidatePath(`/admin/family-groups/${familyGroupId}`);
}

/** Super-admin-only: correct a family member's own details (name/contact)
 * and their membership details (relationship/role) in place. */
export async function updateFamilyMember(
  memberId: string,
  personId: string,
  familyGroupId: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can edit a family member');

  const name = String(formData.get('name') ?? '').trim();
  const relationship = String(formData.get('relationship') ?? '').trim();
  const role = String(formData.get('role') ?? 'member');
  const contact_channel = String(formData.get('contact_channel') ?? 'whatsapp');
  const contact_value = String(formData.get('contact_value') ?? '').trim();
  const digest_mode = formData.get('digest_mode') === 'on';
  if (!name || !contact_value) throw new Error('Name and contact are required');

  const { error: personErr } = await supabase
    .from('people')
    .update({ name, contact_channel, contact_value, digest_mode })
    .eq('id', personId);
  if (personErr) throw personErr;

  const { error: memberErr } = await supabase
    .from('family_group_members')
    .update({ relationship, role })
    .eq('id', memberId);
  if (memberErr) throw memberErr;

  revalidatePath(`/admin/family-groups/${familyGroupId}`);
}

// --- Ancestors ----------------------------------------------------------------

const MILESTONE_DAY_OFFSETS = [7, 14, 21, 28, 35, 42, 49]; // 頭七 ... 尾七/滿七

export async function createAncestor(familyGroupId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get('name') ?? '').trim();
  const tablet_name = String(formData.get('tablet_name') ?? '').trim() || null;
  const resting_place = String(formData.get('resting_place') ?? '').trim() || null;
  const niche_number = String(formData.get('niche_number') ?? '').trim() || null;
  const tablet_location = String(formData.get('tablet_location') ?? '').trim() || null;
  const dob_solar = String(formData.get('dob_solar') ?? '').trim() || null;
  const dod_lunar_month = Number(formData.get('dod_lunar_month'));
  const dod_lunar_day = Number(formData.get('dod_lunar_day'));
  const dod_is_leap = formData.get('dod_is_leap') === 'on';
  const dod_solar_reference = String(formData.get('dod_solar_reference') ?? '');
  const dod_is_approximate = formData.get('dod_is_approximate') === 'on';
  const leap_month_handling = String(formData.get('leap_month_handling') ?? 'observe_in_following_month');
  const observance_offset_days = Number(formData.get('observance_offset_days') ?? 0);

  if (!name || !dod_lunar_month || !dod_lunar_day || !dod_solar_reference) {
    throw new Error('Name and date of death are required');
  }

  const { data: ancestor, error } = await supabase
    .from('ancestors')
    .insert({
      family_group_id: familyGroupId,
      name,
      tablet_name,
      resting_place,
      niche_number,
      tablet_location,
      dob_solar,
      dod_lunar_month,
      dod_lunar_day,
      dod_is_leap,
      dod_solar_reference,
      dod_is_approximate,
      leap_month_handling,
      observance_offset_days,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { data: types } = await supabase.from('observance_types').select('*').eq('scope', 'per_ancestor');
  const byCode = new Map((types ?? []).map((t) => [t.code, t]));

  // Always set up the recurring annual death anniversary.
  const deathAnniv = byCode.get('DEATH_ANNIV');
  await supabase.from('observance_instances').insert({
    ancestor_id: ancestor.id,
    family_group_id: familyGroupId,
    type_code: 'DEATH_ANNIV',
    lunar_month: dod_lunar_month,
    lunar_day: dod_lunar_day,
    is_leap_month: dod_is_leap,
    lead_days: deathAnniv?.default_lead_days ?? [30, 14, 7, 3, 1, 0],
  });

  // Optional: an annual birthday-remembrance reminder (冥誕), only set up if a
  // birth date was given. Unlike every other yearly observance in this app,
  // this one recurs on the fixed Gregorian month/day each year, not the
  // lunar date -- per Tin's preference, since birthdays are normally kept by
  // the Gregorian calendar even when death-related rites follow the lunar one.
  if (dob_solar) {
    const mingDan = byCode.get('MING_DAN');
    await supabase.from('observance_instances').insert({
      ancestor_id: ancestor.id,
      family_group_id: familyGroupId,
      type_code: 'MING_DAN',
      lead_days: mingDan?.default_lead_days ?? [7, 3, 1, 0],
    });
  }

  if (formData.get('milestone_bai_ri') === 'on') {
    const t = byCode.get('BAI_RI');
    await supabase.from('observance_instances').insert({
      ancestor_id: ancestor.id,
      family_group_id: familyGroupId,
      type_code: 'BAI_RI',
      day_offset: 100,
      lead_days: t?.default_lead_days ?? [14, 7, 3, 1, 0],
    });
  }

  if (formData.get('milestone_qi_7') === 'on') {
    const t = byCode.get('QI_7');
    for (const offset of MILESTONE_DAY_OFFSETS) {
      await supabase.from('observance_instances').insert({
        ancestor_id: ancestor.id,
        family_group_id: familyGroupId,
        type_code: 'QI_7',
        day_offset: offset,
        lead_days: t?.default_lead_days ?? [3, 1, 0],
      });
    }
  }

  if (formData.get('milestone_dui_nian') === 'on') {
    const t = byCode.get('DUI_NIAN');
    await supabase.from('observance_instances').insert({
      ancestor_id: ancestor.id,
      family_group_id: familyGroupId,
      type_code: 'DUI_NIAN',
      lunar_month: dod_lunar_month,
      lunar_day: dod_lunar_day,
      lead_days: t?.default_lead_days ?? [30, 14, 7, 3, 1, 0],
    });
  }

  if (formData.get('milestone_san_nian') === 'on') {
    const t = byCode.get('SAN_NIAN');
    await supabase.from('observance_instances').insert({
      ancestor_id: ancestor.id,
      family_group_id: familyGroupId,
      type_code: 'SAN_NIAN',
      lunar_month: dod_lunar_month,
      lunar_day: dod_lunar_day,
      lead_days: t?.default_lead_days ?? [30, 14, 7, 3, 1, 0],
    });
  }

  redirect(`/admin/family-groups/${familyGroupId}`);
}

/** Super-admin-only: correct an ancestor's own details in place, including
 * the date of death. Deliberately does NOT re-process the milestone
 * checkboxes (百日/頭七.../對年/三年) — those were one-time setup actions when
 * the ancestor was first added, and re-running them here on every edit
 * would either silently do nothing (unique index) or need its own delete-
 * and-recreate logic that isn't worth the complexity for a rarely-used
 * correction screen. If the date of death changes, the recurring annual
 * DEATH_ANNIV reminder is kept in sync so future reminders land on the
 * corrected date; past milestone instances (already tied to the old date)
 * are left alone. */
export async function updateAncestor(ancestorId: string, familyGroupId: string, formData: FormData) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can edit an ancestor');

  const name = String(formData.get('name') ?? '').trim();
  const tablet_name = String(formData.get('tablet_name') ?? '').trim() || null;
  const resting_place = String(formData.get('resting_place') ?? '').trim() || null;
  const niche_number = String(formData.get('niche_number') ?? '').trim() || null;
  const tablet_location = String(formData.get('tablet_location') ?? '').trim() || null;
  const dob_solar = String(formData.get('dob_solar') ?? '').trim() || null;
  const dod_lunar_month = Number(formData.get('dod_lunar_month'));
  const dod_lunar_day = Number(formData.get('dod_lunar_day'));
  const dod_is_leap = formData.get('dod_is_leap') === 'on';
  const dod_solar_reference = String(formData.get('dod_solar_reference') ?? '');
  const dod_is_approximate = formData.get('dod_is_approximate') === 'on';
  const leap_month_handling = String(formData.get('leap_month_handling') ?? 'observe_in_following_month');
  const observance_offset_days = Number(formData.get('observance_offset_days') ?? 0);

  if (!name || !dod_lunar_month || !dod_lunar_day || !dod_solar_reference) {
    throw new Error('Name and date of death are required');
  }

  const { error } = await supabase
    .from('ancestors')
    .update({
      name,
      tablet_name,
      resting_place,
      niche_number,
      tablet_location,
      dob_solar,
      dod_lunar_month,
      dod_lunar_day,
      dod_is_leap,
      dod_solar_reference,
      dod_is_approximate,
      leap_month_handling,
      observance_offset_days,
    })
    .eq('id', ancestorId);
  if (error) throw error;

  // Keep the recurring death-anniversary reminder's date in step with any change above.
  await supabase
    .from('observance_instances')
    .update({ lunar_month: dod_lunar_month, lunar_day: dod_lunar_day, is_leap_month: dod_is_leap })
    .eq('ancestor_id', ancestorId)
    .eq('type_code', 'DEATH_ANNIV');

  // Keep the optional birthday-remembrance reminder (冥誕) in sync: create it
  // if a birth date was just added, or remove it if the birth date was
  // cleared. No "update" case is needed beyond that -- its date is read
  // live from ancestors.dob_solar each time it's computed, not stored again
  // on the instance itself.
  if (dob_solar) {
    const { data: existingMingDan } = await supabase
      .from('observance_instances')
      .select('id')
      .eq('ancestor_id', ancestorId)
      .eq('type_code', 'MING_DAN')
      .maybeSingle();
    if (!existingMingDan) {
      const { data: mingDanType } = await supabase
        .from('observance_types')
        .select('*')
        .eq('code', 'MING_DAN')
        .single();
      await supabase.from('observance_instances').insert({
        ancestor_id: ancestorId,
        family_group_id: familyGroupId,
        type_code: 'MING_DAN',
        lead_days: mingDanType?.default_lead_days ?? [7, 3, 1, 0],
      });
    }
  } else {
    await supabase
      .from('observance_instances')
      .delete()
      .eq('ancestor_id', ancestorId)
      .eq('type_code', 'MING_DAN');
  }

  revalidatePath(`/admin/family-groups/${familyGroupId}`);
  redirect(`/admin/family-groups/${familyGroupId}`);
}

// --- Facility renewals ---------------------------------------------------------

export async function addFacilityRenewal(ancestorId: string, familyGroupId: string, formData: FormData) {
  const supabase = await createClient();

  const facility_name = String(formData.get('facility_name') ?? '').trim();
  const provider_contact = String(formData.get('provider_contact') ?? '').trim() || null;
  const renewal_basis = String(formData.get('renewal_basis') ?? 'solar');
  const renewal_month = Number(formData.get('renewal_month'));
  const renewal_day = Number(formData.get('renewal_day'));
  const fee_amount = formData.get('fee_amount') ? Number(formData.get('fee_amount')) : null;
  const payment_notes = String(formData.get('payment_notes') ?? '').trim() || null;

  if (!facility_name || !renewal_month || !renewal_day) {
    throw new Error('Facility name and renewal month/day are required');
  }

  const { error } = await supabase.from('facility_renewals').insert({
    ancestor_id: ancestorId,
    facility_name,
    provider_contact,
    renewal_basis,
    renewal_month,
    renewal_day,
    fee_amount,
    payment_notes,
  });
  if (error) throw error;

  revalidatePath(`/admin/family-groups/${familyGroupId}`);
}

/** Super-admin-only: correct a facility/niche renewal reminder in place. */
export async function updateFacilityRenewal(renewalId: string, familyGroupId: string, formData: FormData) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can edit a renewal reminder');

  const facility_name = String(formData.get('facility_name') ?? '').trim();
  const provider_contact = String(formData.get('provider_contact') ?? '').trim() || null;
  const renewal_basis = String(formData.get('renewal_basis') ?? 'solar');
  const renewal_month = Number(formData.get('renewal_month'));
  const renewal_day = Number(formData.get('renewal_day'));
  const fee_amount = formData.get('fee_amount') ? Number(formData.get('fee_amount')) : null;
  const payment_notes = String(formData.get('payment_notes') ?? '').trim() || null;

  if (!facility_name || !renewal_month || !renewal_day) {
    throw new Error('Facility name and renewal month/day are required');
  }

  const { error } = await supabase
    .from('facility_renewals')
    .update({ facility_name, provider_contact, renewal_basis, renewal_month, renewal_day, fee_amount, payment_notes })
    .eq('id', renewalId);
  if (error) throw error;

  revalidatePath(`/admin/family-groups/${familyGroupId}`);
}

// --- Ritual templates ---------------------------------------------------------
// ritual_templates is a fixed one-row-per-type lookup, so a data_entry
// admin can't just insert another draft row the way they do for ancestors
// etc. — see migration 0005's rationale. A super_admin's edit still writes
// straight to the live row (this predates the approval workflow and stays
// the fast path for the one person who actually operates this app day to
// day); a data_entry admin's edit is redirected into
// ritual_template_revisions for a super_admin to review and apply.

export async function upsertRitualTemplate(formData: FormData) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error('Not a registered admin user');

  const type_code = String(formData.get('type_code') ?? '');
  const location = String(formData.get('location') ?? '').trim() || null;
  const invocation_template = String(formData.get('invocation_template') ?? '').trim() || null;
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const taboos = String(formData.get('taboos') ?? '').trim() || null;
  const offeringsRaw = String(formData.get('offerings') ?? '').trim();
  const sequenceRaw = String(formData.get('sequence') ?? '').trim();

  const offerings_json = offeringsRaw
    ? Object.fromEntries(offeringsRaw.split('\n').filter(Boolean).map((line) => {
        const [k, ...rest] = line.split(':');
        return [k.trim(), rest.join(':').trim()];
      }))
    : {};
  const sequence_json = sequenceRaw ? sequenceRaw.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  if (!type_code) throw new Error('Missing observance type');

  const fields = { type_code, location, invocation_template, notes, taboos, offerings_json, sequence_json };

  if (admin.role === 'super_admin') {
    const { error } = await supabase.from('ritual_templates').upsert(fields, { onConflict: 'type_code' });
    if (error) throw error;
    revalidatePath('/admin/ritual-templates');
  } else {
    const { error } = await supabase.from('ritual_template_revisions').insert(fields);
    if (error) throw error;
    revalidatePath('/admin/ritual-templates');
    revalidatePath('/admin/approvals');
  }
}

/** Super-admin-only: apply a proposed ritual_template_revision to the live
 * ritual_templates row, then mark the revision approved. */
export async function applyRitualTemplateRevision(revisionId: string) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can apply a revision');

  const { data: revision, error: fetchErr } = await supabase
    .from('ritual_template_revisions')
    .select('*')
    .eq('id', revisionId)
    .single();
  if (fetchErr) throw fetchErr;

  const { error: upsertErr } = await supabase.from('ritual_templates').upsert(
    {
      type_code: revision.type_code,
      location: revision.location,
      invocation_template: revision.invocation_template,
      notes: revision.notes,
      taboos: revision.taboos,
      offerings_json: revision.offerings_json,
      sequence_json: revision.sequence_json,
    },
    { onConflict: 'type_code' },
  );
  if (upsertErr) throw upsertErr;

  const { error: reviewErr } = await supabase
    .from('ritual_template_revisions')
    .update({ status: 'approved', reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq('id', revisionId);
  if (reviewErr) throw reviewErr;

  revalidatePath('/admin/ritual-templates');
  revalidatePath('/admin/approvals');
}

export async function rejectRitualTemplateRevision(revisionId: string) {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') throw new Error('Only a super_admin can reject a revision');

  const { error } = await supabase
    .from('ritual_template_revisions')
    .update({ status: 'rejected', reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq('id', revisionId);
  if (error) throw error;

  revalidatePath('/admin/approvals');
}