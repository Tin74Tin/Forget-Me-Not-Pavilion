import { createClient } from '@/lib/supabase/server';
import { upsertRitualTemplate, getCurrentAdmin } from '@/lib/actions';
import SubmitButton from '@/app/admin/_components/SubmitButton';

export const dynamic = 'force-dynamic';

export default async function RitualTemplatesPage() {
  const supabase = await createClient();
  const admin = await getCurrentAdmin();
  const { data: types } = await supabase.from('observance_types').select('*').order('code');
  const { data: templates } = await supabase.from('ritual_templates').select('*');
  const byCode = new Map((templates ?? []).map((t) => [t.type_code, t]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Ritual Templates</h1>
        <p className="text-sm text-stone-500">
          One set of instructions per occasion type, sent as part of the D-day reminder. Shared across all families — dialect/regional wording differences can go in Notes.
          {admin?.role === 'data_entry' && ' As a data-entry admin, saving here proposes a revision under Approvals rather than changing the live template directly.'}
        </p>
      </div>

      {(types ?? []).map((t) => {
        const existing = byCode.get(t.code);
        const offeringsText = existing?.offerings_json
          ? Object.entries(existing.offerings_json as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n')
          : '';
        const sequenceText = Array.isArray(existing?.sequence_json) ? (existing!.sequence_json as string[]).join('\n') : '';

        return (
          <details key={t.code} className="card">
            <summary className="cursor-pointer font-medium">{t.default_label} <span className="text-xs text-stone-400">({t.code})</span></summary>
            <form action={upsertRitualTemplate} className="mt-4 space-y-3">
              <input type="hidden" name="type_code" value={t.code} />
              <div>
                <label className="label">Location</label>
                <input name="location" defaultValue={existing?.location ?? ''} placeholder="altar / grave / temple" className="input" />
              </div>
              <div>
                <label className="label">Offerings (one per line, "item: detail")</label>
                <textarea name="offerings" defaultValue={offeringsText} rows={4} className="input font-mono text-xs" placeholder={'incense: 3 sticks per person\ncandles: 1 pair\ndishes: 3 or 5, meat or vegetarian\nfruit: avoid ...\ntea/wine: 3 cups, 3 rounds\njoss paper: ...'} />
              </div>
              <div>
                <label className="label">Sequence (one step per line)</label>
                <textarea name="sequence" defaultValue={sequenceText} rows={4} className="input font-mono text-xs" placeholder={'Light candles\nLight incense\nInvite the ancestor\'s spirit\nPresent offerings\nBow 3 times\nPour tea/wine, 3 rounds\nBurn joss paper\nSee off the spirit'} />
              </div>
              <div>
                <label className="label">Invocation template</label>
                <textarea name="invocation_template" defaultValue={existing?.invocation_template ?? ''} rows={2} className="input" placeholder="e.g. Praying to {ancestor_name}, from {descendant_names}..." />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea name="notes" defaultValue={existing?.notes ?? ''} rows={2} className="input" />
              </div>
              <div>
                <label className="label">Taboos</label>
                <textarea name="taboos" defaultValue={existing?.taboos ?? ''} rows={2} className="input" />
              </div>
              <SubmitButton className="btn-secondary" pendingText="Saving…">Save</SubmitButton>
            </form>
          </details>
        );
      })}
    </div>
  );
}