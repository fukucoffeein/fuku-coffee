# ☕ FUKU Coffee — Storefront + Admin + Operations Suite

End-to-end commerce platform for FUKU Coffee, Surat:
- Storefront with cart, checkout, GPS location, WhatsApp ordering
- Chatbot widget with intent detection
- Admin portal with **5 logins** (`aakash` 🛡️ super + `vihang`/`nisarg`/`chilman`/`sulay`)
- Smart insights, sales charts, stock + batch management, expiry tracking
- Reseller program (unique links, auto-WA notification)
- Porter delivery integration (mock + live modes)
- Subscription plans (Weekly / Bi-Weekly / Monthly)
- Social media planner (calendar, partner pages, performance tracking)
- Invoice/receipt generator, command palette (⌘K), partner investment tracking

**Zero external dependencies** — Python 3 stdlib only.

---

## Local run

```bash
python3 server.py
```

Open:
- 🛒 **Storefront** → http://localhost:8765/
- 🔐 **Admin** → http://localhost:8765/admin

### Backend logins

| Username | Default password | Role |
|---|---|---|
| `aakash`  | `Aakash@2026`  | 🛡️ Operations & Management (super admin) |
| `vihang`  | `Vihang@2026`  | Coffee — Production & Quality |
| `nisarg`  | `Nisarg@2026`  | Payments & Finance |
| `chilman` | `Chilman@2026` | Operations & Marketing |
| `sulay`   | `Sulay@2026`   | Strategist & Business Advisor |

> ⚠️ **Change all 5 passwords** in `server.py` (the `USERS` dict) before going live.

---

## Reset / Go Live

To clear demo data and start using FUKU for real orders:

```bash
python3 go_live.py     # type "GO LIVE" to confirm
python3 server.py
```

Or use **Admin → Settings → Danger Zone** (super admin only).

---

## Deploy to a real host

### Option A — Render.com (recommended, free tier)

1. Push this folder to a GitHub repo
2. On Render: New → Web Service → connect the repo
3. Render auto-detects `render.yaml` and deploys
4. Your live URL: `https://fuku-coffee.onrender.com`

### Option B — Railway / Fly.io / Heroku-compatible host
The included `Procfile` (`web: python3 server.py`) works on any platform that respects it.

### Option C — Your own VPS (DigitalOcean, Hetzner, AWS)
```bash
git clone <repo>
cd fuku-website
nohup python3 server.py > fuku.log 2>&1 &
```
Optionally put nginx in front with HTTPS via LetsEncrypt.

---

## Project layout

```
fuku-website/
  server.py            ← Backend (HTTP + SQLite + all APIs)
  go_live.py           ← Wipe demo data → live mode
  seed.py              ← Demo data generator
  porter.py            ← Porter delivery client (mock + live)
  index.html           ← Storefront page
  styles.css           ← Storefront styles
  script.js            ← Storefront logic (cart, checkout)
  chatbot.js           ← Floating chatbot widget
  cursor.js            ← Custom cursor
  admin.html           ← Admin portal page
  admin.css            ← Admin styles
  admin.js             ← Admin logic
  products/            ← Real product photos
  fuku.db              ← SQLite database (auto-created)
  requirements.txt     ← (empty — stdlib only)
  Procfile             ← For Heroku-style hosts
  render.yaml          ← For Render.com
  .env.example         ← Copy to .env and fill in
  .gitignore           ← Keeps secrets + DB out of git
```

---

## What's built

### Storefront
- 14 products with real photos
- Reseller link system (`?ref=CODE` → banner + order tagging)
- Checkout modal with GPS share, address, payment method, free-shipping-zone detector
- Subscription plans (Weekly / Bi-Weekly / Monthly)
- Floating chatbot with intent detection + product cards in chat
- WhatsApp-first ordering (every CTA opens wa.me with prefilled order)
- Surat-only delivery: free within 5 km of Piplod, ₹50 elsewhere in Surat

### Admin Portal
- **Dashboard** — KPI cards, Smart Insights (auto-generated), sales chart (daily/weekly/monthly), top products, category mix
- **Orders** — list, edit, status, payment confirm, Porter book/track, invoice
- **Stock** — batches, expiry tracking, audit log (who changed what)
- **Products** — full catalog
- **Team** — 5 members, investment + equity tracking, performance stats
- **Resellers** — invite, share link, see commission owed
- **Subscriptions** — list, confirm via WhatsApp
- **Social Planner** — month calendar, partner pages (@iamsuratcity etc.), performance tracking
- **Chatbot** — conversation logs, intent analytics
- **Reports** — 90-day chart, CSV exports
- **Settings** — current user, accounts, danger zone (reset)
- **⌘K command palette** — fast search & nav
- **🔔 Notifications** — pending orders, low stock, expiring batches, payment backlog
- **🧾 Invoice generator** — printable receipt per order

### Backend
- `GET /api/products` (public)
- `POST /api/orders` (public — creates order, decrements stock, returns reseller WA URL)
- `POST /api/chat` (public — chatbot)
- `POST /api/admin/login` → bearer token
- 50+ admin endpoints — all behind auth, some behind super-admin
- Migrations run on startup; no destructive schema changes

---

## Contact

- Phone / WhatsApp: +91 95743 23011
- Email: hello@fukucoffee.in
- Instagram: @fukucoffee.in
- Location: Piplod, Surat, Gujarat 395007
