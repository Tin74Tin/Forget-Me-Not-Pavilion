-- Seed the reusable observance type lookup table.
-- lead_days follow the confirmed default: D-30, D-14, D-7, D-3, D-1, D-day (0).
-- Short-fuse milestones (頭七, 百日) use a shorter default since they occur
-- soon after death; adjust per instance if needed.

insert into observance_types (code, calendar_basis, recurrence, scope, default_label, default_lead_days) values
  ('QI_7',            'day_offset', 'once',    'per_ancestor',      '頭七 / 尾七 (first/last of the 7-day rites)', '{7,3,1,0}'),
  ('BAI_RI',          'day_offset', 'once',    'per_ancestor',      '百日 (100th day)',                             '{14,7,3,1,0}'),
  ('DUI_NIAN',        'lunar',      'once',    'per_ancestor',      '對年 (first-year memorial)',                   '{30,14,7,3,1,0}'),
  ('SAN_NIAN',        'lunar',      'once',    'per_ancestor',      '三年 / 合爐 (third-year rite)',                 '{30,14,7,3,1,0}'),
  ('DEATH_ANNIV',     'lunar',      'yearly',  'per_ancestor',      '忌日 (death anniversary)',                     '{30,14,7,3,1,0}'),
  ('ZHONGYUAN',       'lunar',      'yearly',  'per_family_group',  '中元節 (Zhongyuan / Ghost Festival)',          '{30,14,7,3,1,0}'),
  ('CNY_EVE',         'lunar',      'yearly',  'per_family_group',  '除夕 (Chinese New Year''s Eve)',               '{30,14,7,3,1,0}'),
  ('CNY_DAY',         'lunar',      'yearly',  'per_family_group',  '春節 (Chinese New Year)',                      '{30,14,7,3,1,0}'),
  ('FIRST_15TH',      'lunar',      'monthly', 'per_family_group',  '初一 / 十五 (1st & 15th of the lunar month)',  '{3,1,0}'),
  ('QINGMING',        'solar_term', 'yearly',  'per_family_group',  '清明節 (Qingming / tomb-sweeping)',            '{30,14,7,3,1,0}'),
  ('WINTER_SOLSTICE',  'solar_term', 'yearly',  'per_family_group',  '冬至 (Winter Solstice)',                       '{14,7,3,1,0}');
