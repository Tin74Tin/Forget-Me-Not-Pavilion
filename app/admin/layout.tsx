import Link from 'next/link';
import { signOut, getCurrentAdmin } from '@/lib/actions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/admin" className="text-stone-900">Dashboard</Link>
            <Link href="/admin/family-groups" className="text-stone-600 hover:text-stone-900">Family Groups</Link>
            <Link href="/admin/ritual-templates" className="text-stone-600 hover:text-stone-900">Ritual Templates</Link>
            <Link href="/admin/approvals" className="text-stone-600 hover:text-stone-900">Approvals</Link>
            {admin?.role === 'super_admin' && (
              <Link href="/admin/admins" className="text-stone-600 hover:text-stone-900">Admins</Link>
            )}
          </nav>
          <div className="flex items-center gap-4">
            {admin && (
              <span className="text-xs text-stone-500">
                {admin.name} · <span className="uppercase tracking-wide">{admin.role.replace('_', ' ')}</span>
              </span>
            )}
            <form action={signOut}>
              <button type="submit" className="text-sm text-stone-500 hover:text-stone-800">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
