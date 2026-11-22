# Diatonics Ticketing — Spec (v0.3, draft)

_Status: draft · Started 2026-11-15 · Last updated 2026-11-21_

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
| D6 | **Buyer info:** **first name + last name (two separate boxes)** and email required, phone optional (your request). The email box sits under a "Where to send your tickets" heading (no extra note next to "Email"). |
| D7 | **Online sales stay open until 30 minutes after show start** (e.g. 7:30pm for a 7pm show). Configurable per event. |
| D8 | **No refunds.** The only exception is a cancelled show (D20). |
| D9 | **Donations:** optional add-on at checkout **and** a standalone donate button that's always on the site, even when no event is listed. |
| D10 | **Donation amounts:** Donate page: $5 / $10 / $25 + custom. **Ticket checkout add-on: $2 / $5 / $10 / $25 + custom** (your request). The add-on has no "No thanks" button: **$2 is picked by default**, and a custom amount of $0 (or blank) means no donation. Otherwise custom is $1–$1,000. |
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
| D18 | **Admin login: name + leadership PIN** (changed 2026-11-21, your request; before, you were the only admin and logged in with an email link). At `/admin/login` a leadership member types **their name** and **the PIN**. **One shared PIN for all of leadership for now** (the one you picked, set as `ADMIN_PIN` in `.env.local` and Vercel, never written in the repo). It will become **one PIN per person eventually** (your plan, 2026-11-21); for now, keep the shared one in the env. The name has to be on the **e-board list** (D33), as a full name or a first name only one person has ("Rachel") **[assumed]**, so the e-board list is who can log in and there are no accounts to manage. Wrong PINs lock out: 5 per device per 15 minutes, 30 per hour across the whole site **[assumed]**. Every try is logged with the name (table `admin_logins`, `supabase/migrations/0003_admin_login.sql`). A login lasts 7 days **[assumed]**; changing the PIN logs everyone out. The top bar shows "Logged in as <name>". |
| D19 | **Admin tools:** sales dashboard, a full master list of every buyer and order (everything except card info), comp tickets (rarely used, but available), CSV export. No refund button (D8). **Every admin sees everything (updated 2026-11-21):** the dashboard (tickets sold, total revenue, net profit from sales, total spent, current balance; see §3.8) and the **buyer list** (everyone who bought tickets, shown as a table in the browser + a CSV download; no .xlsx). Event editing is in admin too; in practice you do it, since the others aren't technical. |
| D33 | **E-board expense tracker** (added 2026-11-21, your request) at `/admin/expenses`: log what each e-board member paid out of pocket (who, date, what, category, amount, notes), mark it paid back, per-person totals, and an "E-board is owed $X" line on the admin home. Only people logged into admin see it (D18). **Updated 2026-11-21 (your request): a Venmo-style log.** To add an entry, tap **Expense** or **Reimbursement**, then enter the amount and what it was for. The logged-in name is filled in automatically, with no name box. **Expense** = that person spent their own money; everyone enters their own. **Reimbursement** = money sent back to someone; the person entering it picks **who it's for**. Usually you enter these, since ticket money goes to your Stripe account (D24) and you send the paybacks. The note defaults to "from ticket sale funds" **[assumed]**. Each person can edit their own entries. **One shared log** every admin sees, newest first: **expenses in red/pink, reimbursements in green**. When everyone is paid back, reds and greens balance; more red means someone is still owed. The person paid back gets an optional **"I got it"** check to confirm receipt. It probably won't get used, but it's built anyway; an unconfirmed reimbursement still counts as paid. Per-person balance = expenses − reimbursements, and the "E-board is owed $X" total is the sum of those. This replaces the earlier "paid back yes/no" toggle **[assumed: reimbursements don't have to match one specific expense; they just reduce the person's balance]**. E-board list is editable (it's also the list of who can log in to admin); starts with Rachel Chen, Lila Erol, Callum Robechek, Sophia Shahrooz, Isaac Kan, Victoria Zou. Tables: `supabase/migrations/0002_expenses.sql`. No receipt uploads **[assumed]**: paste a receipt link in Notes. |
| D20 | **Cancelled show:** two options, **refund everyone** or **reschedule** (tickets carry over). It takes **3 confirmation steps** so it can't happen by accident. |
| D21 | **Reminder emails:** split across 2 days if there are more than 100 recipients (earliest buyers 2 days before, the rest 1 day before) to stay under Resend's limit. |
| D22 | **Buyers re-send their own tickets** ("Lost your ticket?" page), so volunteers never have to. |
| D23 | **Email via Resend, free tier** (~3,000/month, 100/day). |

