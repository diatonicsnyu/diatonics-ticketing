# Diatonics Ticketing — Spec (v0.3, draft)

_Status: draft · Started 2026-11-15 · Last updated 2026-11-15_

> Everything in this spec has been reviewed by you unless marked **[assumed]** (small technical defaults you can still change). **[pending]** means you're waiting on someone else.

## 0. Decisions

### Product
| # | Decision |
|---|---|
| D1 | **QR scan is the main check-in method.** Must be fast and must not feel like a clunky website. |
| D2 | **Ticket types:** General at **$5** for now. General + Student is **[pending]** a group decision, so the system supports multiple ticket types either way. |
| D3 | **Service fee: $0.50 flat per ticket**, paid by the buyer. |
| D4 | **All-in price display**, e.g. "$5.50 (includes $0.50 service fee)". Required by NY ticket law (2022) and the FTC fee rule (2025). |
| D5 | **Max 10 tickets per order.** |
| D6 | **Buyer info:** name + email required, phone optional. |
| D7 | **Online sales stay open until 30 minutes after show start** (e.g. 7:30pm for a 7pm show). Configurable per event. |
| D8 | **No refunds.** The only exception is a cancelled show (D20). |
| D9 | **Donations:** optional add-on at checkout **and** a standalone donate button that's always on the site, even when no event is listed. |
| D10 | **Donation amounts:** $5 / $10 / $25 + custom. |
| D11 | **The group absorbs Stripe fees on donations** (the donor pays exactly what they pick). |
| D12 | **Donor recognition:** opt-in, with a "name to display" field. |

### Door
| # | Decision |
|---|---|
| D13 | **Offline mode is in v1.** |
| D14 | **Manual lookup is kept as a small fallback** on the scanner screen. |
| D15 | **Screenshots / forwarded tickets: the first scan wins.** |
| D16 | **Volunteers log in with a shared door PIN** (one PIN per event). |
| D17 | **No tutorial; a "Get help" button instead.** Volunteers must be able to use it with no training. |

### Admin & email
| # | Decision |
|---|---|
| D18 | **You are the only admin, ever.** You're the only one who creates events and manages things. No admin user management needed. |
| D19 | **Admin tools:** sales dashboard, a full master list of every buyer and order (everything except card info), comp tickets (rarely used, but available), CSV export. No refund button (D8). |
| D20 | **Cancelled show:** two options, **refund everyone** or **reschedule** (tickets carry over). It takes **3 confirmation steps** so it can't happen by accident. |
| D21 | **Reminder emails:** split across 2 days if there are more than 100 recipients (earliest buyers 2 days before, the rest 1 day before) to stay under Resend's limit. |
| D22 | **Buyers re-send their own tickets** ("Lost your ticket?" page), so volunteers never have to. |
| D23 | **Email via Resend, free tier** (~3,000/month, 100/day). |

