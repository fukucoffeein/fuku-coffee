# 🚀 Deploy FUKU Coffee to Vercel + fukucoffee.in

## Overview — 4 steps, ~15 minutes

1. **Turso** (DB) — 30 seconds signup
2. **Vercel** (host) — 1 click GitHub deploy
3. **Env vars** — paste Turso credentials into Vercel
4. **GoDaddy DNS** — point fukucoffee.in at Vercel

---

## Step 1 — Sign up for Turso (free)

Vercel can't host our SQLite file (read-only filesystem). Turso gives us a hosted SQLite-compatible DB.

1. Go to **https://turso.tech**
2. Click **"Get Started"** → **Sign up with GitHub** (1 click)
3. Once logged in → click **"Create Database"**
4. Name: **`fuku-coffee`**
5. Region: **Mumbai (BOM) or Bangalore (BLR)** for fastest Surat speed
6. Click **Create**

7. After creation, you'll see the database page. Click **"Generate Token"** (or "Create Token")
8. Set expiration: **Never** (or 1 year)
9. **Copy and save these two values somewhere safe:**

   ```
   TURSO_DATABASE_URL   = libsql://fuku-coffee-<yourname>.turso.io
   TURSO_AUTH_TOKEN     = eyJhbGciOi... (long string)
   ```

   You'll paste both into Vercel in Step 3.

---

## Step 2 — Deploy on Vercel

1. Go to **https://vercel.com**
2. Click **"Sign Up"** → **Continue with GitHub** (1 click)
3. From the dashboard → **"Add New… → Project"**
4. Find **`fukucoffeein/fuku-coffee`** in the list → click **"Import"**
   - If you don't see it: click **"Adjust GitHub App Permissions"** → grant Vercel access to that repo → come back

5. On the configure page:
   - **Framework Preset:** Other (auto-detected as Python)
   - **Root Directory:** leave blank
   - **Build & Output Settings:** leave defaults
6. **Don't click Deploy yet** — first add env vars (Step 3)

---

## Step 3 — Add the Turso env vars

Still on the Vercel configure page (before first deploy):

1. Expand **"Environment Variables"** section
2. Add **two** variables:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | paste the `libsql://...` URL from Turso |
   | `TURSO_AUTH_TOKEN`   | paste the long token from Turso |

3. Click **Deploy**
4. Wait ~2 minutes for first build

When done, Vercel gives you a URL like `https://fuku-coffee.vercel.app`. **Click it** — your storefront should load with all features working.

---

## Step 4 — Point fukucoffee.in at Vercel

In Vercel project:
1. Top tabs: **Settings → Domains**
2. Type **`fukucoffee.in`** → click Add
3. Vercel shows the DNS records you need. Should look like:
   - **A record** for `@` → `76.76.21.21`
   - **CNAME** for `www` → `cname.vercel-dns.com`

In GoDaddy:
1. Login → **My Products** → `fukucoffee.in` → **DNS**
2. **Delete existing A records** for `@`
3. **Add A record:**
   - Type: `A` · Name: `@` · Value: `76.76.21.21` · TTL: 600
4. **Add CNAME:**
   - Type: `CNAME` · Name: `www` · Value: `cname.vercel-dns.com` · TTL: 600
5. Save

**Wait 5-30 min** for DNS to propagate.

Verify in Vercel: domain shows green checkmark + "Valid Configuration".

🎉 **https://fukucoffee.in** is live with auto-HTTPS.

---

## Important — limitations on Vercel

1. **Image uploads from admin** (Products → Edit → Choose Photo) **won't persist**. The serverless filesystem is read-only. To add new product photos:
   - Drop them in `~/fuku-website/products/` locally
   - Commit + push to GitHub
   - Vercel auto-redeploys with the new images

2. **DB writes happen via Turso sync**. Should be near-instant from Mumbai but slightly slower than a local file.

3. **Cold starts**: First request after 5+ minutes of idle may take 1-2 seconds. Subsequent requests are fast.

---

## After going live — security checklist

1. **Rotate the 5 admin passwords** — edit `USERS` in `server.py`, push to GitHub, Vercel auto-redeploys.
   - Or even better: replace each hard-coded password with `os.environ.get('FUKU_PASS_AAKASH', 'fallback')` and set the real values as Vercel env vars (never in code).

2. **Run the Go-Live reset** once your real stock is ready:
   - Admin → Settings → Danger Zone → **Full Reset & Go Live**
   - Type `RESET` to confirm — wipes demo orders, zeros stock
   - Then Admin → Stock → **+ Add Stock** for each real product

3. **Test a real order** end-to-end from a different device.
