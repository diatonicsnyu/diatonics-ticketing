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

## Who the user is

- The only technical member of the Diatonics (an NYC a cappella group, **not** school-registered).
- **The only admin, ever.** No admin user management is needed.
- Volunteers (non-technical group members) run the door with a shared PIN and need zero training.

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
- **Stripe account owner: the group president, Sophia.** She creates the account with the **group Gmail** and invites the user as a team member. **Test mode needs none of her info**, so it doesn't block building. Live activation is go-live only. (Personal vs. group EIN is still up to her.)

### Accounts & infra
- **Group Gmail** owns everything: Supabase, Stripe, Resend, Vercel, the domain. The user is getting the login from Sophia.
- **Supabase:** free tier, on a **new account under the group Gmail** (the user's personal account is at its 2-project limit). Free projects pause after ~1 week idle, so add a keep-alive.
- **Email: Resend free tier** (100/day, 3,000/month). The user is confident they won't exceed 100/day. **Resend can't send to other people without a verified domain**, so during development, emails go only to the user's own inbox.
- **Hosting: Vercel**, at `diatonics-ticketing.vercel.app` during development.
- **Domain:** the user will buy **`diatonics.com`** (it's available) **only after seeing a working localhost build**, probably on Cloudflare (~$10–11/yr). The site will be `ticketing.diatonics.com`.
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
- **Admin:** a dashboard plus a **full master list of everything** (who, when, how many, amounts, check-in status: everything except card data), CSV export, comp tickets (rarely used but should exist).
- No Apple/Google Wallet passes, no merch, no reserved seating.

### Branding
- Logo: `assets/diatonics-logo.png` (black circle, cream serif "DIATONICS", blue soundwave, eighth note).
- Colors: **light sky blue** + **burgundy**. **NOT a dark theme** ("not dark aesthetic, but still pretty"): a soft sky-blue/cream background with burgundy buttons. The dark-circle logo is the centerpiece.
- **Page-by-page details are in SPEC.md §12** (event page contents, celebratory confirmation, branded email, scanner "See history", donate page, admin dashboard). Tone: friendly + fun, puns OK.
- **Every ticket (page + email) says "GENERAL ADMISSION: first come, first served"**, so people don't expect to pick seats.
- **Heading fonts follow the logo's lettering style** (bold flared serif, all caps). Cinzel is the first candidate. Body text is a plain sans-serif: **Figtree** (user picked it over Inter, which they disliked).
- The scanner keeps green/yellow/red for results (not brand colors).

## Still open (don't block on these)
- Student ticket: group vote.
- Sophia's Stripe activation (sole proprietor vs. group EIN).
- Buying the domain (after localhost looks good).
- Venue signal at the door.
