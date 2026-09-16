export type Dialect = 'hokkien' | 'teochew' | 'cantonese' | 'hakka' | 'mandarin' | 'other';
export type MemberRole = 'keeper' | 'organizer' | 'member';
export type ContactChannel = 'whatsapp' | 'sms' | 'email' | 'push';
export type LeapHandling = 'observe_in_leap_month' | 'observe_in_following_month';
export type AdminRole = 'super_admin' | 'data_entry';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// Columns added by migration 0005 to every table a data_entry admin can
// insert into (family_groups, ancestors, family_group_members,
// observance_instances, facility_renewals). A data_entry admin's insert
// always lands 'pending' and can never be updated or deleted by them —
// only a super_admin can move it to 'approved'/'rejected'.
export interface Approvable {
  status: ApprovalStatus;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface AdminUser {
  id: string;
  name: string;
  role: AdminRole;
  created_at: string;
}

export interface RitualTemplateRevision extends Approvable {
  id: string;
  type_code: string;
  location: string | null;
  offerings_json: unknown;
  sequence_json: unknown;
  invocation_template: string | null;
  notes: string | null;
  taboos: string | null;
  created_at: string;
}

export interface Person {
  id: string;
  name: string;
  contact_channel: ContactChannel;
  contact_value: string;
  secondary_contact_channel: ContactChannel | null;
  secondary_contact_value: string | null;
  timezone: string;
  preferred_language: 'en' | 'zh';
  digest_mode: boolean;
}

export interface FamilyGroup extends Approvable {
  id: string;
  name: string;
  dialect: Dialect;
  default_send_time_local: string;
  notes: string | null;
}

export interface FamilyGroupMember extends Approvable {
  id: string;
  family_group_id: string;
  person_id: string;
  relationship: string;
  role: MemberRole;
  notify: boolean;
  people?: Person;
}

export interface Ancestor extends Approvable {
  id: string;
  family_group_id: string;
  name: string;
  tablet_name: string | null;
  dob_solar: string | null;
  dod_lunar_month: number;
  dod_lunar_day: number;
  dod_is_leap: boolean;
  dod_is_approximate: boolean;
  dod_solar_reference: string;
  leap_month_handling: LeapHandling;
  observance_offset_days: number;
  combined_with_sannian: boolean;
  resting_place: string | null;
  photo_url: string | null;
}

export interface ObservanceType {
  code: string;
  calendar_basis: 'lunar' | 'solar_term' | 'day_offset';
  recurrence: 'once' | 'yearly' | 'monthly';
  scope: 'per_ancestor' | 'per_family_group';
  default_label: string;
  default_lead_days: number[];
}

export interface ObservanceInstance extends Approvable {
  id: string;
  ancestor_id: string | null;
  family_group_id: string;
  type_code: string;
  lunar_month: number | null;
  lunar_day: number | null;
  is_leap_month: boolean;
  day_offset: number | null;
  next_occurrence_solar: string | null;
  lead_days: number[];
  no_delay_convention: boolean;
  completed_at: string | null;
}

export interface FacilityRenewal extends Approvable {
  id: string;
  ancestor_id: string;
  facility_name: string;
  provider_contact: string | null;
  renewal_basis: 'solar' | 'lunar';
  renewal_month: number;
  renewal_day: number;
  lead_days: number[];
  fee_amount: number | null;
  payment_notes: string | null;
  next_renewal_solar: string | null;
}
