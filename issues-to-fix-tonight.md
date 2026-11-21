# Issues to fix tonight (2026-11-21)

Written from your notes after a bad day: the admin login and Stripe both failed even though every key (Supabase, Stripe, Vercel token) was given. Fix these in order. SPEC.md is updated to match (D18, D19, D33, §3.8, §12 Admin).

## 1. Stripe has to work (top priority tonight)
- [ ] A test purchase on the **live Vercel site** works end to end: event page → Continue to payment → Stripe Checkout → pay with `4242 4242 4242 4242` → "You're going! 🎉" page with tickets → the order shows as **paid** in Supabase.
  - ✅ Verified 2026-11-21 (automated browser on the live site): event page → form → **Stripe Checkout opens** with "$5.50 each, includes $0.50 service fee", the donation as its own line, and "No refunds. All sales final."
  - ✅ Verified: Stripe's back arrow → `/checkout/cancel` → "Checkout cancelled" on the event page, and the hold is released at once.
  - ✅ Verified (same database function the site uses): holds count against capacity (4 held of 5 → asking for 2 more is refused), 11 in one order is refused, and after the sales cutoff it's refused and the live page says "Online sales are closed."
  - ⏳ **The card payment itself needs you (about 30 seconds):** Stripe's anti-bot check blocks automated browsers from pressing Pay. Open the test show, buy 1–2 tickets, pay with `4242 4242 4242 4242` (any future date, any CVC/ZIP). You should land on "You're going! 🎉".
