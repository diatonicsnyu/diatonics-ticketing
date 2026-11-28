# Notes for Claude (read before asking the user anything)

These notes come from the planning chat where SPEC.md was written. The user already answered a lot of questions there and **does not want to answer them again.**

## Rules for any chat working on this project

1. **Before asking a question, check SPEC.md (especially §0 Decisions) and this file.** If the answer is there, use it. Don't ask the user to confirm it.
2. **If something truly isn't covered,** pick the sensible default, write it down (in SPEC.md, marked **[assumed]**), mention it in one line, and keep going. Only stop to ask when the choice is expensive to undo (money, accounts, data loss, security).
3. **Batch questions.** One short list at the end of a step, not one at a time.
4. **Don't start building or start new sessions/steps unless the user says to.** When they ask a yes/no question, answer it. Don't act on it.
5. **Keep replies short.** The user is busy and is the only technical person in the group.
6. **Work one build step at a time** (SPEC.md §10), then stop with the checklist for the user to run.
7. **Never put secrets in code or chat.** Use `.env.local` (gitignored) + `.env.example`.
8. **Never `git commit` or `git push`.** The user does all commits and pushes themselves (said 2026-11-21: "never ever commit for me"). At the end of a step, list the changed files instead. Never run `git checkout -- <file>` or anything else that discards the user's uncommitted edits.

## Who the user is

- The only technical member of the Diatonics (an NYC a cappella group, **not** school-registered).
- **Logins = username + personal 6-digit PIN** (changed 2026-11-22; SPEC D16/D18). Username = first initial + last name (`rchen`). The same login works for admin (e-board) and the door (e-board + door volunteers); spenders have no login. People and PINs are managed in admin **Settings**. The first PINs are in `private/LOGINS.md` (gitignored: **never commit or print them**). The shared `ADMIN_PIN` and the per-show door PIN are gone.
- Volunteers (non-technical group members) run the door with **their own username + PIN** (added in admin → Settings as "Door volunteer") and need zero training (door guide at `/door/help`).

## Settled facts & decisions (with the why)

