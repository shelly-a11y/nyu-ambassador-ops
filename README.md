# NYU Ambassador Ops

A bilingual, client-side operations dashboard for the NYU campus ambassador team.

## Run locally

```bash
npm install
npm run dev -- --host 0.0.0.0
```

The app stores records in browser `localStorage`, so it is immediately usable as a local prototype without credentials or a backend.

## Included flows

- English / Chinese one-click language switch
- Overview dashboard with hours, UGC, posters, team, and pending review metrics
- Weekly work, UGC review, and poster posting views
- Add-record modal with type-specific fields and validation
- Delete action with confirmation for submitted records
- Local persistence and CSV work-report export

## Current persistence boundary

The current GitHub Pages version stores records in each browser's `localStorage`. The production shared-data design is prepared in `supabase/schema.sql`: authenticated profiles are assigned to one school, records carry `submitted_by` and `school_id`, and row-level security allows submitters to delete their own records while Lead/Admin users can manage records for their school.

To activate the shared mode, apply `supabase/schema.sql` to a Supabase project and provide `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY` to the deployment. Those provider credentials are intentionally not committed to this repository.
