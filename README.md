# diatonics-ticketing

Ticketing + donations site for the Diatonics. See `SPEC.md` for what it does and why.

## Run it locally

```
npm install
npm run dev
```

Open http://localhost:3000. Admin is at http://localhost:3000/admin.

Without a `.env.local` the site runs in **demo mode** (sample shows, saving off).
To use the real database, copy `.env.example` to `.env.local`, fill in the keys,
and run the SQL files in `supabase/migrations/` (in order) in Supabase's SQL Editor.

## Where things are

- `src/app/`: pages (home, events, admin, login)
- `src/lib/`: database access, admin check, money/time helpers
- `supabase/migrations/`: database tables and security rules