### Setup
| # | Decision |
|---|---|
| D24 | **Stripe + bank account owner: the group president.** **[pending]** her setup (see §5.4). |
| D25 | **Supabase: a new account under a group email.** Use the same group email for Stripe, Resend, Vercel and the domain. |
| D26 | **URL: `diatonics-ticketing.vercel.app` (and localhost) during development.** If the build is good, you'll buy **`diatonics.com`** yourself (it's available) and use **`ticketing.diatonics.com`** (free subdomain, set up with a DNS record pointing to Vercel). Resend verifies the same domain for email, e.g. `tickets@diatonics.com`. ⚠️ Until then, email only reaches your own inbox, see §7.1. |
| D27 | **Location: New York City; not school-registered.** |
| D29 | **No Venmo on the site.** Stripe doesn't offer it (checked Stripe's payment-method docs 2026-11-15). Online payments are Stripe only. |
| D31 | **Door sales (Venmo or cash, ~$7–8) happen outside this system.** The site doesn't sell, track, or count them. It only **displays a notice** on the event page, e.g. "Online $5.50 · At the door $8 (Venmo or cash)." The higher door price pushes people to buy online and keeps the door line fast. The door price is a per-event text/number field in admin, shown only. |
| D32 | **Door-sale counter (count only).** The door app has a simple **+ / −** counter where volunteers record how many at-door purchases they processed. Nothing else: no payment method, no amount, no names. Totals sync across devices and show in admin. |
| D30 | **Cash App Pay is on** in Stripe Checkout (US, same 2.9% + 30¢, no extra code: enable it in Stripe's payment method settings). Checkout offers cards, Apple Pay, Google Pay, and Cash App Pay. |
| D28 | **Branding:** logo at `assets/diatonics-logo.png`; group colors are **light sky blue** and **dark red/burgundy**. See §11. |

---

## 1. Goal

A small, low-cost web platform for Diatonics a cappella concerts. People buy tickets by card or donate, get their tickets by email, and are checked in at the door with a fast QR scan. Volunteers can use it with no training. One admin (you) runs everything.

### Non-goals (v1)
- Reserved seating (general admission only)
- Multiple groups/organizations
- Native apps (the scanner is an installable web app)
- Merch (would trigger NYC sales tax of 8.875% and require registering with the state)
- Apple/Google Wallet passes
- Multiple admin accounts (D18)

## 2. Users & roles

| Role | Who | How they get in | Can do |
|---|---|---|---|
| **Buyer / donor** | Audience | No account | Buy tickets, donate, view tickets, re-send own tickets |
| **Door volunteer** | Any group member | Shared per-event PIN (D16) | Scan, manual lookup, check in. Nothing else. |
| **Admin** | You only (D18) | Personal login: magic link by email **[assumed]** | Everything |

## 3. Flows

### 3.1 Home page
- Upcoming events (if any).
- **"Donate" button, always visible**, even with no events listed (D9).
- "Lost your ticket?" link (D22).

### 3.2 Ticket purchase
1. Event page: title, date/time, venue, description, tickets remaining. Prices shown **all-in** (D4). Includes the door-price notice: "Or pay $X at the door (Venmo or cash)." Online buying is the highlighted option (D31).
2. Pick quantity (max 10, D5) per ticket type.
3. Optional "Add a donation": $5 / $10 / $25 / custom (D10).
4. Name + email (required), phone (optional) (D6).
5. Stripe hosted checkout (cards, Apple Pay, Google Pay, Cash App Pay).
6. Stripe's webhook confirms payment, then the order and tickets are created and the email is sent.
7. Confirmation page shows the tickets plus a link to view them later.

**Rules**
- Inventory held **30 minutes** during checkout (Stripe Checkout's minimum session length; you OK'd this). Only matters if an event has a capacity.
- Sales close 30 minutes after show start by default (D7).
- "No refunds, all sales final" is shown on the event page and at checkout (D8).

### 3.3 Standalone donation (D9)
- Reachable from the home page anytime, with or without events.
- $5 / $10 / $25 / custom (D10). The donor pays exactly that amount; the group absorbs Stripe's fee (D11).
- Optional "Thank me by name" checkbox + display-name field (D12).
- Name + email for the receipt.
- Receipt email: thanks, amount, date. **Must not say or imply the donation is tax-deductible** (the group isn't a 501(c)(3)).

### 3.4 Ticket email
- Sent via Resend right after payment.
- Event name, date/time, venue + map link, buyer name, order number.
- **"GENERAL ADMISSION: first come, first served"** on every ticket.
- Each ticket's **QR code** (hosted image or attachment, not inline data-URI) + **short code** (e.g. `DIA-7K3F-Q9`) **[assumed format]**.
- "Turn your screen brightness up at the door" tip.
- "All sales final" line.
- Link to view tickets on the web.

### 3.5 Self re-send (D22)
- "Lost your ticket?" page: buyer enters their email, and if it matches orders, the tickets are re-sent to **that email only** (never shown on screen, so nobody can look up someone else's tickets).
- Rate-limited (e.g. 3 per email per hour) **[assumed]**. Re-sends count toward the 100/day limit.

### 3.6 Reminder emails (D21)
- You trigger reminders from the admin page (or schedule them).
- If there are ≤ 100 recipients, all are sent 1 day before.
- If there are > 100, they're split by purchase time: earliest buyers get it **2 days before**, the rest **1 day before**.
- **Daily email budget:** purchases and re-sends on the same day also use the 100/day limit. Reminders use at most ~80/day, leaving ~20 for new orders and re-sends **[assumed numbers]**.
- Contents: event details, "your tickets are attached / here", brightness tip.

### 3.7 Door check-in (D1, D13–D17)
**Getting in**
- Volunteer opens `/door`, adds it to the home screen, and enters the event's PIN.

**Before doors open (needs signal once)**
- The app downloads that event's guest list (ticket IDs, names, types, statuses) for offline use (D13).
- It shows "Ready: 180 tickets loaded."

**Scanning**
- Full-screen app, **camera always on**, no "tap to scan."
- Result fills the screen for ~1.5 seconds and then auto-resets:
  - 🟩 **Valid**: name, ticket type, "Checked in" + vibration
  - 🟨 **Already used**: when and on which device
  - 🟥 **Invalid / wrong event / void**
- Target: ~1 second per person.
- Live count: "142 / 180 checked in."
- Online / offline indicator.

**Offline behavior (D13)**
- Scans are checked against the downloaded list and saved on the device.
- When signal returns, check-ins sync to the server and the other devices.
- ⚠️ **Limitation:** if two devices are offline at the same time, the same ticket could get in once at each. The server flags these as duplicate check-ins after sync. The fix is to keep scanners online when possible and use offline as a backup.
- People who bought tickets after the list was downloaded: their tickets show as "not found offline, check online / manual lookup." The app refreshes the list automatically whenever it has signal.

**Door-sale counter (D32)**
- A small "Door sales: 12  [−] [+]" control on the scanner screen. Each tap = one person who paid at the door.
- Count only. It doesn't touch tickets, doesn't change online capacity, and records no payment details.
- Works offline; the counts from all devices are added up when they sync.
- Admin dashboard shows: scanned check-ins, door sales count, and **total attendance** (both added together).

**Manual lookup (D14)**
- Small button: search by name, email, or short code, then tap to check in.

**Get help (D17)**
- A "?" button opens a one-screen plain-language guide: what each color means, what to do about a dead phone, "not found," or "already used."
- No tutorial by default.

**Rules**
- First scan wins (D15). Only the admin can undo a check-in.
- Volunteers can't see revenue, emails, or anything beyond the door list.

### 3.8 Admin (you, D18–D20)
- **Events:** create/edit name, date/time, venue, description, image, capacity, ticket types + prices, sales close time (default show start + 30 min), door PIN.
- **Dashboard:** tickets sold per type, donations, gross, service fees, Stripe fees, net, live check-in count.
- **Master list:** every order, with buyer name, email, phone, purchase time, quantity per type, amounts (tickets / service fee / donation / total), check-in status per ticket, donor display name. Searchable and sortable. Everything except card info (we never have it).
- **Comp tickets:** issue free tickets to a name + email; emailed like normal tickets; count against capacity.
- **CSV export:** orders, tickets, donations, donor-recognition list.
- **Reminders:** preview and send/schedule (§3.6).
- **Undo a check-in.**
- **Cancel show (D20):** choose either
  - **Refund everyone:** refunds every paid order through Stripe and emails buyers. Stripe keeps its fees, which the group pays (~$0.45–$0.60 per order).
  - **Reschedule:** pick the new date/time; tickets stay valid; buyers are emailed the new date.
  - **3 confirmation steps:** (1) choose action → (2) review summary ("This will refund 87 orders, $478.50") → (3) type the event name to confirm.

## 4. Ticket verification **[assumed]**
- Each ticket gets a random 128-bit ID.
- The QR code holds a **signed** token (HMAC), so forged codes are rejected even offline.
- The server is the source of truth; check-ins are recorded atomically when online.
- Short code: 8–10 characters, no look-alike characters (0/O, 1/I).

## 5. Payments, fees & tax

### 5.1 Processor
**Stripe** hosted Checkout. Webhooks drive order creation, emails, and refund status.

### 5.2 Ticket fees (D3)
Stripe: 2.9% + 30¢ per order (verify current rate). Buyer pays $0.50 per ticket.

| Ticket | Buyer pays | Kept (1-ticket order) |
|---|---|---|
| $5 | $5.50 | $5.04 |
| $6 | $6.50 | $6.01 |
| $7 | $7.50 | $6.98 |
| $8 | $8.50 | $7.95 |
| $9 | $9.50 | $8.92 |
| $10 | $10.50 | $9.90 |

Multi-ticket orders come out further ahead, since the 30¢ is charged once per order.

### 5.3 Donation fees (D11)
The group absorbs them: a $5 donation nets ~$4.55, $10 nets ~$9.41, and $25 nets ~$23.98. When a donation is added to a ticket order, Stripe charges its 30¢ only once for the whole order.

### 5.4 Account ownership (D24)
- The president owns the Stripe and bank accounts. **She should create the Stripe account herself** (entering her own SSN/bank details) and then **invite you as a team member** (Stripe supports Developer/Admin roles). That way you never need to collect her personal info.
- ⚠️ If she signs up as an individual/sole proprietor, ticket and donation money counts as **her personal income**. The cleaner version: she gets a free **EIN** for the group (as an "unincorporated association") with herself as the responsible party, and Stripe + the bank account go under the EIN.
- IRS 1099-K reporting starts at $20,000 **and** 200 transactions per year, which is unlikely to be reached. _Not tax advice._
- Plan for a handoff when presidents change: with an EIN, the account stays with the group.

### 5.5 Sales tax (D27)
- NY exempts admission to **live musical performances**, so no sales tax on tickets. *(Confirm with NY's sales tax guidance on "places of amusement".)*
- Exception: venues serving food or drink during the show ("roof garden/cabaret") are taxable.
- Donations: no sales tax.

## 6. Data model (draft) **[assumed]**
- **DoorSaleCount**: event_id, device_id, delta (+1 / −1), created_at (the sum = door sales)
- **Event**: id, name, slug, description, venue, starts_at, doors_at, capacity, door_price_cents (display only, nullable), sales_close_at, door_pin_hash, status (draft / on_sale / closed / cancelled / rescheduled)
- **TicketType**: id, event_id, name, price_cents, quantity_limit
- **Order**: id, event_id (null for standalone donations), buyer_name, buyer_email, buyer_phone, tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents, stripe_fee_cents, status (pending / paid / refunded / comp), payment_method (stripe / comp), stripe_session_id (nullable), created_at
- **Ticket**: id, order_id, ticket_type_id, short_code, status (valid / checked_in / void), checked_in_at, checked_in_device
- **Donation**: id, order_id, amount_cents, recognize (bool), display_name, created_at
- **CheckInLog**: ticket_id, device_id, action (check_in / undo), timestamp, synced_at, conflict (bool)
- **EmailLog**: order_id, type (ticket / resend / reminder / cancel / reschedule / donation_receipt), sent_at (used for the 100/day budget)

## 7. Stack & costs

| Piece | Choice | Cost |
|---|---|---|
| Payments | Stripe (president's account, D24) | Per-transaction only |
| Email | Resend free (D23) | $0 |
| Database | Supabase free, group account (D25) | $0. Pauses after ~1 week idle, so it needs a keep-alive ping |
| Hosting | Vercel, `diatonics-ticketing.vercel.app` (D26) | $0 |
| Domain | **[pending]** leadership | ~$10–20/year |

### 7.1 ⚠️ Email needs a domain
Resend only sends to **other people's** inboxes from a domain you own and verify. You **can't verify a `.vercel.app` address**, so without a domain Resend can only send test emails to your own inbox.

Options:
1. **Buy a domain before launch** (~$10–20/year). Recommended; mention this when you ask leadership.
2. **Free fallback:** send from a **group Gmail** account via SMTP with an app password, using the same group email as D25. Gmail allows ~500 emails/day for free, which is more than Resend's 100/day, but it's less reliable to build on and could get rate-limited or flagged. Fine as a stopgap.

The site itself works fine on `.vercel.app`; it's only email that needs this.

## 8. Non-functional
- **Volunteer-proof:** usable with no training (D17); big tap targets, plain language, color + icon + text for every result.
- **Fast:** a scan result in under ~1 second online.
- **Mobile-first** for buyers and the door.
- **Cost:** $0/month plus a domain if approved.
- **Scale:** hundreds of tickets per show, 2–4 scanners.
- **Security:** HTTPS; signed QR codes; per-event door PIN, changeable, with rate-limited attempts; admin pages for you only; re-sends go only to the email on file.
- **Privacy:** collect only name, email, optional phone; simple privacy note; never share or sell data.
- **Accessibility:** good contrast, screen-reader friendly.
- **Handoff:** you're the only technical member, so keep a short `ADMIN-GUIDE.md` for whoever takes over someday.

### 6.1 Step 1 defaults **[assumed]**
- Admin login is a magic link sent to `ADMIN_EMAIL`. Supabase sign-ups are off, so no one else can make an account.
- Door PIN is 4–8 digits and only a hash of it is stored.
- Every time is entered and shown in New York time.
- **Demo mode:** until the Supabase keys are added, the site runs on sample shows with a "Preview" banner, and saving is turned off.

## 9. Open items
1. **[pending]** General only vs. General + Student (group vote).
2. **[pending]** Domain approval from leadership (blocks email, §7.1).
3. **[pending]** President's Stripe setup; sole proprietor vs. group EIN.
4. Will the venue have signal at the door? (Offline mode is in either way.)

## 11. Branding (D28)

**Logo:** `assets/diatonics-logo.png`. It's a black circle with a cream outline, "DIATONICS" in a cream serif font over a blue soundwave, a cream eighth note, and a reddish glow.

**Colors**
| Role | Color | Hex **[assumed, adjust to taste]** |
|---|---|---|
| Primary accent | Light sky blue (group color) | `#A9D6F5` |
| Secondary accent | Burgundy (group color) | `#7B1E2E` |
| Page background | Pale sky blue / cream (soft, light) | `#EEF6FC` / `#FBF7F4` |
| Text | Near-black | `#1A1A1F` |
| Logo cream (on dark areas) | Cream | `#EDE1DB` |

**Guidelines [assumed]**
- **Not a dark theme, but pretty** (your decision): a **soft sky-blue** look. Pale sky-blue/cream backgrounds, **burgundy buttons**, dark text. The logo (a dark circle) is the centerpiece and stands out against the light background.
- **Fonts follow the logo's lettering style** (your decision): a bold, high-contrast serif with flared, wedge-shaped serifs, in all caps.
  - **Headings / titles / buttons:** a free Google Font close to the logo. First pick: **Cinzel** (weights 700–900); alternatives: **Marcellus SC**, **Playfair Display SC** (bold). Use all caps with slightly wide letter spacing, like the logo. **[assumed: final font chosen side by side against the logo]**
  - If whoever designed the logo knows the exact font, use that (if its license allows web use). Otherwise, upload the logo to a font identifier like WhatTheFont to find it.
  - **Body text:** a plain sans-serif for readability (e.g. **Inter**). The logo font is for headings only, since it's hard to read in long text and small sizes.
  - The door scanner's result text uses the plain sans-serif at a large size, for speed.
- Use the logo on the home page, event pages, emails (header), the door app icon, and the browser tab icon.
- **The door scanner keeps green / yellow / red for results**, not brand colors, so burgundy never gets confused with 🟥 "invalid."
- Emails use the same light colors.
- Check contrast: cream/white text on burgundy buttons is fine; dark text on pale sky blue is fine. Don't put sky-blue text on a light background (too faint).

## 12. Page-by-page details (decided 2026-11-15)

**Tone everywhere: friendly + fun.** Music puns are OK ("You're going! 🎶", "See you there", "Encore-worthy").

### Home page
Your answer: no preference. **[assumed]** The next show is big at the top (flyer, date, Buy button), then a Donate section, then the group's social links.

### Event page
- **Poster/flyer image** at the top.
- Date, time, venue, all-in price, plus the door-price notice (D31).
- **"General admission: first come, first served"** shown clearly near the price.
- **Setlist or description** text.
- **Map + directions** (embedded map or a link).
- **Tickets-left count** (e.g. "23 left").

### Confirmation page (after buying)
- **Celebratory:** "You're going! 🎉" with the tickets (QR + short code) shown right on the page, plus "We also emailed them to you."
- "General admission: first come, first served" on each ticket.

### Ticket email
- **Branded:** logo header, group colors, one card per ticket with the QR code + short code.
- Each ticket card says **"GENERAL ADMISSION: first come, first served"** so nobody expects assigned seats.
- (Still a light background; see §11.)

### Door scanner
- Camera + full-screen results (§3.7).
- **Checked-in count** always visible (e.g. 142 / 180).
- **"See history"** button: everyone that device scanned, in **reverse chronological order** (newest first), with name, ticket type, result, and time.
- Door-sale +/− counter (D32).

### Donate page
- Amounts ($5 / $10 / $25 / custom) + thank-you.
- **"Why donate"** section: what donations pay for (venues, competitions, etc.). You write the text.
- **Supporters list** of opt-in donor names (D12) shown on the page.
- No goal progress bar.

### Admin (works equally well on **laptop and phone**)
Dashboard shows first:
- **Tickets sold vs. capacity** (a progress bar per event)
- **Money totals** (gross, service fees, Stripe fees, net, donations)
- **Sales over time** (a chart of tickets sold per day)

The master list, CSV, comps, etc. stay as in §3.8. On a phone, tables collapse into cards.

## 10. Build steps & checkpoints

Each step ends with a checklist **you** run before the next step starts.

**Nothing pending blocks steps 1–8.** Everything runs in **Stripe test mode** (fake cards) and sends email **only to your own inbox**. The things you're waiting on only affect **step 9 (go live)**:
- **Ticket types vote:** the system supports multiple types from step 1; adding "Student" later is just a setting in the admin page.
- **Sophia's Stripe details:** test mode needs no SSN or bank account. Create the Stripe account now with the group Gmail; Sophia fills in her details later to activate it for real payments.
- **Domain:** only needed so email can reach other people's inboxes.
- **Venue signal:** offline mode gets built either way.

### Step 1: Foundation + events
Project setup, Supabase (group account), your admin login, event create/edit, public home page with the event list and a Donate button placeholder.
- [ ] You can log in as admin; anyone else is blocked from admin pages
- [ ] You can create, edit, and save a test event (name, date, venue, capacity, General $5, sales close +30 min)
- [ ] It shows on the home page, and looks good on your phone
- [ ] A draft event does **not** show publicly

### Step 2: Buying tickets (Stripe test mode)
Event page → quantity → name/email/phone → Stripe Checkout → confirmation page.
- [ ] Prices show all-in: "$5.50 (includes $0.50 service fee)", on the event page and in Stripe
- [ ] Test card `4242 4242 4242 4242` completes a purchase; a declined test card does not create an order
- [ ] Cash App Pay shows as an option in checkout, and a test-mode Cash App payment creates the order the same way
- [ ] You can't buy more than 10, or more than the tickets left
- [ ] Buying is blocked after the sales cutoff (show start + 30 min)
- [ ] "All sales final" is shown before payment
- [ ] The order shows up in the Supabase data (the admin master list comes in step 6)

### Step 3: Ticket email + self re-send
Resend email with QR codes + short codes, "view my tickets" page, "Lost your ticket?" page.
- [ ] A test purchase sends an email to **your** inbox in under a minute, not in spam
- [ ] The QR code displays in Gmail on your phone and laptop
- [ ] The short code and "view my tickets" link work
- [ ] "Lost your ticket?" re-sends to the email on file and never shows tickets on screen
- [ ] The 4th re-send within an hour is blocked

### Step 4: Door scanner (online)
Deployed to `diatonics-ticketing.vercel.app` (phones need https for the camera). PIN login, always-on camera, full-screen results, manual lookup, Get help.
- [ ] Adds to your phone's home screen and opens full-screen
- [ ] Wrong PIN is rejected; repeated wrong PINs get locked out
- [ ] Scanning a test ticket → 🟩 within ~1 second; scanning again → 🟨 with the time
- [ ] A made-up / edited QR → 🟥
- [ ] Manual lookup by name or short code works
- [ ] Get help opens a one-screen guide
- [ ] The door-sale counter +/− works, can't go below 0, and the totals from two phones add up correctly in admin
- [ ] **Volunteer test:** hand it to someone who has never seen it; they check in a ticket without your help

### Step 5: Offline mode
Guest list download, offline scans, sync, duplicate flags.
- [ ] Turn on airplane mode → scans still give 🟩 / 🟨 / 🟥
- [ ] Turn the signal back on → check-ins appear on the server and on a second phone
- [ ] Scan the same ticket on two phones while both are offline → after sync it's flagged as a duplicate
- [ ] A ticket bought after the list was downloaded → shows "not found offline, check online"

### Step 6: Admin tools
Dashboard, master list, CSV export, comps, undo check-in.
- [ ] Dashboard totals match Stripe test mode's numbers (gross, service fees, Stripe fees, net)
- [ ] The master list shows every order: name, email, phone, time, quantities, amounts, check-in status. Search and sort work
- [ ] The CSV opens cleanly in Google Sheets / Excel
- [ ] A comp ticket gets emailed and scans 🟩
- [ ] Comp tickets can't exceed the remaining capacity
- [ ] Undoing a check-in lets the ticket scan 🟩 again

### Step 7: Donations
Standalone donate page (works with zero events), checkout add-on, receipts, opt-in recognition.
- [ ] With **no events listed**, the home page Donate button still works
- [ ] $5 / $10 / $25 / custom all work; the donor pays exactly that amount (no added fee)
- [ ] Adding a donation at ticket checkout shows it as its own line
- [ ] The receipt email arrives and does **not** say "tax-deductible"
- [ ] Opt-in names appear in the recognition export; opted-out donors don't

### Step 8: Reminders + cancel/reschedule
Split-day reminders with the email budget; 3-step cancel/reschedule.
- [ ] With ≤100 test recipients, reminders all go 1 day before. With >100 (simulated), they split across 2 days by purchase time
- [ ] The daily email budget leaves room for new orders and re-sends
- [ ] Cancel → refund: all 3 confirmation steps appear, typing the event name is required, test orders are refunded in Stripe, and buyers are emailed
- [ ] Reschedule: the new date shows everywhere, old tickets still scan 🟩, and buyers are emailed
- [ ] Backing out at any of the 3 steps changes nothing

### Step 9: Go live ⏳ (waits on the group)
- [ ] Ticket types finalized (vote) and set in admin
- [ ] Sophia activates Stripe (ideally under a group EIN) → switch to live keys
- [ ] Buy `diatonics.com` (Cloudflare) → `ticketing.diatonics.com` → Vercel; verify the domain in Resend
- [ ] One real $5.50 purchase end-to-end, using a real card
- [ ] Door dry run at the venue (checks the signal too)
- [ ] `ADMIN-GUIDE.md` written for whoever takes over
