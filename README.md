# Prayers Reminder

An admin app for you to manage multiple unrelated families' ancestor prayer
reminders — lunar-calendar death anniversaries, first-year mourning
milestones (頭七, 百日, 對年, 三年), family-wide festivals (CNY, 中元, 清明,
冬至), and temple/columbarium renewal fees — delivered over WhatsApp on a
D-30/14/7/3/1/D-day schedule.

Families themselves don't log in; you manage everything from the admin app,
and they just receive WhatsApp messages.

Two tiers of admin can use the app: **super admin** (full access) and any
number of **data-entry admins**, who can add new records but never edit or
delete anything — their entries land as pending until you approve them.
See "Admin roles" below.

## Architecture

- **Supabase** — Postgres database, auth (your admin login only), and an
  Edge Function that runs once a day to compute what's due and send WhatsApp
  messages.
- **Next.js admin app** — the screens you use to add families, ancestors,
  and members. Deploy it anywhere that runs Next.js, or just run it locally.
- **Twilio WhatsApp** — the delivery channel for reminders.

The reminder engine (the Edge Function + `pg_cron`) lives entirely inside
Supabase and runs independently of where the admin app is hosted.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project. Note
   the **project ref**, **anon key**, and **service role key** (Project
   Settings → API).
2. In **Authentication → Providers**, make sure Email is enabled, and in
   **Authentication → Settings**, turn **off** "Allow new users to sign up" —
   this app is single-admin, so you don't want a public sign-up form.
3. In **Authentication → Users**, manually create your own account (or use
   `supabase auth` locally — see below). This is the only login the app
   will ever have.

## 2. Install the Supabase CLI and link the project

```bash
npm install -g supabase
supabase login
cd prayers-reminder
supabase link --project-ref YOUR-PROJECT-REF
```

## 3. Run the database migrations

```bash
supabase db push
```

This creates all tables, the scope-enforcement trigger (what prevents a
family-wide occasion like CNY or Zhongyuan from ever being duplicated per
ancestor), the idempotency function, row-level security policies, the
two-tier admin roles system, and seeds the observance types + starting
ritual instructions.

If you'd rather run it by hand: the SQL files are in `supabase/migrations/`,
in order — paste each into the Supabase Dashboard's SQL Editor.

### Bootstrap your super admin

Migration `0005` sets up the `admin_users` table with row-level security
that only lets an existing super admin add the next one — which means the
very first row can't go in through the app. Create it directly, once, via
the Supabase Dashboard's **SQL Editor** (this connects as the project
owner, which bypasses RLS):

1. Create your own login the normal way: **Authentication → Users → Add
   user**, with your email. Copy its **User UID**.
2. In the SQL Editor, run:
   ```sql
   insert into admin_users (id, name, role)
   values ('paste-your-user-uid-here', 'Your Name', 'super_admin');
   ```
3. Sign in to the admin app with that account — you're now the super admin,
   and everything you add is auto-approved.

From here on, adding further admins (of either tier — there's no limit on
how many) is a normal in-app step: **Authentication → Users → Invite
user** for their account, then the app's **Admins** page to register their
role by email. See "Admin roles" below.

## 4. Set up Twilio WhatsApp