- [x] The webhook works on Vercel too. Verified 2026-11-21: the Stripe test-mode endpoint `https://diatonics-ticketing.vercel.app/api/stripe/webhook` exists, is enabled, and has all 4 events. An event signed with the secret in `.env.local` gets **HTTP 200** from the live site (so Vercel's `STRIPE_WEBHOOK_SECRET` matches), and a wrongly signed one gets **400**.
- [x] Every variable is in Vercel (Production). Added 2026-11-21: `NEXT_PUBLIC_SITE_URL` (= `https://diatonics-ticketing.vercel.app`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`. Redeployed (dpl_Bt1fuyhBbumCp2SXZM2ChBSUWk81, READY).
- [x] The actual error: **`NEXT_PUBLIC_SITE_URL` was missing on Vercel.** The checkout code reads it to build Stripe's return links, threw, and the buyer saw "We couldn't open the payment page." Evidence: your 3 attempts (orders RJ32, DR58, CT96) never got a Stripe session; after adding the variable + redeploying, Checkout opens. (Stripe's "Managed Payments" problem was the earlier cause; that fix was already pushed.)
- [x] **Also fixed:** Checkout was offering Klarna, Amazon Pay and a "Bank · $5 back" (Link) option. Stripe has two configs named "Default"; Checkout uses the account's own one, which is now card (+ Apple Pay / Google Pay) and Cash App Pay only. Verified: a new Checkout offers exactly `card, cashapp`. No code change.

## 2. Admin dashboard won't open
- [x] `/admin/login` on Vercel shows "This page couldn't load / A server error occurred", even though `ADMIN_PIN` is set in Vercel and it was redeployed. (This was paused earlier today; it's back on now.)
  - ✅ **Works now.** Verified 2026-11-21 ~02:46 with an automated browser on the live site: name "Rachel Chen" + the PIN from `.env.local` → lands on `/admin` showing "Logged in as Rachel Chen" and the events list. So Vercel's `ADMIN_PIN` matches `.env.local`, and migrations 0002/0003/0004 are all in Supabase (checked: their tables exist).
- [x] The cause: the live deploy didn't have a valid `ADMIN_PIN` yet (Vercel only applies new env vars on the next build). Evidence: your earlier tries left **no rows** in `admin_logins`, and the only thing between the name check and writing that row is reading `ADMIN_PIN`, which throws on purpose if it's missing or not 4–8 digits. The redeploy at 06:26 UTC picked up the PIN. The runtime-log stream only shows live requests, so the old error line itself was gone.
  - Code hardening (needs commit + push): `src/app/admin/login/actions.ts` now shows "Admin login isn't set up on the server: ADMIN_PIN must be 4–8 digits, then redeploy." instead of a crash page if that ever happens again.

## 3. Admin login (how it should work)
- Type **your name**, then **the PIN**.
- Each admin will get **their own PIN eventually**. For now everyone uses the one shared PIN in the env (`ADMIN_PIN`).

## 4. Expense log (works like Venmo)
> **Built 2026-11-21, needs 2 steps from you before it's live:** run `supabase/migrations/0005_ledger.sql` in Supabase (SQL Editor), then commit + push. Verified: lint + production build pass; the page's query runs against your real Supabase (until 0005 is run, the page shows a "run 0005_ledger.sql" message instead of crashing). Not yet clicked through on the live site (it isn't deployed until you push). 0005 also copies over anything in the old expense tracker (it's empty right now).

- [x] **Adding an entry:** two buttons, **Expense** or **Reimbursement**. Pick one, enter the amount (+ what it was for), done.
  - Your name is filled in automatically from who's logged in. No name box.
  - **Expense** = I spent my own money on the group. Each person enters their own.
  - **Reimbursement** = money sent back to someone. Pick **who it's for**. Usually you'll enter these, since the ticket money goes to your account and you send the paybacks.
- [x] Each admin can still edit their own entries. (Edit + Delete show only on entries you added; the server checks it too.)
- [x] **Colors in the log:** expenses are **red/pink**, reimbursements are **green**. If everyone's been paid back, the reds and greens balance out. More red = someone still needs to be paid back.
- [x] **Shared log that every admin sees,** newest first, e.g.:
  - 🟥 "Callum spent $20 (posters)"
  - 🟩 "Callum received $20 from ticket sale funds (sent by Rachel)"
- [x] **"I got it" check (optional):** the person who was paid back can tap to confirm they received it. Probably nobody will, but build it anyway. Unconfirmed reimbursements still count as paid back.
- [x] Per-person balance: spent − reimbursed = still owed. The "E-board is owed $X" total on the dashboard uses this. (Someone paid back more than they spent shows as "overpaid" and doesn't reduce what others are owed **[assumed]**.)

## 5. Dashboard (every admin sees this)
The group isn't trying to make a profit. The money is for paying for things like costumes. So the numbers are:
- [x] **Tickets sold**
- [x] **Total revenue:** everything that came in (tickets + service fees + donations)
- [x] **Net profit from sales:** revenue − Stripe processing fees
- [x] **Total spent:** e-board expenses (from the expense log)
- [x] **Current balance:** net profit from sales − total spent. This is what the group actually has to spend.
- Later, not now: a budgeting area.
- > **Built 2026-11-21** at /admin (the admin home): the 5 big numbers, then ticket sales / service fees / donations / Stripe fees / checked in, and each event with "X sold of Y" + a bar. Only **paid** orders count. Verified: build passes; its queries run against your real Supabase (0 paid orders so far, so everything shows $0.00 until a test payment goes through). Live after you push. Total spent / Current balance show "—" until 0005_ledger.sql is run. Not built yet: the "sales over time" chart from SPEC §12.

## 6. Edit the event
- [x] Event editing stays in admin. In practice it'll be you doing it, since the others aren't technical. (No change needed: Dashboard → Events → Edit.)

## 7. Buyer spreadsheet
- [x] A list of **everyone who bought tickets**, which **every admin** can see as a **table right in the browser** (no Excel needed), plus a **CSV download**. No .xlsx.
  - **Built 2026-11-21** at /admin/buyers (menu: Buyers): table on a laptop, cards on a phone; filter by event; search by name / email / order number; **Download CSV** (opens in Google Sheets / Excel). Verified: build passes; its query runs against your real Supabase. Live after you push.

## 8. Looks (later, not tonight)
- The site is bare and ugly right now. You'll pick a new UI template from **21st.dev**; restyle after that. Keep the existing brand rules (light mode, sky blue + burgundy, 4px corners, Figtree).

## Progress log
(Every overnight run reads this first and continues from the "Next" step. Newest at the bottom.)
- 2026-11-21 ~02:00 · Set up the auto-resume: Claude Code cron job **34917247**, hourly at :07, runs inside this VS Code Claude session (session-only: it stops if VS Code / Claude is closed; auto-expires after 7 days). **Next:** §1 Stripe: compare Vercel env vars with `.env.local`, read Vercel logs.
- 2026-11-21 ~02:47 · **§1 Stripe done as far as automation allows** (details checked off in §1). Added 3 missing Vercel env vars + redeployed; Checkout opens on the live site; cancel, capacity, 10-max and cutoff verified; webhook secret verified (200 / 400); Checkout payment methods fixed to card + Cash App. **Only the actual card payment is left for the user** (Stripe blocks automated Pay). Test show moved to Sat Nov 28, 7:00 PM. Scratch tools used: Playwright in the session scratchpad. **Next:** §2 admin login: reproduce on the live site, read Vercel runtime logs.
- 2026-11-21 ~02:50 · **§2 admin login done.** Live login verified working (automated browser). Cause + code hardening noted in §2. **Next:** §4 Venmo-style expense log (new migration `0005_ledger.sql`, rewrite `/admin/expenses`), then §5 dashboard, §7 buyer list. §6 (event editing stays in admin) needs no change.
- 2026-11-21 ~03:30 · **§4 expense log, §5 dashboard, §7 buyer list built** (§6 needed no change). Verified: `npm run lint` + `npm run build` pass; the dashboard / buyer-list queries run against the real Supabase; the expense log waits for `0005_ledger.sql`. Not clicked through live yet (needs a push). Note: commit `643767c "STEP 1"` (pushed 02:14) contains only half of this work, so **Vercel's build of it FAILED**. The live site is still on the last good deploy (06:26 UTC, Stripe + login working). Pushing the remaining files fixes the build.
- 2026-11-21 ~03:30 · **All automatable work is done. Deleted the auto-resume cron job 34917247.** Left for the user: (1) run `0005_ledger.sql` in Supabase, (2) commit + push the changed files, (3) one real test payment with `4242 4242 4242 4242` on /events/stripe-test-show.
