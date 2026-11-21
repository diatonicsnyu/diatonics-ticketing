# Issues to fix tonight (2026-11-21)

Written from your notes after a bad day: the admin login and Stripe both failed even though every key (Supabase, Stripe, Vercel token) was given. Fix these in order. SPEC.md is updated to match (D18, D19, D33, §3.8, §12 Admin).

## 1. Stripe has to work (top priority tonight)
- [ ] A test purchase on the **live Vercel site** works end to end: event page → Continue to payment → Stripe Checkout → pay with `4242 4242 4242 4242` → "You're going! 🎉" page with tickets → the order shows as **paid** in Supabase.
- [ ] The webhook works on Vercel too, not only on localhost: Stripe → Developers → Webhooks has an endpoint for `https://diatonics-ticketing.vercel.app/api/stripe/webhook`, and Vercel's `STRIPE_WEBHOOK_SECRET` is **that endpoint's** signing secret (not the one from the Stripe CLI).
- [ ] Every Stripe + Supabase variable in `.env.local` is also in Vercel (Production), then redeploy.
- [ ] Find the actual error first (Vercel → Logs, Stripe → Developers → Logs/Events) instead of guessing.

## 2. Admin dashboard won't open
- [ ] `/admin/login` on Vercel shows "This page couldn't load / A server error occurred", even though `ADMIN_PIN` is set in Vercel and it was redeployed. (This was paused earlier today; it's back on now.)
- [ ] Get the red error line from Vercel → Logs while logging in, then fix the cause. Suspects: `ADMIN_PIN` in Vercel isn't 4–8 digits only (the code throws on purpose), or migrations `0002` / `0003` were never run in Supabase.

## 3. Admin login (how it should work)
- Type **your name**, then **the PIN**.
- Each admin will get **their own PIN eventually**. For now everyone uses the one shared PIN in the env (`ADMIN_PIN`).

## 4. Expense log (works like Venmo)
- [ ] **Adding an entry:** two buttons, **Expense** or **Reimbursement**. Pick one, enter the amount (+ what it was for), done.
  - Your name is filled in automatically from who's logged in. No name box.
  - **Expense** = I spent my own money on the group. Each person enters their own.
  - **Reimbursement** = money sent back to someone. Pick **who it's for**. Usually you'll enter these, since the ticket money goes to your account and you send the paybacks.
- [ ] Each admin can still edit their own entries.
- [ ] **Colors in the log:** expenses are **red/pink**, reimbursements are **green**. If everyone's been paid back, the reds and greens balance out. More red = someone still needs to be paid back.
- [ ] **Shared log that every admin sees,** newest first, e.g.:
  - 🟥 "Callum spent $20 (posters)"
  - 🟩 "Callum received $20 from ticket sale funds (sent by Rachel)"
- [ ] **"I got it" check (optional):** the person who was paid back can tap to confirm they received it. Probably nobody will, but build it anyway. Unconfirmed reimbursements still count as paid back.
- [ ] Per-person balance: spent − reimbursed = still owed. The "E-board is owed $X" total on the dashboard uses this.

## 5. Dashboard (every admin sees this)
The group isn't trying to make a profit. The money is for paying for things like costumes. So the numbers are:
- [ ] **Tickets sold**
- [ ] **Total revenue:** everything that came in (tickets + service fees + donations)
- [ ] **Net profit from sales:** revenue − Stripe processing fees
- [ ] **Total spent:** e-board expenses (from the expense log)
- [ ] **Current balance:** net profit from sales − total spent. This is what the group actually has to spend.
- Later, not now: a budgeting area.

## 6. Edit the event
- [ ] Event editing stays in admin. In practice it'll be you doing it, since the others aren't technical.

## 7. Buyer spreadsheet
- [ ] A list of **everyone who bought tickets**, which **every admin** can see as a **table right in the browser** (no Excel needed), plus a **CSV download**. No .xlsx.

## 8. Looks (later, not tonight)
- The site is bare and ugly right now. You'll pick a new UI template from **21st.dev**; restyle after that. Keep the existing brand rules (light mode, sky blue + burgundy, 4px corners, Figtree).