**For quick end-to-end testing (sandbox):**
1. Create a [Twilio](https://www.twilio.com) account, grab your **Account
   SID** and **Auth Token** from the console.
2. Go to Messaging → Try it out → Send a WhatsApp message, and follow the
   instructions to join the sandbox (send a join code from your own phone to
   the Twilio sandbox number).
3. Any WhatsApp number that has joined the sandbox can now receive free-form
   test messages from your app.

**For real production sends (required eventually):** WhatsApp Business API
does **not** allow free-form business-initiated messages outside a 24-hour
window after the recipient last messaged you. Since these reminders are
proactive, you'll need an **approved message template**:
1. In the Twilio Console, go to Messaging → Content Template Builder and
   create a template with one text variable (e.g. `Your reminder: {{1}}`).
2. Submit it for WhatsApp approval (usually a day or two).
3. Once approved, set `TWILIO_CONTENT_SID` to that template's SID — the
   Edge Function automatically switches from free-form `Body` to the
   template when this is set.
4. You'll also need your own approved WhatsApp Business sender number
   (rather than Twilio's shared sandbox number) — see Twilio's WhatsApp
   senders documentation.

## 5. Configure the Edge Function's secrets

```bash
supabase secrets set \
  SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_AUTH_TOKEN=your-twilio-auth-token \
  TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 \
  DEFAULT_TIMEZONE=Asia/Singapore
```

(Add `TWILIO_CONTENT_SID=...` once you have an approved template.)

## 6. Deploy the Edge Function

```bash
supabase functions deploy daily-reminders
```

## 7. Schedule it to run daily

Simplest option — in the Supabase Dashboard: **Edge Functions →
daily-reminders → Cron**, and set it to run once a day (e.g. `0 0 * * *` for
midnight UTC — pick a time that lands in the early morning in
`Asia/Singapore`, since many families observe 忌日 before noon).

Alternative — `pg_cron` + `pg_net` from SQL, if you prefer everything
version-controlled in a migration: enable both extensions in **Database →
Extensions**, then schedule an HTTP call to the function URL with your
service role key in the `Authorization` header. Store the key in Supabase
Vault rather than hardcoding it in a migration file.

You can also trigger it manually any time to test: **Edge Functions →
daily-reminders → Invoke**.

## 8. Run the admin app

```bash
npm install
cp .env.example .env.local
# edit .env.local with your Supabase URL + anon key
npm run dev
```

Open `http://localhost:3000`, sign in with the account you created in step 1.

To deploy it properly (so you can use it from anywhere), push this repo to
GitHub and deploy with Vercel, Netlify, or any Next.js-compatible host —
just set the two `NEXT_PUBLIC_SUPABASE_*` environment variables there too.

## 9. Push to GitHub

```bash
git init
git add .
git commit -m "Initial scaffold"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/prayers-reminder.git
git push -u origin main
```

(`.env.local` is already gitignored — never commit real keys.)

## Admin roles

- **Super admin** — full read/write/delete access everywhere, including
  approving/rejecting pending entries and managing other admins.
- **Data entry** — can add new family groups, ancestors, members,
  observance instances, and facility renewals, and can propose edits to
  ritual templates. Everything they add lands as `pending` and is
  invisible to the reminder engine until a super admin approves it on the
  **Approvals** page. They can never edit or delete any row — not even
  something they just created themselves.

There's no cap on how many admins of either tier you add. To add one:
**Authentication → Users → Invite user** in the Supabase Dashboard (this
sends them a magic-link email and creates their account — public sign-up
stays disabled), then go to the app's **Admins** page and register their
name, email, and role. The **Approvals** page is where a super admin
reviews everything pending — family records and proposed ritual-template
edits alike.

## Using the app

1. **Family Groups** → add a family (e.g. "Tan family — paternal side"),
   pick their dialect for terminology, set a default D-day send time.
2. Inside that group: **"Set up CNY / Zhongyuan / Qingming / Winter
   Solstice"** once — this creates exactly one instance per occasion for
   the whole group, never duplicated per ancestor.
3. **Add family members** — name, relationship, role (keeper can edit
   ancestor records; organizer can edit rituals; member just receives
   reminders), and WhatsApp number.
4. **Add ancestors** — enter the date of death either as a Gregorian date
   (most common — it converts to lunar automatically) or directly as a
   lunar date if that's what's known. The annual 忌日 is always set up
   automatically; optionally also add 對年, 三年, 百日, and 頭七–尾七.
5. Optionally add **facility/niche renewal reminders** per ancestor for
   temple or columbarium fees — these go only to keepers/organizers, not
   the whole family.
6. **Ritual Templates** — edit the offerings/sequence/invocation text sent
   with each occasion's D-day reminder. Shared across all families.
7. **Dashboard** shows a live-computed preview of everything coming up —
   independent of whether the daily job has run yet.

## Notes on the reminder engine

- Every occasion sends at **D-30, D-14, D-7, D-3, D-1, and D-day**.
- A retried/re-run of the daily job never double-sends — each
  (occasion, person, lead day, year) combination can only be claimed once
  (`notifications` table, enforced by a unique index).
- If several things are due for the same person on the same day, they get
  **one bundled WhatsApp message**, not several.
- If a WhatsApp send fails, the job retries once via the person's secondary
  contact (if one is set) before marking it failed.
- One-time milestones (頭七, 百日, 對年, 三年) fire once and then stop —
  the annual 忌日 is independent and continues indefinitely.
- Only `approved` rows are ever picked up — a data-entry admin's pending
  entries sit invisibly until a super admin approves them on the
  Approvals page, so nothing half-entered ever reaches a family's phone.
