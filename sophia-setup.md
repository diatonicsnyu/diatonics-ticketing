# Setup session with Sophia

Everything the ticketing site needs from Sophia, in order. Parts 1 and 3 need her in the room; in part 2 she only accepts an invite. Parts 4–6 you can do yourself once you have the group Gmail login, but do them while she's still around in case Google asks her phone for a code.

**Never paste passwords or API keys into chat, Slack, or a group text.** Put them in your password manager, and put API keys only in `.env.local` (it's gitignored).

## Checklist

- [ ] 1. Group Gmail: you can sign in on your own
- [ ] 2. Stripe: your account, Sophia invited as View only
- [ ] 3. Show Sophia the prototype
- [x] 4. Supabase: account + project under the group Gmail
- [ ] 5. Resend: account + API key under the group Gmail
- [ ] 6. Vercel: account under the group Gmail, connected to the code
- [ ] 7. Talk through the open questions (bottom of this file)

---

## 1. Group Gmail (with Sophia, ~10 min)

Every service below is registered to this address, so you need to be able to sign in without her.

1. Get the address and password from Sophia. Save both in your password manager.
2. On your laptop, sign in at **gmail.com**. If Google shows "Verify it's you" and sends a prompt or code to Sophia's phone, she approves it.
3. Go to **myaccount.google.com → Security** (left menu).
4. Under **How you sign in to Google**, open **2-Step Verification**.
   - If it's **off**: leave it for now. Write down the recovery phone listed under **Recovery phone** so you know whose phone gets codes.
   - If it's **on**: add your own phone as an extra second step (**Phone numbers → Add phone number**, enter yours, confirm the code that arrives on your phone). Then open **Backup codes → Get backup codes** and save them in your password manager.
5. Sign out and sign back in once, to confirm you can get in without Sophia's phone.

**Done when:** you can sign in to the group Gmail from your laptop with no help.

## 2. Stripe (you, ~10 min; Sophia just accepts an invite)

The account is **yours** (decided 2026-11-20). The site uses **test mode** (fake card numbers) until go-live, and test mode needs no SSN or bank details. You fill those in only at go-live, and then payouts go to your bank.

1. Go to **dashboard.stripe.com/register**.
2. Email: **your own email** (it's your account, not the group's) **[assumed]**. Full name: yours. Password: a new one, saved in your password manager.
3. Click the verification link Stripe emails you.
4. Stripe may ask for the business name: **Diatonics**. Country: **United States**.
5. When Stripe asks you to **activate payments** or verify identity (SSN, bank account), **skip it.** Look for "Skip for now", "I'll do this later", or just close the setup checklist. That's only needed at go-live.
6. Make sure you're in **test mode** (newer accounts may call it a **Sandbox**). There's a toggle or switcher near the top.
7. Turn on Cash App Pay (already decided): **Settings → Payments → Payment methods** → find **Cash App Pay** → turn it **on**.
8. Get the test keys: **Developers → API keys**. You'll see a **Publishable key** (`pk_test_…`) and a **Secret key** (`sk_test_…`; click Reveal). Save both in your password manager. They go into `.env.local` when build step 2 starts.
9. Invite Sophia so she can see every payment:
   - Click the **gear icon (Settings)** in the top right → **Team and security** (it may be labeled **Team**).
   - **Add member** (or **New member**) → enter **Sophia's email** → role **View only** → send the invite.
   - **View only** lets her see all payments, totals, and payouts, but not change anything. Don't make her **Administrator**: admins can change the payout bank account.
10. Sophia opens the invite email and accepts it (she'll make a Stripe login if she doesn't have one).

**Done when:** Stripe is in test mode, Cash App Pay is on, and Sophia can log in and see the (empty) Payments page.

Before go-live, keep in mind: real payouts will go to your bank, and Stripe's tax form (1099-K) would be in your name. At these ticket prices you'll very likely stay under the reporting threshold. Still, keep the group's money separate from your own, and keep a simple record of where it goes.

## 3. Show Sophia the prototype (~15 min)

**Do this before part 4.** The site shows sample events only while Supabase keys are missing. Once you add them in part 4, it switches to the real (empty) database and the sample events disappear.

1. In the project folder, run `npm run dev`.
2. Open **http://localhost:3000** on your laptop. (Her phone can't open localhost, so show it on your screen.)
3. Walk through:
   - the home page and an event page (**Winter Concert** or **Spring Showcase**)
   - buying tickets → the pretend checkout → the confirmation page
   - the ticket email preview: **/demo/email**
   - the door scanner: **/demo/door**
   - the **Donate** page
   - the admin page: **/admin**
4. Write down her feedback.

## 4. Supabase (~10 min)

The database. Your personal Supabase account is at its 2-free-project limit, so this goes on a new account.

1. Go to **supabase.com** → **Start your project** / **Sign up**.
2. Sign up with **email + password using the group Gmail address**. Don't use "Continue with GitHub", which would tie it to your personal GitHub. Confirm the email from the group inbox.
3. Create an organization: name **Diatonics**, plan **Free**.
4. **New project**:
   - Name: `diatonics-ticketing`
   - Database password: click **Generate**, then save it in your password manager
   - Region: **East US (North Virginia)**, the closest to NYC **[assumed]**
   - Then wait about 2 minutes while it sets up.
5. Get the keys:
   - **Project Settings → Data API**: copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project Settings → API Keys**: copy the **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the **Secret key** (`sb_secret_…`) → `SUPABASE_SECRET_KEY`
6. Set the admin PIN: `ADMIN_PIN` = the leadership PIN (4–8 digits, one shared PIN for e-board for now). No Supabase user is needed: admin login is name + PIN (SPEC D18).
7. In the project folder, copy `.env.example` to `.env.local` and fill in the four values above. Leave `NEXT_PUBLIC_SITE_URL` as `http://localhost:3000`.
8. In Supabase's **SQL Editor**, run each file in `supabase/migrations/` in number order (0001, 0002, 0003, …).

**Done when:** `npm run dev` starts without errors and the home page no longer shows the sample events.

## 5. Resend (~5 min)

Sends the ticket emails.

1. Go to **resend.com** → **Sign up**. Use **Continue with Google** with the group Gmail, or sign up with the group Gmail address.
2. Skip any "add a domain" step. The domain comes at go-live.
3. **API Keys → Create API Key**:
   - Name: `diatonics-ticketing`
   - Permission: **Sending access**
4. Copy the key (`re_…`). **Resend shows it only once.** Save it in your password manager. It goes into `.env.local` when build step 3 starts.

Heads-up: until the domain is verified, Resend only delivers to the email address that owns the account. Since that's the group Gmail, **test ticket emails will land in the group Gmail inbox**, not your personal one.

## 6. Vercel (~10 min)

Hosting. You need it to test the scanner on a real phone, because phones can't open localhost and the camera needs https.

1. Go to **vercel.com/signup** → plan **Hobby** → **Continue with Email** → the group Gmail address. Confirm the code sent to the group inbox.
2. Connect the code. Try **A** first:
   - **A. GitHub:** **Add New… → Project → Import Git Repository** → connect GitHub with **your** GitHub login → give Vercel access to the `diatonics-ticketing` repo → **Import**. Leave the framework as **Next.js** and the build settings as they are.
     - If Vercel says your GitHub account is **already connected to another Vercel account** (your personal one), use **B** instead.
   - **B. From your laptop:** in the project folder, run `npx vercel login`, log in with the group Gmail, then run `npx vercel` and accept the defaults.
3. Add the Supabase values: in the project, **Settings → Environment Variables**. Add the same keys as `.env.local`, except `NEXT_PUBLIC_SITE_URL`, which should be the Vercel address (`https://diatonics-ticketing.vercel.app`, or whatever Vercel assigns).
4. **Deployments → Redeploy** so it picks up the variables.

**Done when:** the Vercel link opens the site on your phone.

Note for later: Vercel's Hobby plan is meant for non-commercial use, and selling tickets may count as commercial. That's fine for testing. Before go-live, check whether you need **Pro** ($20/month) or a different host.

---

## 7. Open questions to bring up with Sophia

None of these block building. They only matter at go-live.

- **Stripe:** tell her it's under your name, and that she has View only access to see every payment.
- **Student ticket:** has the group voted yet?
- **Domain:** who pays for `diatonics.com` (about $10–11/year, Cloudflare) when it's time to buy it?
