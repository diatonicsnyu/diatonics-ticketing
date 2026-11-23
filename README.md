# Diatonics Ticketing

Ticket sales, donations and door check-in for the Diatonics, an independent a cappella group in New York City.

- **Buyers** buy tickets online with a card, Apple Pay, Google Pay or Cash App. Their tickets arrive by email with a QR code.
- **Volunteers** scan tickets at the door with their phones. Scanning keeps working without signal.
- **E-board** runs everything from `/admin`: shows, sales, buyers, gift tickets, donations and the expense log.

`SPEC.md` has the full spec and every decision behind it (§0 lists the decisions). `claude-notes.md` has the history of how it was built.

## What's where

| Page | Who uses it | What it does |
|---|---|---|
| `/` | Public | Upcoming shows, how tickets work, Donate |
| `/events/<slug>` | Public | One show: details, buy tickets, optional donation |
| `/donate` | Public | Donate any amount, opt-in supporters list |
| `/lost-ticket` | Public | Re-sends a buyer's tickets to their email |
| `/help` | Public | Help for buyers and donors |
| `/tickets/<key>` | Buyers | "View my tickets" (the signed link in the ticket email) |
| `/door` | Volunteers, e-board | Ticket scanner. Sign in with your username + PIN, pick the show. Works offline once loaded. Guide at `/door/help` |
| `/admin` | E-board | Dashboard: money totals, the current show, the shows list, the expense log |
| `/admin/events/<id>` | E-board | One show: Overview tab (numbers, reminders) and Edit tab (details, cancel or move the show) |
| `/admin/expenses` | E-board | Expense log |
| `/admin/settings` | E-board | People and logins: e-board, door volunteers, spenders; New PIN |
| `/admin/help` | E-board | The admin manual |
| `/admin/buyers` | E-board | Everyone who bought tickets, plus CSV downloads |
| `/admin/gift-tickets` | E-board | Free tickets for guests |
| `/admin/donations` | E-board | Every donation, the supporters list, CSVs |

Everyone signs in with a **username** (first initial + last name, e.g. `rchen`) and their **own 6-digit PIN**. E-board can use admin and the door app; door volunteers only the door app; spenders (expense log only) have no login. Manage people and PINs in admin → **Settings**. The first PINs are in `private/LOGINS.md`, which is gitignored: never commit it or share it.

## How it's built

- **Next.js 16** (App Router) + **React 19** + **Tailwind v4**, hosted on **Vercel**.
- **Supabase** (Postgres) holds all data. The browser never talks to the database: every read and write goes through the server.
- **Stripe Checkout** takes payments. The webhook (`/api/stripe/webhook`) and the confirmation page both mark orders paid; either one alone is enough.
- **Resend** sends emails: tickets, re-sends, reminders, receipts, and show-cancelled / show-moved emails. The free plan allows 100 emails a day, and the code keeps a budget so ticket emails always have room.
- **Vercel Cron** (`vercel.json`) runs `/api/cron/daily` every morning (14:00 UTC). The run:
  - keeps the free Supabase project from pausing;
  - sends reminder emails;
  - finishes any refunds and emails left over from cancelling or moving a show.

Code layout:

- `src/app/`: pages and API routes (`api/door`, `api/stripe`, `api/qr`, `api/cron`).
- `src/lib/`: everything else:
  - orders, Stripe and emails (`orders.ts`, `ticket-mail.ts`, `email/`)
  - signed QR codes and links (`ticket-token.ts`)
  - the door app (`door.ts`)
  - reminders (`reminders.ts`, `reminder-plan.ts`)
  - cancel / reschedule (`show-changes.ts`)
  - admin data (`dashboard.ts`, `event-metrics.ts`, `buyers.ts`, `donations.ts`, `expenses.ts`)
  - shared button styles (`ui.ts`)
- `src/components/`: shared pieces (site header and footer, ticket cards, admin panels, the sales chart).
- `supabase/migrations/`: every table, security rule and database function, numbered in order.
- `public/door-sw.js`: the service worker that lets `/door` open with no signal.

## Run it locally

```
npm install
npm run dev
```

Open http://localhost:3000; admin is at http://localhost:3000/admin.

Without a `.env.local`, the site runs in **demo mode**: sample shows, no real payments, saving switched off. Try `/demo/door` for the scanner.

Phones can't open `localhost`, and the camera needs https. To test the door scanner on a phone, use the Vercel site.

Before you push, check that lint and the production build pass:

```
npm run lint
npm run build
```

## Set up from scratch

1. **Supabase:** create a project. In **SQL Editor**, run every file in `supabase/migrations/` **in number order** (`0001` → `0013`). Each file says what it needs first. Then give the first e-board member a username and PIN (the original setup used the gitignored `private/set-logins.sql`); after that, everyone else is added in admin → Settings.
2. **Environment:** copy `.env.example` to `.env.local` and fill it in. Each line says where the value comes from. Add the same variables in Vercel (Project → Settings → Environment Variables). Vercel only picks up a new or changed variable on the next deploy.
3. **Stripe:** add a webhook pointing at `https://<your site>/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`

   Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. **Resend:** create an API key with Sending access. Until a domain is verified, Resend only delivers to the account's own inbox. That's why `EMAIL_TEST_TO` redirects every email there during testing.
5. Deploy to Vercel. Pushing to `main` deploys automatically.

**Never change `TICKET_SECRET` after tickets are sold.** It signs every QR code and "view my tickets" link, so changing it breaks every ticket already sent. Giving someone a new PIN (or removing them) logs them out of admin and the door app right away.

Never commit real keys. `.env.local` is gitignored.

## Going live

Test mode works end to end. To take real money:

1. **Stripe:** activate the account and switch Stripe to live mode. Then:
   - put the live key in `STRIPE_SECRET_KEY`. A restricted key (`rk_live_`) works if it has: Checkout Sessions write, PaymentIntents read, Charges read, Balance transactions read, Refunds write;
   - create the webhook again in live mode (same URL and events) and use its new `STRIPE_WEBHOOK_SECRET`;
   - turn on the same payment methods: card, Apple Pay, Google Pay, Cash App Pay.
2. **Domain:** point `ticketing.diatonics.com` at Vercel and set `NEXT_PUBLIC_SITE_URL` to it. Verify the domain in Resend, then:
   - set `EMAIL_FROM`, e.g. `Diatonics Tickets <tickets@diatonics.com>`;
   - **delete `EMAIL_TEST_TO`**. While it's set, buyers never get their emails.
3. Redeploy, so Vercel picks up the new variables.
4. Make one real $5.50 purchase with a real card: check the email, the ticket, a door scan and the dashboard.
5. **Delete the test shows** in admin before announcing anything.
6. Do a door dry run at the venue, which also checks the signal there.

## Things to know

- **Don't press "Redeploy" on an older deployment in Vercel.** It puts old code live. Every push to `main` deploys by itself. If it happens anyway, open Deployments, pick the latest one, and use **⋯ → Promote to Production**.
- **Online sales close** 30 minutes after a show starts by default (this can be changed per show).
- **Gift tickets** count against capacity. They can still be given after online sales close, as long as tickets are left.
- **Refunds:** none, except when a show is cancelled from admin. Cancelling refunds every order in full, and Stripe keeps its fees.
- **To move a show's date after tickets are sold,** use Edit → Cancel or move this show. That way buyers get an email. Changing the date in the normal edit form emails nobody.
- **Door sales** (Venmo or cash at the door) aren't handled by the site. Volunteers only count them with the +/− counter in the door app, so they show in total attendance.
- **If the 100-a-day email limit is hit,** the leftover emails go out the next morning from the daily job.
