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

The shared mode is not active yet. To activate it, apply `supabase/schema.sql` to a Supabase project, provision each user's `profiles` row, and provide `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY` to the deployment. Those provider credentials are intentionally not committed to this repository. GitHub Pages alone cannot provide secure shared storage or identity authentication.
