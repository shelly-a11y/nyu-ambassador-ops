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
- Local persistence and CSV work-report export