### Money
- **Prices:** General **$5** for now. A Student ticket is **pending a group vote**, so support multiple ticket types and don't ask about it.
- **Service fee: $0.50 flat per ticket**, paid by the buyer. Losing a few cents on single $9–10 orders is fine with the user.
- **All-in price display** ("$5.50 incl. $0.50 fee"). Required by NY ticket law + the FTC fee rule. The price can't go up during checkout.
- **No refunds.** "All sales final" is shown. The only exception is a cancelled show: refund everyone **or** reschedule, behind **3 confirmation steps** (the last one: type the event name).
- **Stripe Checkout** is the processor (2.9% + 30¢). Apple Pay / Google Pay come free through it.
- **No Venmo on the site.** Stripe doesn't support it (checked Stripe's payment-method support docs on 2026-11-15; Stripe's PayPal option is only for European businesses). The user considered a manual Venmo workaround and **rejected it**. Don't bring Venmo up again.
- **Door sales:** the group also sells at the door by Venmo or cash for a **higher price (~$7–8)**, to push online sales and keep the line fast. **This site does NOT process door sales.** The **only** door-sale feature is a **count-only +/− counter** in the volunteer door app (how many at-door purchases were processed); totals show in admin as part of total attendance. No payment method, amount, or names. Don't expand it. It only **shows a notice** on the event page ("Online $5.50 · At the door $8, Venmo or cash"), with the door price as a display-only field per event. Capacity math ignores door sales.
- **Cash App Pay is ON** (decided). Stripe supports it in the US at the normal rate; it's a payment-method toggle, not extra code. Checkout = cards + Apple Pay + Google Pay + Cash App Pay.
- **Donations:** checkout add-on **and** a standalone Donate button that's always on the site, even with no events. Presets $5 / $10 / $25 + custom. **The group absorbs Stripe fees on donations.** Opt-in name recognition. Never say "tax-deductible" (not a 501(c)(3)).
- **Sales tax:** none on tickets (NY exempts live musical performances). Merch is out of scope.
- **Stripe account owner: the user** (changed 2026-11-20; previously Sophia, who wasn't engaged). The user creates it and activates it under their own name at go-live, with payouts to their own bank. **Sophia gets the "View only" role** so she can see all payments and totals (transparency). Test mode needs no personal info, so this doesn't block building. If the group later gets an EIN + bank account, that likely means a new business Stripe account.

### Accounts & infra
- **Group Gmail** owns everything except Stripe: Supabase, Resend, Vercel, the domain. The user is getting the login from Sophia. Stripe is the user's own account, signed up with the user's own email **[assumed]**.
- **GitHub:** the repo is owned by the group account, **`diatonicsnyu/diatonics-ticketing`** (transferred 2026-11-20). The user commits as a collaborator. The group's Vercel imports it from there.
- **Supabase:** free tier, on a **new account under the group Gmail** (the user's personal account is at its 2-project limit). Free projects pause after ~1 week idle, so add a keep-alive.
- **Email: Resend free tier** (100/day, 3,000/month). The user is confident they won't exceed 100/day. **Resend can't send to other people without a verified domain**, so during development, emails go only to the user's own inbox.
- **Hosting: Vercel**, at `diatonics-ticketing.vercel.app` during development.
- **Domain (changed 2026-11-27):** the site is **`diatonics.therachelchen.com`**, a subdomain of the user's personal site (their Cloudflare DNS), and email comes from **`tickets@diatonics.therachelchen.com`**. The old plan to buy `diatonics.com` is dropped; don't bring it up again.
- **Phones can't open localhost, and the camera needs https,** so test the scanner on a Vercel deploy.

### Product
- **QR scan is the main check-in method;** it must be fast and **not feel like a clunky website** (full-screen installable app, camera always on, full-screen green/yellow/red result, auto-reset).
- Manual lookup is kept as a **small fallback** only.
- **Offline mode is in v1.**
- The first scan wins (screenshots/forwards).
- **Volunteers log in with a shared PIN per event.** No tutorial; a **"Get help" button** instead.
- **Buyer info:** name + email required, phone optional. **Max 10 tickets per order.**
- **Online sales close 30 min after show start** (7:30 for a 7:00 show).
- **Buyers re-send their own tickets** ("Lost your ticket?"), so volunteers never deal with it.
- **Reminder emails:** if there are >100 recipients, split across 2 days by purchase time (earliest buyers 2 days before, the rest 1 day before) to stay under Resend's limit.
- **Admin:** a dashboard plus a **full master list of everything** (who, when, how many, amounts, check-in status: everything except card data), CSV export, comp tickets (rarely used but should exist). **Call them "gift tickets" everywhere users see them** (user, 2026-11-21: doesn't like "comps"); the database keeps status `comp`. They can be given after online sales close, but only while tickets are left.
- **E-board expense log** (SPEC D33) at `/admin/expenses`, **Venmo-style since 2026-11-21**: Expense / Reimbursement buttons, name from the login, one shared red/green log, optional "I got it", per-person balances. Table `ledger_entries` (`supabase/migrations/0005_ledger.sql`, which copies over the old `expenses` rows). Only people logged into admin see it. E-board names are real ones the user gave; don't invent others.
- **Dashboard** (`/admin`) and **buyer list** (`/admin/buyers` + CSV at `/admin/buyers/csv`) for every admin (SPEC D19), built 2026-11-21. Money only counts **paid** orders.
- No Apple/Google Wallet passes, no merch, no reserved seating.

### Branding
- Logo: `assets/diatonics-logo.png` (black circle, cream serif "DIATONICS", blue soundwave, eighth note).
- Colors: **light sky blue** + **burgundy**. **NOT a dark theme** ("not dark aesthetic, but still pretty"): a soft sky-blue/cream background with burgundy buttons. The dark-circle logo is the centerpiece.
- **Page-by-page details are in SPEC.md §12** (event page contents, celebratory confirmation, branded email, scanner "See history", donate page, admin dashboard). Tone: friendly + fun, puns OK.
- **Every ticket (page + email) says "GENERAL ADMISSION: first come, first served"**, so people don't expect to pick seats.
- **Heading fonts follow the logo's lettering style** (bold flared serif, all caps). Cinzel is the first candidate. Body text is a plain sans-serif: **Figtree** (user picked it over Inter, which they disliked).
- The scanner keeps green/yellow/red for results (not brand colors).
- **Small corners only** (`rounded-sm`, 4px) on buttons, inputs, cards, badges. No pill buttons or big rounded cards: the user said they look "vibe coded" (2026-11-15).

## Where things stand (updated 2026-11-23)

**Built and deployed:** SPEC §10 steps 1–8, the keep-alive, UI round 2 (§13), help guides (§14) and personal logins (D16/D18). Every migration `0001`–`0013` has been run in Supabase (checked 2026-11-23; `0010` only adds indexes, so it couldn't be checked from outside). Production is on the latest commit. `issues-to-fix-tonight.md` is history now (everything in it is done).

**Go live (SPEC step 9, README "Going live") — what's left:**
1. ✅ **Domain + email (done 2026-11-27).** `diatonics.therachelchen.com` is on the Vercel project (CNAME on the user's Cloudflare, DNS only), the subdomain is verified in Resend, and Vercel has `NEXT_PUBLIC_SITE_URL=https://diatonics.therachelchen.com` and `EMAIL_FROM=Diatonics Tickets <tickets@diatonics.therachelchen.com>`. `EMAIL_TEST_TO` was deleted, so **test mode is off: emails go to the real buyer**. The Stripe test-mode webhook still points at the vercel.app address, which keeps working. Replies go to the group Gmail: `EMAIL_REPLY_TO=diatonics.nyu@gmail.com` in Vercel (added 2026-11-27; `src/lib/ticket-mail.ts` sends it as Resend's `reply_to`). Mail sent *to* addresses at diatonics.therachelchen.com is forwarded to the group Gmail by Cloudflare Email Routing on the user's therachelchen.com (one rule per address, e.g. tickets@; Cloudflare has no catch-all for subdomains). Until then Resend only delivers to the group Gmail, so real buyers would never get tickets.
2. ✅ **Test data cleared (2026-11-28, user OK'd):** the Stripe Test Show, all 24 test orders with their tickets/order lines/emails, the door check-in and door sign-ins, the "hi" expense. Kept: the 6 e-board people and the admin sign-in history. **Winter Concert** created the same day from the user's flyer (Sat 2026-12-12 3:00 PM NY, General $5, door $7, capacity 100, venue "Venue coming soon" until known, flyer as the image, slug `winter-concert-2026-12-12`), first as a draft; **put on sale 2026-11-28** once the live webhook had the right events. Until the venue is entered, the page's venue link and "Open in Google Maps" search for "Venue coming soon".
3. **Stripe live (2026-11-28):** Vercel now has `STRIPE_SECRET_KEY` = the live restricted key and `STRIPE_WEBHOOK_SECRET` = the live webhook's secret (kept in `.env.local` as `STRIPE_WEBHOOK_SECRET_LIVE`; the local site stays on test keys), redeployed. Live webhook: `https://diatonics.therachelchen.com/api/stripe/webhook` (its events were corrected in the dashboard by the user to the 4 checkout.session events; checked 2026-11-28). Cash App Pay is on in the account's own live payment-method config (the other "Default" config belongs to a connected app). Sophia: the group Gmail was given View only (her personal email isn't known).
4. One real $5.50 purchase with a real card, then a door dry run at the venue (checks the signal).
5. Ticket types: the Student ticket is still a group vote (General $5 works today).
6. Vercel Hobby's terms are for non-commercial use; mention once at go-live that the group may need Vercel Pro if Vercel objects (don't re-litigate the hosting choice).

**Keys and access:**
- Vercel API access: `VERCEL_TOKEN` in `.env.local` (the user OK'd reading logs + changing env vars). Project `prj_dfEFAjcxRcUDNF0vrZqrZ9xKJrhv`, team `team_PdjZdzRhOR1evA6tlpPTpLEm`. The runtime-logs endpoint only streams live requests, not past errors.
- **Stripe live key = a restricted key (`rk_live_`)**: the user's new account only offers restricted keys. It's in `.env.local` as `STRIPE_RESTRICTED_KEY` and was checked in live mode without charging anyone (create/read/close Checkout Sessions, read PaymentIntents/Charges/Balance transactions, create Refunds all work). On go-live day it goes into `STRIPE_SECRET_KEY` in Vercel. Test mode is still what the site uses.
- `CRON_SECRET` is in `.env.local` + Vercel. `ADMIN_PIN` is no longer used (can be deleted from Vercel).
- First login PINs: `private/LOGINS.md` (gitignored). Never commit, print or paste them.

**Things to remember:**
- **Never press "Redeploy" on an old Vercel deployment:** on 2026-11-21 an old commit got redeployed to production and took the door app + emails offline until the latest deployment was promoted again.
- Resend test mode: `EMAIL_TEST_TO` (the group Gmail) receives every email, with a "[Test]" subject and a yellow banner naming the real recipient.
- Stripe's bot check blocks automated browsers from pressing Pay, so any real payment test needs the user.
- Stripe test-mode payment methods are on the account's own default config (card + Cash App); see SPEC step 2 "As built".
- The user said they still want "small admin changes" (not specified yet, 2026-11-22). Wait for them.
- Still open from the group: Student ticket vote, venue signal at the door.

**History (what was built when; details in each SPEC "As built"):** step 3 emails + "Lost your ticket?" (first real test payment EB36 worked 2026-11-21) · step 4 door scanner · step 5 offline · keep-alive (Vercel Cron `/api/cron/daily`, 14:00 UTC) · step 6 admin tools (gift tickets = the user's name for comps) · step 7 donations · step 8 reminders + cancel/reschedule — all 2026-11-21 · UI round 2 (§13), help guides (§14), personal logins — 2026-11-22 · Stripe live key checked — 2026-11-23.
