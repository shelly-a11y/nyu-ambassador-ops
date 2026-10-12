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

## Current persistence boundary

The current GitHub Pages version still stores records in each browser's `localStorage` because no Supabase project is configured. The production shared-data design in `supabase/schema.sql` includes the seven schools, the current NYU/Columbia/Barnard roster, authenticated profiles, `submitted_by`, `school_id`, and row-level security. Members can see records only in their own school, submit records for themselves, delete their own records, and Lead/Admin users can review, update, or delete records for their school.

To activate shared mode: (1) run `supabase/schema.sql` in the Supabase SQL Editor; (2) create one `profiles` row for every authenticated user, assigning `school_id` and `role`; (3) add GitHub repository secrets named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; then rerun the Pages workflow. The workflow passes only these public client variables into the Vite build. Never commit secrets or place them in chat. GitHub Pages alone cannot provide secure shared storage or identity authentication.
