// Daily reminder job. Invoked once a day by pg_cron (see README for the
// schedule setup). Responsibilities:
//   1. Recompute next_occurrence_solar for every open observance instance
//      and facility renewal, using the lunar/solar-term logic in _shared.
//   2. Work out what's due TODAY for each lead_day in D-30/14/7/3/1/0.
//   3. Claim an idempotency slot per (occasion, person, lead_day, year) so a
//      retried run never double-sends.
//   4. Bundle everything due for the same person into one digest message.
//   5. Send via WhatsApp (Twilio), with a fallback to the person's secondary
//      contact if the primary send fails.
//
// IMPORTANT — WhatsApp template requirement: WhatsApp Business API only
// allows free-form business-initiated messages within a 24-hour window
// after the recipient last messaged you. Since these are proactive
// reminders, production sends MUST use a pre-approved message template
// (set TWILIO_CONTENT_SID). Without it, this will only work against
// Twilio's WhatsApp *sandbox* for numbers that have joined the sandbox —
// see README for how to move to a template for real sends.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  computeNextOccurrence,
  computeNextRenewal,
  formatISO,
  type AncestorRow,
  type FacilityRenewalRow,
  type ObservanceInstanceRow,
} from '../_shared/occurrences.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM')!; // e.g. 'whatsapp:+14155238886'
const TWILIO_CONTENT_SID = Deno.env.get('TWILIO_CONTENT_SID'); // optional: approved template SID
const DEFAULT_TIMEZONE = Deno.env.get('DEFAULT_TIMEZONE') ?? 'Asia/Singapore';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface DueItem {
  personId: string;
  body: string;
  instanceId: string | null;
  renewalId: string | null;
  leadDay: number;
  occurrenceYear: number;
  notificationId?: string;
}

