import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAdmin, inviteAdmin, removeAdmin } from '@/lib/actions';
import type { AdminUser } from '@/lib/types';
import RoleSelect from './RoleSelect';
import SubmitButton from '@/app/admin/_components/SubmitButton';

export const dynamic = 'force-dynamic';

export default async function AdminsPage() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== 'super_admin') redirect('/admin');

  const supabase = await createClient();
  const { data: admins } = await supabase.from('admin_users').select('*').order('created_at', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admins</h1>
        <p className="text-sm text-stone-500">
          Super admins have full read/write/delete access. Data-entry admins can add new records — family
          groups, ancestors, members, instances, renewals — but everything they add lands as pending until a
          super admin approves it, and they can never edit or delete any row, including their own. There's no
          limit on how many of either you add.
        </p>
      </div>

      <div className="card">
        <ul className="divide-y divide-stone-100">
          {(admins as AdminUser[] | null)?.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-stone-500">
                  added {new Date(a.created_at).toLocaleDateString('en-SG')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <RoleSelect adminId={a.id} currentRole={a.role} />
                {a.id !== admin.id && (
                  <form action={async () => { 'use server'; await removeAdmin(a.id); }}>
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card max-w-md">
        <h2 className="mb-3 font-medium">Add an admin</h2>
        <p className="mb-3 text-xs text-stone-500">
          They need a Supabase Auth account first — invite them via the Supabase Dashboard
          (Authentication → Users → Invite user), then register their role here using the same email.
        </p>
        <form action={inviteAdmin} className="space-y-3">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required className="input" placeholder="e.g. Assistant" />
          </div>
          <div>
            <label className="label" htmlFor="email">Email (must match their invited Auth account)</label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="role">Role</label>
            <select id="role" name="role" className="input" defaultValue="data_entry">
              <option value="data_entry">Data entry — can add, can't edit or delete</option>
              <option value="super_admin">Super admin — full access</option>
            </select>
          </div>
          <SubmitButton pendingText="Adding…">Add admin</SubmitButton>
        </form>
      </div>
    </div>
  );
}