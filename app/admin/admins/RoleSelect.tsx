'use client';

import { updateAdminRole } from '@/lib/actions';
import type { AdminRole } from '@/lib/types';

export default function RoleSelect({ adminId, currentRole }: { adminId: string; currentRole: AdminRole }) {
  return (
    <select
      defaultValue={currentRole}
      className="input !w-auto py-1 text-xs"
      onChange={(e) => updateAdminRole(adminId, e.target.value as AdminRole)}
    >
      <option value="data_entry">Data entry</option>
      <option value="super_admin">Super admin</option>
    </select>
  );
}