Deno.serve(async (_req: Request) => {
  const today = todayInTimezone(DEFAULT_TIMEZONE);
  const dueItems: DueItem[] = [];

  // --- 1 & 2: ritual observance instances -------------------------------
  // status='approved' only: a data_entry admin's pending inserts must never
  // reach the reminder engine. family_groups(status) is joined too, since a
  // family-wide instance can technically exist under a still-pending group.
  const { data: instances, error: instErr } = await supabase
    .from('observance_instances')
    .select('*, observance_types(default_label), ancestors(*), family_groups!inner(status)')
    .is('completed_at', null)
    .eq('status', 'approved')
    .eq('family_groups.status', 'approved');
  if (instErr) throw instErr;

  for (const row of instances ?? []) {
    const ancestor = (row.ancestors as AncestorRow | null) ?? null;
    // A per-ancestor instance riding on a still-pending (or rejected)
    // ancestor record must not fire either.
    if (row.ancestor_id && (!ancestor || (ancestor as unknown as { status?: string }).status !== 'approved')) {
      continue;
    }
    const instance = row as unknown as ObservanceInstanceRow;

    let nextDate: Date | null;
    try {
      nextDate = computeNextOccurrence(instance, ancestor, today);
    } catch (e) {
      console.error('Failed computing occurrence for instance', row.id, e);
      continue;
    }
    if (!nextDate) continue; // ONCE-type instance already fired

    const isoNext = formatISO(nextDate);
    if (row.next_occurrence_solar !== isoNext) {
      await supabase.from('observance_instances').update({ next_occurrence_solar: isoNext }).eq('id', row.id);
    }

    for (const leadDay of (row.lead_days ?? []) as number[]) {
      const reminderDate = addDays(nextDate, -leadDay);
      if (formatISO(reminderDate) !== formatISO(today)) continue;

      const familyGroupId = row.family_group_id as string;

      let ancestorNames: string[];
      if (row.ancestor_id) {
        ancestorNames = [ancestor?.name ?? 'ancestor'].filter(Boolean) as string[];
      } else {
        const { data: groupAncestors } = await supabase
          .from('ancestors')
          .select('name')
          .eq('family_group_id', familyGroupId)
          .eq('status', 'approved');
        ancestorNames = (groupAncestors ?? []).map((a: { name: string }) => a.name);
      }

      const label = (row.observance_types as { default_label?: string } | null)?.default_label ?? row.type_code;
      const leadText = leadDay === 0 ? 'D-day — today' : `${leadDay} day${leadDay === 1 ? '' : 's'} before`;
      const bodyLine = `${label} for ${ancestorNames.join(', ') || 'the family'} — ${leadText} (${isoNext})`;

      const { data: members } = await supabase
        .from('family_group_members')
        .select('person_id')
        .eq('family_group_id', familyGroupId)
        .eq('notify', true)
        .eq('status', 'approved');

      for (const m of members ?? []) {
        dueItems.push({
          personId: m.person_id as string,
          body: bodyLine,
          instanceId: row.id as string,
          renewalId: null,
          leadDay,
          occurrenceYear: nextDate.getFullYear(),
        });
      }
    }
  }

  // --- facility renewals (keeper/organizer only) -------------------------
  const { data: renewals, error: renErr } = await supabase
    .from('facility_renewals')
    .select('*, ancestors!inner(family_group_id, name, status, family_groups!inner(status))')
    .eq('status', 'approved')
    .eq('ancestors.status', 'approved')
    .eq('ancestors.family_groups.status', 'approved');
  if (renErr) throw renErr;

  for (const row of renewals ?? []) {
    const renewal = row as unknown as FacilityRenewalRow;
    const nextDate = computeNextRenewal(renewal, today);
    const isoNext = formatISO(nextDate);
    if (row.next_renewal_solar !== isoNext) {
      await supabase.from('facility_renewals').update({ next_renewal_solar: isoNext }).eq('id', row.id);
    }

    const ancestorInfo = row.ancestors as { family_group_id: string; name: string } | null;
    if (!ancestorInfo) continue;

    for (const leadDay of (row.lead_days ?? []) as number[]) {
      const reminderDate = addDays(nextDate, -leadDay);
      if (formatISO(reminderDate) !== formatISO(today)) continue;

      const feeText = row.fee_amount ? ` (approx. $${row.fee_amount})` : '';
      const leadText = leadDay === 0 ? 'due today' : `due in ${leadDay} day${leadDay === 1 ? '' : 's'}`;
      const bodyLine = `Renewal due: ${row.facility_name} for ${ancestorInfo.name} — ${leadText} (${isoNext})${feeText}`;

      const { data: members } = await supabase
        .from('family_group_members')
        .select('person_id')
        .eq('family_group_id', ancestorInfo.family_group_id)
        .in('role', ['keeper', 'organizer'])
        .eq('notify', true)
        .eq('status', 'approved');

      for (const m of members ?? []) {
        dueItems.push({
          personId: m.person_id as string,
          body: bodyLine,
          instanceId: null,
          renewalId: row.id as string,
          leadDay,
          occurrenceYear: nextDate.getFullYear(),
        });
      }
    }
  }

  // --- 3: idempotency claim ------------------------------------------------
  const claimedItems: DueItem[] = [];
  for (const item of dueItems) {
    const { data: claimedId, error } = await supabase.rpc('claim_notification', {
      p_instance_id: item.instanceId,
      p_renewal_id: item.renewalId,
      p_person_id: item.personId,
      p_lead_day: item.leadDay,
      p_occurrence_year: item.occurrenceYear,
      p_channel: 'whatsapp',
    });
    if (error) {
      console.error('claim_notification error', error);
      continue;
    }
    if (!claimedId) continue; // already sent by a previous run — skip silently
    claimedItems.push({ ...item, notificationId: claimedId as string });
  }

  // --- 4 & 5: bundle per person and send -----------------------------------
  const byPerson = new Map<string, DueItem[]>();
  for (const item of claimedItems) {
    const list = byPerson.get(item.personId) ?? [];
    list.push(item);
    byPerson.set(item.personId, list);
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const [personId, items] of byPerson) {
    const { data: person } = await supabase.from('people').select('*').eq('id', personId).single();
    if (!person) continue;

    const message = items.length === 1
      ? items[0].body
      : `You have ${items.length} upcoming prayer reminders:\n\n${items.map((it, i) => `${i + 1}. ${it.body}`).join('\n')}`;

    const notificationIds = items.map((it) => it.notificationId).filter(Boolean) as string[];
    const result = await sendWhatsApp(person.contact_value, message);

    if (result.ok) {
      sentCount += notificationIds.length;
      await supabase
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), message_body: message })
        .in('id', notificationIds);
    } else {
      let fallbackOk = false;
      if (person.secondary_contact_value) {
        const fallback = await sendWhatsApp(person.secondary_contact_value, message);
        fallbackOk = fallback.ok;
      }
      failedCount += notificationIds.length;
      await supabase
        .from('notifications')
        .update({ status: fallbackOk ? 'sent' : 'failed', message_body: message, sent_at: fallbackOk ? new Date().toISOString() : null })
        .in('id', notificationIds);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, dueItems: dueItems.length, claimed: claimedItems.length, sent: sentCount, failed: failedCount }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

// --- helpers ---------------------------------------------------------------

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function todayInTimezone(tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const d = Number(parts.find((p) => p.type === 'day')!.value);
  return new Date(y, m - 1, d);
}

async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const toWhatsapp = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const params = new URLSearchParams({ To: toWhatsapp, From: TWILIO_WHATSAPP_FROM });
  if (TWILIO_CONTENT_SID) {
    // Production path: pre-approved template, required for business-initiated
    // WhatsApp messages. Assumes a template with a single {{1}} variable.
    params.set('ContentSid', TWILIO_CONTENT_SID);
    params.set('ContentVariables', JSON.stringify({ '1': body }));
  } else {
    // Sandbox/dev path: free-form body, only deliverable to numbers that
    // have joined your Twilio WhatsApp sandbox.
    params.set('Body', body);
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Twilio error', res.status, text);
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (e) {
    console.error('Twilio request failed', e);
    return { ok: false, error: String(e) };
  }
}