### Setup
| # | Decision |
|---|---|
| D24 | **Stripe account owner: you** (changed 2026-11-20 from the president). Activated under your name at go-live, payouts to your bank; the president gets Stripe's "View only" role (see §5.4). |
| D25 | **Supabase: a new account under a group email.** Use the same group email for Stripe, Resend, Vercel and the domain. |
| D26 | **URL: `diatonics-ticketing.vercel.app` (and localhost) during development.** If the build is good, you'll buy **`diatonics.com`** yourself (it's available) and use **`ticketing.diatonics.com`** (free subdomain, set up with a DNS record pointing to Vercel). Resend verifies the same domain for email, e.g. `tickets@diatonics.com`. ⚠️ Until then, email only reaches your own inbox, see §7.1. |
| D27 | **Location: New York City; not school-registered.** |
| D29 | **No Venmo on the site.** Stripe doesn't offer it (checked Stripe's payment-method docs 2026-11-15). Online payments are Stripe only. |
| D31 | **Door sales (Venmo or cash, ~$7–8) happen outside this system.** The site doesn't sell, track, or count them. It only **displays a notice** on the event page, e.g. "Online $5.50 · At the door $8 (Venmo or cash)." The higher door price pushes people to buy online and keeps the door line fast. The door price is a per-event text/number field in admin, shown only. |
| D32 | **Door-sale counter (count only).** The door app has a simple **+ / −** counter where volunteers record how many at-door purchases they processed. Nothing else: no payment method, no amount, no names. Totals sync across devices and show in admin. |
| D30 | **Cash App Pay is on** in Stripe Checkout (US, same 2.9% + 30¢, no extra code: enable it in Stripe's payment method settings). Checkout offers cards, Apple Pay, Google Pay, and Cash App Pay. |
| D28 | **Branding:** logo at `assets/diatonics-logo.png` (original) and `assets/diatonics-logo-round.png` (cleaned-up version the site uses); group colors are **light sky blue** and **dark red/burgundy**. **Light mode only, never a black/dark background.** See §11. |

---

## 1. Goal

A small, low-cost web platform for Diatonics a cappella concerts. People buy tickets by card or donate, get their tickets by email, and are checked in at the door with a fast QR scan. Volunteers can use it with no training. Leadership runs it from the admin pages (name + PIN login, D18).

### Non-goals (v1)
- Reserved seating (general admission only)
- Multiple groups/organizations
- Native apps (the scanner is an installable web app)
- Merch (would trigger NYC sales tax of 8.875% and require registering with the state)
- Apple/Google Wallet passes
- Admin accounts with passwords or email logins (D18: name + one shared leadership PIN for now)

## 2. Users & roles

| Role | Who | How they get in | Can do |
|---|---|---|---|
| **Buyer / donor** | Audience | No account | Buy tickets, donate, view tickets, re-send own tickets |
| **Door volunteer** | Any group member | Shared per-event PIN (D16) | Scan, manual lookup, check in. Nothing else. |
| **Admin** | Leadership (anyone on the e-board list, D18) | Their name + the shared leadership PIN (D18) | Everything |

## 3. Flows

### 3.1 Home page
- Upcoming events (if any).
- **"Donate" button, always visible**, even with no events listed (D9).
- "Lost your ticket?" link (D22).

### 3.2 Ticket purchase
1. Event page: title, date/time, venue, description, tickets remaining. Prices shown **all-in** (D4). Includes the door-price notice: "Or pay $X at the door (Venmo or cash)." Online buying is the highlighted option (D31).
2. Pick quantity (max 10, D5) per ticket type.
3. Optional "Add a donation": $5 / $10 / $25 / custom (D10).
4. First + last name and email (required), phone (optional) (D6).
   (Steps 2–4 are three fold-open sections on the event page, opened one after another. See §12 Event page.)
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
- Small button: search by name, email, **order number** (e.g. `KM47`) or ticket short code, then tap to check in.

**Get help (D17)**
- A "?" button opens a one-screen plain-language guide: what each color means, what to do about a dead phone, "not found," or "already used."
- No tutorial by default.

**Rules**
- First scan wins (D15). Only the admin can undo a check-in.
- Volunteers can't see revenue, emails, or anything beyond the door list.

### 3.8 Admin (leadership, D18–D20)
- **Events:** create/edit name, date/time, venue, description, image, capacity, ticket types + prices, sales close time (default show start + 30 min), door PIN.
- **Dashboard (every admin, D19):** the group isn't trying to make a profit; the money pays for things like costumes. Big numbers up top: **tickets sold**, **total revenue** (tickets + service fees + donations), **net profit from sales** (revenue − Stripe fees), **total spent** (e-board expenses, D33), **current balance** (net profit from sales − total spent = what the group has to spend). A budgeting area may come later (not a priority). Below: tickets sold per type, donations, gross, service fees, Stripe fees, live check-in count.
- **Expense log (D33):** Venmo-style. Tap Expense or Reimbursement and enter the amount; the name comes from the login. One shared log: red/pink expenses ("Callum spent $20"), green reimbursements ("Callum received $20 from ticket sale funds"), an optional "I got it" check, and per-person balances.
- **Buyer list (D19):** everyone who bought tickets, as a table in the browser for every admin, plus a CSV download.
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
- **Order number (your request):** simple, **2 letters + 2 digits, e.g. `KM47`** (no I/O, no 0/1). 36,864 combinations, plenty for this group; the database keeps it unique and picks again on a clash. Shown on the confirmation page, on every ticket, in the email and on the downloaded ticket image. Door volunteers can look people up by it. It is not a secret and never unlocks tickets by itself.

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
- **You own the Stripe account** (changed 2026-11-20; it was going to be the president, Sophia). You activate it under your own name at go-live, with payouts to your bank. **Sophia gets the "View only" role** so she can see every payment and total but can't change anything.
- ⚠️ If she signs up as an individual/sole proprietor, ticket and donation money counts as **her personal income**. The cleaner version: she gets a free **EIN** for the group (as an "unincorporated association") with herself as the responsible party, and Stripe + the bank account go under the EIN.
- IRS 1099-K reporting starts at $20,000 **and** 200 transactions per year, which is unlikely to be reached. _Not tax advice._
- Plan for a handoff when presidents change: with an EIN, the account stays with the group.

### 5.5 Sales tax (D27)
- NY exempts admission to **live musical performances**, so no sales tax on tickets. *(Confirm with NY's sales tax guidance on "places of amusement".)*
- Exception: venues serving food or drink during the show ("roof garden/cabaret") are taxable.
- Donations: no sales tax.

## 6. Data model (draft) **[assumed]**
- **DoorSaleCount**: event_id, device_id, delta (+1 / −1), created_at (the sum = door sales)
- **Event**: id, name, slug, description, venue, starts_at, doors_at, capacity (**blank = unlimited**), door_price_cents (display only, nullable), sales_close_at, door_pin_hash, image_path, status (draft / on_sale / closed / cancelled). A reschedule just changes starts_at, so there's no separate "rescheduled" status **[assumed]**
- **TicketType**: id, event_id, name, price_cents, quantity_limit
- **Order**: id, event_id (null for standalone donations), order_no (unique, e.g. KM47), buyer_first_name, buyer_last_name, buyer_email, buyer_phone, tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents, stripe_fee_cents, status (pending / paid / refunded / comp), payment_method (stripe / comp), stripe_session_id (nullable), created_at
- **Ticket**: id, order_id, ticket_type_id, short_code, status (valid / checked_in / void), checked_in_at, checked_in_device
- **Donation**: id, order_id, amount_cents, recognize (bool), display_name, created_at
- **CheckInLog**: ticket_id, device_id, action (check_in / undo), timestamp, synced_at, conflict (bool)
- **LedgerEntry** (D33): id, kind (expense / reimbursement), member_id (who spent, or who was paid back), entered_by_member_id (from the login), amount_cents, description, category (expenses only), note (e.g. "from ticket sale funds"), received_confirmed_at (nullable, the optional "I got it"), created_at, updated_at. The shared log = all entries, newest first **[assumed]**
- **AdminLogin**: member_id, name_typed, ip, success, created_at (every admin login try; used for the wrong-PIN lockout, D18)
- **EmailLog**: order_id, type (ticket / resend / reminder / cancel / reschedule / donation_receipt), sent_at (used for the 100/day budget)

## 7. Stack & costs

| Piece | Choice | Cost |
|---|---|---|
| Payments | Stripe (your account, D24) | Per-transaction only |
| Email | Resend free (D23) | $0 |
| Database | Supabase free, group account (D25) | $0. Pauses after ~1 week idle, so it needs a keep-alive ping |
| Hosting | Vercel, `diatonics-ticketing.vercel.app` (D26) | $0 |
| Domain | **[pending]** leadership | ~$10–20/year |

⚠️ **For go-live (Step 9):** Vercel's free Hobby plan is for non-commercial use only, and its fair-use guidelines list taking payments from site visitors as commercial use. Testing on Hobby through Step 8 is fine. Before real sales, either upgrade to Vercel Pro ($20/month) or move to a free host that allows payments (e.g. Cloudflare). The code avoids Vercel-only features so the move stays small.

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
- **Security:** HTTPS; signed QR codes; per-event door PIN, changeable, with rate-limited attempts; admin pages need a name on the e-board list + the leadership PIN, with lockout after wrong PINs (D18); re-sends go only to the email on file.
- **Privacy:** collect only name, email, optional phone; simple privacy note; never share or sell data.
- **Accessibility:** good contrast, screen-reader friendly.
- **Handoff:** you're the only technical member, so keep a short `ADMIN-GUIDE.md` for whoever takes over someday.

### 6.1 Step 1 defaults **[assumed]**
- Admin login is name + leadership PIN (D18), replacing the earlier email magic link (2026-11-21). The login is a signed, http-only cookie; it doesn't use Supabase Auth.
- Door PIN is 4–8 digits and only a hash of it is stored.
- Every time is entered and shown in New York time.
- **Demo mode:** until the Supabase keys are added, the site runs on sample shows with a "Preview" banner, and saving is turned off. Built so the group can see the idea before the account setup. It switches off by itself once the keys are in, and the `/demo/...` pages then return "not found":
  - Buying tickets: real quantity picker, donation add-on and buyer info on the event page → **demo checkout** page (clearly labeled "no card is charged"; deliberately *not* styled like Stripe; the test card is shown read-only) → "You're going! 🎉" confirmation with real scannable QR codes + short codes.
  - Ticket email preview (`/demo/email`), donation thank-you + receipt (`/demo/thanks`), and a door-scanner mock (`/demo/door`) with pretend Good / Used / Fake scans, full-screen green/yellow/red results, Get help and See history.
  - Sample shows and "sold" counts are placeholders, except the Winter Concert's date, which is the real show: **Sat, Dec 5, 2026, 6:00 PM** (doors 5:30). The venue is still the sample one. The supporters list shows only real people (just "Moona" for now).

## 9. Open items
1. **[pending]** General only vs. General + Student (group vote).
2. **[pending]** Domain approval from leadership (blocks email, §7.1).
3. ~~President's Stripe setup~~ Settled 2026-11-20: you own the Stripe account (D24).
4. Will the venue have signal at the door? (Offline mode is in either way.)

## 11. Branding (D28)

**Logo:** `assets/diatonics-logo.png`. It's a black circle with a cream outline, "DIATONICS" in a cream serif font over a blue soundwave, a cream eighth note, and a reddish glow.
- **Cleaned-up version (your request):** `assets/diatonics-logo-round.png`. The white background is removed (transparent outside the circle) and the circle is centered in a square image, so there's no awkward white space. The site, browser-tab icon and placeholder pictures all use this one. The original file is kept unchanged.

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
- **Light mode only, always (your rule):** no black or dark page backgrounds anywhere, including the door scanner's idle screen. Cards are white on the pale-blue page.
- **Links are burgundy** (sky-blue text is too faint on a light background).
- **No short dangling last lines (your request):** headings wrap into even lines and paragraphs avoid a lone word or two on the last line (CSS `text-wrap: balance` / `pretty`, site-wide).
- **Small corners only (your decision):** 4px corners on buttons, inputs, cards and badges. No pill-shaped buttons or big rounded cards, because they look "vibe coded".
- **Wide layout (your request):** content goes up to ~1150px wide on a laptop (not a narrow column), so the ticketing part takes up more of the screen. Phones are single-column.
- **Fonts follow the logo's lettering style** (your decision): a bold, high-contrast serif with flared, wedge-shaped serifs, in all caps.
  - **Headings / titles / buttons:** a free Google Font close to the logo. First pick: **Cinzel** (weights 700–900); alternatives: **Marcellus SC**, **Playfair Display SC** (bold). Use all caps with slightly wide letter spacing, like the logo. **[assumed: final font chosen side by side against the logo]**
  - If whoever designed the logo knows the exact font, use that (if its license allows web use). Otherwise, upload the logo to a font identifier like WhatTheFont to find it.
  - **Body text:** a plain sans-serif for readability: **Figtree** (chosen 2026-11-15, replacing Inter). The logo font is for headings only, since it's hard to read in long text and small sizes.
  - The door scanner's result text uses the plain sans-serif at a large size, for speed.
  - **Headings are large (your request):** page titles are 36px on phones and 48px on laptops, section headings 24px, and "Diatonics" in the top bar 20px. Admin page titles are 30px.
- Use the logo on the home page, event pages, emails (header), the door app icon, and the browser tab icon.
- **The door scanner keeps green / yellow / red for results**, not brand colors, so burgundy never gets confused with 🟥 "invalid."
- Emails use the same light colors.
- Check contrast: cream/white text on burgundy buttons is fine; dark text on pale sky blue is fine. Don't put sky-blue text on a light background (too faint).

## 12. Page-by-page details (decided 2026-11-15)

**Tone everywhere: friendly + fun.** Music puns are OK ("You're going! 🎶", "See you there", "Encore-worthy").

### Home page
Your answer: no preference. **[assumed]** The next show is big at the top (flyer, date, Buy button), then a Donate section, then the group's social links.
- As built: big logo + "Diatonics A Cappella" heading → **"Next show" tile** with a "Get tickets · $5.50" button (on a laptop: show text on the left, the button on the right, so the tile is balanced; on narrower screens the button goes under the text. Your request: centered looked off, plain left-aligned left too much empty space). **You approved this layout: keep it, don't redesign it.** → **"More shows"** tiles → Donate section. (Social links are still to come, once you send the links.)
- **Every show tile has a picture on the left (your request).** It uses the event's uploaded flyer/image, and **the logo as the default placeholder** when there isn't one. On a phone, the "Next show" picture sits on top of the tile instead.

### Event page
- **Layout (your request: ticketing wider):** on a laptop, show details are on the left (about 40%) and the **ticket box is on the right, taking the larger share (about 60%)**. On a phone, details come first, then tickets, full width.
- **Flyer (your request):** sits in the left column under the show details, filling the empty space beside the tall ticket box (on a phone it comes after the details, before tickets). **Tap it to see it full size** (a pop-up viewer with a Close button; Esc or tapping outside also closes it). Uploaded per event in admin as "Flyer"; a tall (portrait) image looks best. **Demo mode shows a placeholder** (`public/sample-flyer.svg`, labeled "SAMPLE FLYER"); real events with no flyer show nothing there.
- Date, time, venue, all-in price, plus the door-price notice (D31).
- **"General admission: first come, first served"** shown clearly near the price.
- **Setlist or description** text.
- **Map + directions** (embedded map or a link).
- **Key facts in boxes (your request):** at the top of the ticket box, side-by-side boxes for **Seating** (General admission / First come, first served), **Price** (Online $5.50 / At the door $8, Venmo or cash) and **Tickets left**. Each box has a large, gray, all-caps label on top ("SEATING", "PRICE") with the bold value under it. **All the values are burgundy** (your request: consistent, not just "General admission").
- **"Tickets" heading** is extra large (bigger than the other section headings).
- **Buying happens in 3 fold-open steps (your request)**, each in its own box:
  1. **Tickets**: one box per ticket type, with a large name, the all-in price and big − / + buttons. A **Continue** button opens step 2.
  2. **Add a donation (optional)**: closed until step 1 is done, so it never looks bigger than the ticket part. Smaller amount buttons ($2 / $5 / $10 / $25 / Custom; Custom $0 = no donation). **$2 is picked by default** (your request; it shows in the step summary and as its own line in the total). Next to the Continue button is a small **"Thank me by name on our supporters list"** checkbox (greyed out when there is no donation, so nothing moves around); it uses their first + last name from step 3, with no separate box (D12). The button always says **Continue** (never "Skip").
  3. **Your info**: name, email, phone, the order total, the no-refunds line, and the "Continue to payment" button.
  - A finished step folds up and shows a one-line summary ("2 × General · $11.00", "No donation"); tap it to reopen and change it.
- **"No refunds. All sales final."** is small, regular weight and gray (your request: not bold, not big), but always shown before payment (D8).
- **Tickets-left count**, shown as just the number ("143 left"), no total. Always the true number, never padded. Hidden ("On sale now") until 10% of capacity has sold, so early buyers don't see a full count **[assumed: 10%]**. Admin always shows real numbers.

### Confirmation page (after buying)
- **Celebratory:** "You're going! 🎉" with the tickets (QR + short code + **order number**) shown right on the page, plus "We also emailed them to you."
- **If they donated:** a **big thank-you box, full page width so it stays short** ("Thank you for your $10 donation! 💛", what it pays for, and "We'll add <name> to our supporters list" if they opted in). Your request: bigger than a single line.
- **Each ticket has "Download" and "Text / share" buttons (your request).** Download saves a PNG of the ticket (show, date, QR, short code, ticket type, name, order number, GA line) so it works with no signal. Text / share opens the phone's share sheet (Messages, WhatsApp, AirDrop, Save Image). Both are free and need no SMS service. Sending tickets **by text automatically** would need a paid SMS service (e.g. Twilio) and US carrier registration **[open question: not built]**. The email has no buttons (emails can't run them).
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
- **"Why donate"** section (your request): **large and centered**, right under the page title and above the donation form. Formal wording: the Diatonics are independent, **not a recognized NYU Steinhardt student organization, so they get no university funding**; members are there for the love of the music and pay for everything themselves. Then a "Your donation helps cover" list as compact boxes that wrap across a wide (~1000px) row, so the section stays short: uniforms, venue rentals, rehearsal space, mics/sound equipment, competition fees, travel, recording, sheet music/arrangement licensing, posters/printing, event supplies. **[assumed: you check the list and remove anything the group doesn't really pay for]** (list is `FUNDING_NEEDS` in `src/app/donate/page.tsx`). Never says "tax-deductible."
- **Supporters list** of opt-in donor names (D12) shown on the page. **No made-up names (your rule).** Demo mode shows only "Moona" (a real friend); real donors replace it once donations are live.
- No goal progress bar.

### Admin (works equally well on **laptop and phone**)
Dashboard shows first:
- **Tickets sold · Total revenue · Net profit from sales · Total spent · Current balance** (big numbers, every admin sees them, D19, §3.8)
- **Tickets sold vs. capacity** (a progress bar per event)
- **Money totals** (gross, service fees, Stripe fees, net, donations)
- **Sales over time** (a chart of tickets sold per day)

The master list, CSV, comps, etc. stay as in §3.8. On a phone, tables collapse into cards.

## 10. Build steps & checkpoints

Each step ends with a checklist **you** run before the next step starts.

**Nothing pending blocks steps 1–8.** Everything runs in **Stripe test mode** (fake cards) and sends email **only to your own inbox**. The things you're waiting on only affect **step 9 (go live)**:
- **Ticket types vote:** the system supports multiple types from step 1; adding "Student" later is just a setting in the admin page.
- **Stripe activation:** test mode needs no SSN or bank account. Create the Stripe account now; you fill in your own details later to activate it for real payments.
- **Domain:** only needed so email can reach other people's inboxes.
- **Venue signal:** offline mode gets built either way.

### Step 1: Foundation + events
Project setup, Supabase (group account), admin login (name + PIN, D18), event create/edit, public home page with the event list and a Donate button placeholder.
- [ ] You can log in with your name + the leadership PIN; a wrong PIN or a name that isn't on the e-board list is blocked; 5 wrong PINs lock that device out for 15 minutes; logged-out visitors are blocked from admin pages
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

**As built (2026-11-21):** tables + functions in `supabase/migrations/0004_orders.sql` (`orders`, `order_lines`, `tickets`; a database lock stops two buyers getting the last ticket). Checkout saves a **pending** order that holds the tickets for 31 minutes; Stripe's page expires at the same moment. Paying marks it **paid** and creates one ticket per person (short code like `DIA-7K3F-Q9`); leaving, a declined card, or the time running out marks it **expired** and frees the tickets. Both Stripe's webhook (`/api/stripe/webhook`, needs `STRIPE_WEBHOOK_SECRET`) and the confirmation page (`/orders/confirmed`) confirm payments, so tickets appear even if one of them is slow. Stripe "back" link → `/checkout/cancel` frees the hold right away. The donation add-on is charged as its own line already (receipts/recognition list are step 7). **[assumed]** Until step 3/4, the QR code holds the short code; step 3/4 switches it to a signed token. Stripe's **Managed Payments** (on by default for new accounts; extra fees, blocks the "All sales final" text) is turned off per checkout in code. In Stripe test mode, the **account's own default payment-method configuration** (`pmc_1Ue5G7K8SpF7Crlkpld5N6h9`; there's also an app-owned config named "Default" that Checkout does NOT use) is set to exactly the decided list: **card (with Apple Pay + Google Pay) and Cash App Pay**. **Klarna, Amazon Pay and Link are off** (2026-11-21; Link added a confusing "Bank · $5 back" option). Checkout verified to offer only `card, cashapp`. Redo these settings in live mode at go-live.

### Step 3: Ticket email + self re-send
Resend email with QR codes + short codes, "view my tickets" page, "Lost your ticket?" page.
- [ ] A test purchase sends an email to **your** inbox in under a minute, not in spam
- [ ] The QR code displays in Gmail on your phone and laptop
- [ ] The short code and "view my tickets" link work
- [ ] "Lost your ticket?" re-sends to the email on file and never shows tickets on screen
- [ ] The 4th re-send within an hour is blocked

**As built (2026-11-21):** needs `supabase/migrations/0006_email.sql` (tables `email_log` and `ticket_resend_requests`) and two new settings, both already in `.env.local` and Vercel: `TICKET_SECRET` (signs QR codes + links; **never change it after tickets are sold**) and `EMAIL_TEST_TO` (test mode: every email goes to the group Gmail with a yellow "this email was for <buyer>" note, because Resend only delivers to the account's own inbox until `diatonics.com` is verified; **delete it at go-live** and set `EMAIL_FROM`). Details:
- **QR codes are signed** (§4): the QR holds `D1.<ticket id>.<signature>`, signed with a key for that event only (derived from `TICKET_SECRET`), so the door app can reject fakes offline in step 5 by getting just that event's key. Code: `src/lib/ticket-token.ts`.
- **Ticket email** is sent when the order is marked paid (webhook or confirmation page, whichever is first). The database lets only one call send it; a failed send is logged and the next call retries. QR images are hosted at `/api/qr/<token>` (Gmail blocks images built into the email). Template: `src/lib/email/ticket-email.ts`.
- **"View my tickets"** = `/tickets/<signed key>` (no login; the key can't be guessed). Linked from the email and the confirmation page.
- **"Lost your ticket?"** (`/lost-ticket`): re-sends tickets for shows that haven't ended (up to 12 hours after the start **[assumed]**) to the email on the order, in one email. Same answer whether or not the email has tickets. Limits: 3 per email per hour, 10 per network per hour **[assumed]**, and re-sends stop at 90 emails in 24 hours so ticket emails always fit under Resend's 100/day **[assumed]**.

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

**As built (2026-11-21):** needs `supabase/migrations/0007_door.sql` (tables `check_in_log`, `door_logins`, `door_sale_counts`; functions `door_check_in`, `door_stats`, `door_sale_change`). Details:
- **`/door`**: pick the show (shows that are on sale or closed, from 12 hours ago to 2 weeks ahead **[assumed]**), type **your first name** (shows as "scanned by Maya" on 🟨 results **[assumed]**) and the show's door PIN. The login lasts 24 hours **[assumed]**; changing the show's door PIN in admin logs out every door phone. Wrong PINs lock out like the admin login: 5 per phone in 15 minutes, 30 site-wide per hour **[assumed]**.
- **Scanning**: camera always on; Android Chrome reads QR codes natively, other phones (iPhone) use the `jsqr` library. 🟩 shows ~1.5 s, 🟨 / 🟥 ~3.5 s so there's time to read them **[assumed]**; tap to clear sooner. The same QR is ignored for 4 s after its result clears (they're still holding it up). 🟥 says whether it's a fake code, a ticket for a different show, or a cancelled ticket. A database lock makes the first scan win when two phones scan the same ticket at once (D15). The screen stays on (Wake Lock) where the phone supports it.
- **Check-ins can't be undone from the door app** (§3.7: only the admin can undo); the admin undo comes in step 6.
- **See history** is kept on the phone (last 300 scans). **Manual lookup** searches this show's paid tickets by name, email, order number or ticket code; emails are searched but never shown.
- **Door-sale counter**: shows the show's total and this phone's count. A phone can only take back its own taps, so nothing goes below 0. The admin dashboard shows checked in + door sales = total attendance, per show and overall.
- **Home screen**: `public/door.webmanifest` + `public/door-icon-*.png` (logo on pale blue). Opens full-screen at `/door`.

### Step 5: Offline mode
Guest list download, offline scans, sync, duplicate flags.
- [ ] Turn on airplane mode → scans still give 🟩 / 🟨 / 🟥
- [ ] Turn the signal back on → check-ins appear on the server and on a second phone
- [ ] Scan the same ticket on two phones while both are offline → after sync it's flagged as a duplicate
- [ ] A ticket bought after the list was downloaded → shows "not found offline, check online"

**As built (2026-11-21):** needs `supabase/migrations/0008_offline.sql` (adds `client_id` to `check_in_log` / `door_sale_counts` and the `door_sync` function). Details:
- **Guest list** (`/api/door/list`): this show's paid tickets (id, name, type, code, order number, status) + **this show's ticket-signing key**, so the phone can reject fake QR codes offline (§4). Emails are never sent to the phone, only a SHA-256 fingerprint, so lookup offline needs the **full** email **[assumed]**. Saved in the phone's storage; refreshed every minute while online. The top bar shows "Ready offline: N tickets loaded" and "N waiting to sync".
- **Online vs offline**: the app checks the signal every 10 s. Online, each scan asks the server (first scan wins); if the server doesn't answer within 4 s, that scan is checked against the phone's list instead **[assumed]**. Offline scans are saved in a queue on the phone (each with a random id, so retries never count twice) and sync automatically. Logging out is hidden while anything is waiting to sync.
- **Duplicates**: if a ticket was already let in elsewhere when an offline check-in syncs, the server records it with `conflict = true`, the phone shows a yellow "let in twice" notice, and the admin dashboard shows "Let in twice (offline)". The ticket keeps its first check-in time.
- **"Not found offline"**: a real ticket (valid signature) that isn't on the phone's list yet shows a white ⚠️ screen, not green or red **[assumed]**: the volunteer checks the ticket email or scans again with signal.
- **Door-sale counter** is always queued and synced (works the same online and offline). The step 4 route `/api/door/sales` was removed.
- **Opens with no signal**: `public/door-sw.js` (a service worker, only for `/door`) saves the door page and its files on the phone. The phone must open `/door` **once with signal, logged in**, before going offline.

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
- [ ] You activate Stripe under your own name → switch to live keys
- [ ] Buy `diatonics.com` (Cloudflare) → `ticketing.diatonics.com` → Vercel; verify the domain in Resend
- [ ] One real $5.50 purchase end-to-end, using a real card
- [ ] Door dry run at the venue (checks the signal too)
- [ ] `ADMIN-GUIDE.md` written for whoever takes over
