-- Starting ritual instructions per occasion — editable afterward from the
-- admin app's Ritual Templates page. These are general defaults; regional/
-- dialect practices vary, so treat them as a starting point, not doctrine.

insert into ritual_templates (type_code, location, offerings_json, sequence_json, invocation_template, notes, taboos) values
(
  'QI_7', 'home altar',
  '{"incense": "3 sticks per person", "dishes": "simple vegetarian offering is common"}',
  '["Light incense", "Present a simple offering", "Recite prayers for the deceased''s passage", "Bow"]',
  'Prayers for {ancestor_name} on this 7-day interval.',
  'Observed every 7 days from death through day 49 (頭七 to 尾七/滿七). Practices vary by dialect group on which intervals are marked most solemnly.',
  null
),
(
  'BAI_RI', 'home altar',
  '{"incense": "3 sticks per person", "dishes": "3 or 5 dishes"}',
  '["Light incense", "Present offerings", "Bow 3 times", "Burn joss paper"]',
  '100-day prayers for {ancestor_name}.',
  null, null
),
(
  'DEATH_ANNIV', 'home altar or grave',
  '{"incense": "3 sticks per person", "candles": "1 pair", "dishes": "3 or 5 dishes, the ancestor''s favourite foods", "fruit": "an odd number of kinds", "tea_or_wine": "3 cups, poured in 3 rounds", "joss_paper": "standard ancestral joss paper"}',
  '["Light the candles", "Light incense, 3 sticks per person", "Invite the ancestor''s spirit to the altar", "Present the food and offerings", "Bow 3 times", "Pour tea or wine, 3 rounds", "Burn the joss paper once incense has burned down", "See off the spirit"]',
  'Praying to {ancestor_name}, from {descendant_names}, on this day of remembrance.',
  'Many families observe this rite before noon (午前).',
  'Do not stand incense sticks upright in food. Avoid an even number of dishes.'
),
(
  'DUI_NIAN', 'home altar',
  '{"incense": "3 sticks per person", "candles": "1 pair", "dishes": "5 dishes", "joss_paper": "including mourning-release paper"}',
  '["Light candles and incense", "Present offerings", "Bow 3 times", "除服: symbolically remove mourning attire/restrictions if not already done", "合爐: move the spirit tablet to the main ancestral altar, if being done today", "Burn joss paper", "See off the spirit"]',
  'Marking the first-year memorial for {ancestor_name}.',
  '對年不對日 — the exact day matters less than landing in the correct lunar month; bring the date forward rather than delaying it. Often combined with 三年 into one early ceremony.',
  null
),
(
  'SAN_NIAN', 'home altar',
  '{"incense": "3 sticks per person", "candles": "1 pair", "dishes": "5 dishes"}',
  '["Light candles and incense", "Present offerings", "Bow 3 times", "合爐: move the spirit tablet into the main ancestral altar/incense pot, if not already done at 對年", "Burn joss paper"]',
  'Marking the third-year rite for {ancestor_name}.',
  'Falls at roughly 2 real years after death by traditional inclusive counting. Many families combine this with 對年.',
  null
),
(
  'ZHONGYUAN', 'home altar',
  '{"incense": "3 sticks per person", "dishes": "extra portions, including offerings for wandering spirits", "joss_paper": "extra quantity"}',
  '["Light incense", "Present offerings for the family''s ancestors", "Set aside a separate offering for wandering spirits outside the main altar", "Burn joss paper", "See off the spirits"]',
  'Praying to the ancestors of the {family_group_name} family during Zhongyuan.',
  'Covers every ancestor in the family group in one rite — no need to repeat per ancestor.',
  null
),
(
  'CNY_EVE', 'home altar',
  '{"dishes": "reunion dinner offered to the ancestors first", "incense": "3 sticks per person"}',
  '["Set up the altar before the reunion dinner", "Light incense", "Invite the ancestors to join the meal", "Present the reunion dinner dishes", "Bow 3 times"]',
  'Inviting the ancestors of the {family_group_name} family to join the New Year''s Eve reunion.',
  null, null
),
(
  'CNY_DAY', 'home altar',
  '{"incense": "3 sticks per person", "dishes": "auspicious foods"}',
  '["Light incense", "Present New Year offerings", "Bow 3 times", "Burn joss paper"]',
  'New Year prayers for the ancestors of the {family_group_name} family.',
  null, null
),
(
  'FIRST_15TH', 'home altar',
  '{"incense": "3 sticks", "fruit": "simple offering"}',
  '["Light incense", "Present a simple offering", "Bow"]',
  'Monthly prayers for the ancestors of the {family_group_name} family.',
  'Lighter than the major occasions — a brief daily-altar rite.',
  null
),
(
  'QINGMING', 'grave / columbarium',
  '{"tools": "cleaning tools for the grave", "incense": "3 sticks per person", "joss_paper": "standard quantity", "flowers": "optional"}',
  '["Clean the grave/niche and surrounding area", "Light incense", "Present offerings", "Bow 3 times", "Burn joss paper"]',
  'Tomb-sweeping for the ancestors of the {family_group_name} family.',
  'A fixed solar-calendar date (~Apr 4-5), not a lunar one.',
  null
),
(
  'WINTER_SOLSTICE', 'home altar',
  '{"dishes": "tangyuan (glutinous rice balls) traditionally offered first", "incense": "3 sticks per person"}',
  '["Light incense", "Present tangyuan and other offerings", "Bow 3 times"]',
  'Winter Solstice prayers for the ancestors of the {family_group_name} family.',
  'A fixed solar-calendar date (~Dec 21-22), not a lunar one.',
  null
);
