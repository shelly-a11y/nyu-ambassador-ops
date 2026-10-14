# NYU Ambassador Ops

A bilingual, client-side operations dashboard for the NYU campus ambassador team.

## Run locally

```bash
npm install
npm run dev -- --host 0.0.0.0
```

The app can run as a local prototype in browser `localStorage`, but shared multi-user mode requires the Supabase setup described below.

## Included flows

- English / Chinese one-click language switch
- Overview dashboard with hours, UGC, posters, team, and pending review metrics
- Weekly work, UGC review, and poster posting views
- Add-record modal with type-specific fields and validation
- Delete action with confirmation for submitted records
- Local persistence and CSV work-report export

## Access model

- Anyone can sign in with an email magic link, but only **approved** emails get a profile.
- New users fill in name + school and wait; the admin approves them in **Members & approvals** (or pre-approves an email).
- Ambassadors submit records and reimbursements as `pending`, see their school's records, and see only their own reimbursements.
- Leads review records and reimbursements for their school; admins see and manage every school.
- Reimbursements (printing, tools, event budget, transport, food, other) support receipt upload to a private `receipts` bucket.
- Every table exports to CSV (UTF-8 with BOM, opens cleanly in Excel / Lark Sheets).

## Setup

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Replace `YOUR_EMAIL@example.com` at the bottom of `supabase/migrations/002_approval_and_reimbursements.sql` with the admin email, then run it.
3. Add GitHub secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable key only) and rerun the Pages workflow.
4. In Supabase Auth → URL Configuration, set the Site URL and a Redirect URL to the GitHub Pages address.
