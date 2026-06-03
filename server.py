"""
FUKU Coffee — Backend Server
Python 3 stdlib only (no external dependencies).
Run:  python3 server.py
"""

import json
import os
import re
import socket
import sqlite3
import secrets
import hashlib
import urllib.parse
from datetime import datetime, timedelta, date
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Lock
import mimetypes
import porter as porter_api

# Dual-stack HTTP server (IPv4 + IPv6) so both `localhost` and `127.0.0.1` work.
class DualStackHTTPServer(HTTPServer):
    address_family = socket.AF_INET6
    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()

# ============================================
# CONFIG
# ============================================
HERE       = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = HERE  # serve static files from project root
DB_PATH    = os.path.join(HERE, 'fuku.db')
PORT       = int(os.environ.get('PORT', 8765))

# ============================================
# BACKEND ACCOUNTS — change passwords here
# ============================================
USERS = {
    'aakash':  {'password': 'Aakash@2026',  'name': 'Aakash',  'role': 'Operations & Management',
                'is_super': True},
    'vihang':  {'password': 'Vihang@2026',  'name': 'Vihang',  'role': 'Coffee — Production & Quality',
                'is_super': False},
    'nisarg':  {'password': 'Nisarg@2026',  'name': 'Nisarg',  'role': 'Payments & Finance',
                'is_super': False},
    'chilman': {'password': 'Chilman@2026', 'name': 'Chilman', 'role': 'Operations & Marketing',
                'is_super': False},
    'sulay':   {'password': 'Sulay@2026',   'name': 'Sulay',   'role': 'Strategist & Business Advisor',
                'is_super': False},
}
SECRET     = os.environ.get('FUKU_SECRET', 'fuku-secret-2026-change-me')
TOKEN_TTL  = 30 * 24 * 3600   # 30 days

DB_LOCK = Lock()

WA_NUMBER  = '919574323011'

# Service area: Surat only. Free delivery within ~5km of Piplod, paid for
# rest of Surat, no auto-delivery outside Surat (WhatsApp confirmation needed).
PIPLOD_5KM_PINCODES = {'395007','395017','395009','395013'}  # Piplod, Vesu, Citylight, Athwa
SURAT_PAID_PINCODES = {'395001','395002','395003','395004','395005','395006','395008',
                       '395010','395011','395012','395023'}  # other Surat areas
SURAT_PAID_FEE = 50          # flat fee for paid Surat zones
FREE_RADIUS_LABEL = '5 km from Piplod'

def _pincode_from(addr):
    m = re.search(r'\b(\d{6})\b', addr or '')
    return m.group(1) if m else ''

def shipping_for(addr):
    """Return (fee, zone) where zone ∈ free|paid|outside|unknown."""
    pc = _pincode_from(addr)
    if pc in PIPLOD_5KM_PINCODES: return (0, 'free')
    if pc in SURAT_PAID_PINCODES: return (SURAT_PAID_FEE, 'paid')
    if pc.startswith('395') or pc.startswith('394'): return (SURAT_PAID_FEE, 'paid')
    if not pc: return (0, 'unknown')              # confirm on WA
    return (0, 'outside')                         # we'll reject / confirm on WA

DEFAULT_TEAM = [
    dict(id='vihang',  name='Vihang',  role='Coffee — Production & Quality',
         is_coffee_handler=1, phone='', email=''),
    dict(id='chilman', name='Chilman', role='Operations & Marketing',
         is_coffee_handler=0, phone='', email=''),
    dict(id='nisarg',  name='Nisarg',  role='Payments & Finance',
         is_payment_handler=1, phone='', email=''),
    dict(id='aakash',  name='Aakash',  role='Operations & Management',
         is_coffee_handler=0, phone='', email=''),
    dict(id='sulay',   name='Sulay',   role='Strategist & Business Advisor',
         is_coffee_handler=0, phone='', email=''),
]

DEFAULT_SOCIAL_PARTNERS = [
    dict(handle='@iamsuratcity',     platform='instagram', category='city',     followers=850000, typical_cost=3500, notes='Top Surat aggregator'),
    dict(handle='@foodie_surat',     platform='instagram', category='foodie',   followers=410000, typical_cost=2500, notes='Food-focused, high engagement'),
    dict(handle='@suratfoodguide',   platform='instagram', category='foodie',   followers=180000, typical_cost=1500, notes='Story features popular'),
    dict(handle='@surat_lokal',      platform='instagram', category='city',     followers=120000, typical_cost=1200, notes='Local-business friendly'),
    dict(handle='@suratchaska',      platform='instagram', category='foodie',   followers=75000,  typical_cost=900,  notes='Reels reach is strong'),
    dict(handle='@whatsuratbiz',     platform='instagram', category='business', followers=42000,  typical_cost=600,  notes='B2B / cafe owners'),
    dict(handle='@fukucoffee.in',    platform='instagram', category='own',      followers=2400,   typical_cost=0,    notes='Our own page'),
]

# ============================================
# DATABASE
# ============================================
def db():
    """Open a DB connection.
       - If TURSO_DATABASE_URL is set (Vercel / production), uses libsql-experimental
         to sync with Turso cloud (sqlite3-compatible API).
       - Otherwise falls back to local SQLite (dev / VPS).
    """
    turso_url = os.environ.get('TURSO_DATABASE_URL', '').strip()
    if turso_url:
        try:
            import libsql_experimental as libsql
            conn = libsql.connect(
                '/tmp/fuku-local.db',
                sync_url=turso_url,
                auth_token=os.environ.get('TURSO_AUTH_TOKEN', ''),
            )
            conn.sync()
            conn.row_factory = sqlite3.Row
            conn.execute('PRAGMA foreign_keys = ON')
            return conn
        except Exception as e:
            print(f'[fuku] Turso connect failed → falling back to local SQLite: {e}')
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

def init_db():
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          cat TEXT NOT NULL,
          name TEXT NOT NULL,
          short TEXT,
          sub TEXT,
          description TEXT,
          price INTEGER NOT NULL,
          was INTEGER,
          roast TEXT,
          type TEXT,
          bag_color TEXT,
          label TEXT,
          combo_items TEXT,
          badge TEXT,
          bestseller INTEGER DEFAULT 0,
          stock INTEGER NOT NULL DEFAULT 0,
          low_stock_threshold INTEGER DEFAULT 10,
          validity_days INTEGER DEFAULT 60,
          active INTEGER DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_no TEXT UNIQUE NOT NULL,
          customer_name TEXT,
          customer_phone TEXT,
          customer_email TEXT,
          shipping_address TEXT,
          subtotal INTEGER NOT NULL,
          shipping INTEGER DEFAULT 0,
          discount INTEGER DEFAULT 0,
          total INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          source TEXT DEFAULT 'web',
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          qty INTEGER NOT NULL,
          unit_price INTEGER NOT NULL,
          line_total INTEGER NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(id)
        );

        CREATE TABLE IF NOT EXISTS stock_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT NOT NULL,
          delta INTEGER NOT NULL,
          reason TEXT,
          new_stock INTEGER,
          changed_by TEXT DEFAULT 'system',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS stock_batches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT NOT NULL,
          qty_added INTEGER NOT NULL,
          batch_date TEXT NOT NULL,
          expiry_date TEXT NOT NULL,
          notes TEXT,
          added_by TEXT DEFAULT 'admin',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_batches_expiry  ON stock_batches(expiry_date);
        CREATE INDEX IF NOT EXISTS idx_batches_product ON stock_batches(product_id);

        CREATE TABLE IF NOT EXISTS chat_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          user_msg TEXT,
          bot_msg TEXT,
          intent TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS team_members (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT,
          phone TEXT,
          email TEXT,
          is_payment_handler INTEGER DEFAULT 0,
          is_coffee_handler  INTEGER DEFAULT 0,
          invested_amount INTEGER DEFAULT 0,
          equity_pct REAL DEFAULT 0,
          active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS resellers (
          ref_code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          city TEXT,
          commission_pct REAL DEFAULT 10,
          notes TEXT,
          active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan TEXT NOT NULL,
          customer_name TEXT,
          customer_phone TEXT,
          customer_email TEXT,
          shipping_address TEXT,
          product_id TEXT,
          qty_per_delivery INTEGER DEFAULT 1,
          frequency_days INTEGER DEFAULT 30,
          status TEXT DEFAULT 'requested',
          next_delivery TEXT,
          total_deliveries INTEGER DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS social_partners (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          handle TEXT NOT NULL UNIQUE,
          platform TEXT DEFAULT 'instagram',
          category TEXT,
          followers INTEGER,
          contact_name TEXT,
          contact_phone TEXT,
          typical_cost INTEGER DEFAULT 0,
          notes TEXT,
          active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS social_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content_type TEXT NOT NULL,
          platform TEXT NOT NULL DEFAULT 'instagram',
          partner_handle TEXT,
          scheduled_date TEXT NOT NULL,
          scheduled_time TEXT,
          status TEXT DEFAULT 'draft',
          caption TEXT,
          hashtags TEXT,
          media_notes TEXT,
          assigned_to TEXT,
          cost INTEGER DEFAULT 0,
          posted_at TEXT,
          posted_url TEXT,
          reach INTEGER DEFAULT 0,
          likes INTEGER DEFAULT 0,
          comments INTEGER DEFAULT 0,
          shares INTEGER DEFAULT 0,
          saves INTEGER DEFAULT 0,
          link_clicks INTEGER DEFAULT 0,
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_posts_date   ON social_posts(scheduled_date);
        CREATE INDEX IF NOT EXISTS idx_posts_status ON social_posts(status);

        CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
        ''')
        # Migration: add validity_days column to existing DBs
        try:
            c.execute('ALTER TABLE products ADD COLUMN validity_days INTEGER DEFAULT 60')
        except sqlite3.OperationalError:
            pass
        # Migration: add changed_by to stock_log
        try:
            c.execute("ALTER TABLE stock_log ADD COLUMN changed_by TEXT DEFAULT 'system'")
        except sqlite3.OperationalError:
            pass
        # Migration: image_url on products
        try:
            c.execute("ALTER TABLE products ADD COLUMN image_url TEXT")
        except sqlite3.OperationalError:
            pass
        # Auto-populate image_url where a file exists in products/ matching the id
        for r in c.execute("SELECT id, image_url FROM products").fetchall():
            if r['image_url']:  # don't overwrite custom URLs
                continue
            for ext in ('jpg','jpeg','png','webp'):
                local = f'products/{r["id"]}.{ext}'
                if os.path.isfile(os.path.join(HERE, local)):
                    c.execute('UPDATE products SET image_url = ? WHERE id = ?',
                              ('/' + local, r['id']))
                    break
        # Migration: investment fields on team_members
        for col, ddl in [('invested_amount', 'INTEGER DEFAULT 0'),
                         ('equity_pct',      'REAL DEFAULT 0')]:
            try: c.execute(f'ALTER TABLE team_members ADD COLUMN {col} {ddl}')
            except sqlite3.OperationalError: pass
        # Migration: reseller_ref on orders
        try: c.execute('ALTER TABLE orders ADD COLUMN reseller_ref TEXT')
        except sqlite3.OperationalError: pass
        # Porter delivery columns + team + payment columns
        for col, ddl in [
            ('porter_order_id',     'TEXT'),
            ('porter_status',       'TEXT'),
            ('porter_tracking_url', 'TEXT'),
            ('porter_fare',         'INTEGER'),
            ('porter_eta_minutes',  'INTEGER'),
            ('porter_vehicle',      'TEXT'),
            ('porter_booked_at',    'TEXT'),
            ('porter_payload',      'TEXT'),
            ('entered_by',          "TEXT"),
            ('coffee_handled_by',   "TEXT"),
            ('payment_method',      "TEXT DEFAULT 'pending'"),  # cash | online | pending
            ('payment_status',      "TEXT DEFAULT 'unpaid'"),   # unpaid | paid | refunded
            ('payment_confirmed_by','TEXT'),
            ('payment_confirmed_at','TEXT'),
            ('payment_reference',   'TEXT'),                    # UPI ref / txn id
        ]:
            try:
                c.execute(f'ALTER TABLE orders ADD COLUMN {col} {ddl}')
            except sqlite3.OperationalError:
                pass

        # Seed default Surat social partners — only if empty
        if c.execute('SELECT COUNT(*) AS c FROM social_partners').fetchone()['c'] == 0:
            for sp in DEFAULT_SOCIAL_PARTNERS:
                c.execute('''
                    INSERT INTO social_partners (handle, platform, category, followers,
                                                  typical_cost, notes)
                    VALUES (?,?,?,?,?,?)
                ''', (sp['handle'], sp.get('platform','instagram'), sp.get('category'),
                      sp.get('followers'), sp.get('typical_cost', 0), sp.get('notes','')))

        # Seed / sync default team — adds any missing members without touching existing ones
        for tm in DEFAULT_TEAM:
            c.execute('''
                INSERT OR IGNORE INTO team_members (id, name, role, phone, email,
                                                    is_payment_handler, is_coffee_handler)
                VALUES (?,?,?,?,?,?,?)
            ''', (tm['id'], tm['name'], tm['role'], tm.get('phone',''), tm.get('email',''),
                  tm.get('is_payment_handler', 0), tm.get('is_coffee_handler', 0)))

# ============================================
# AUTH
# ============================================
def make_token(username):
    """Stateless signed token: <base64-payload>.<hmac-sig>
       Works across serverless invocations — no shared memory needed."""
    import base64, json, time
    payload = {'u': username, 't': int(time.time())}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    sig = hashlib.sha256((payload_b64 + SECRET).encode()).hexdigest()[:32]
    return f'{payload_b64}.{sig}'

def verify_token(token):
    """Return username if token is valid + unexpired, else None."""
    import base64, json, time
    try:
        payload_b64, sig = token.rsplit('.', 1)
        expected_sig = hashlib.sha256((payload_b64 + SECRET).encode()).hexdigest()[:32]
        if not hmac_eq(sig, expected_sig):
            return None
        padded = payload_b64 + '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        if time.time() - payload['t'] > TOKEN_TTL:
            return None
        return payload['u']
    except Exception:
        return None

def hmac_eq(a, b):
    """Constant-time string compare (avoids timing leaks)."""
    if len(a) != len(b): return False
    out = 0
    for x, y in zip(a, b):
        out |= ord(x) ^ ord(y)
    return out == 0

def current_user(handler):
    """Return the username tied to the request's Bearer token, or None."""
    auth = handler.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:].strip()
        return verify_token(token)
    return None

def is_authed(handler):
    return current_user(handler) is not None

def is_super(handler):
    u = current_user(handler)
    return bool(u and USERS.get(u, {}).get('is_super'))

# ============================================
# CHATBOT — Rule-based with smart upsells
# ============================================
def bot_intent(msg):
    m = msg.lower().strip()

    if re.search(r'\b(hi|hello|hey|hola|namaste|good morning|good afternoon|good evening|sup|yo)\b', m):
        return 'greeting'
    if any(k in m for k in ['help', 'human', 'agent', 'representative', 'talk to someone']):
        return 'escalate'
    if any(k in m for k in ['order', 'buy', 'purchase', 'place order', 'checkout']):
        return 'order_help'
    if any(k in m for k in ['shipping', 'delivery', 'ship', 'deliver', 'how long', 'when will']):
        return 'shipping'
    if any(k in m for k in ['return', 'refund', 'cancel']):
        return 'returns'
    if any(k in m for k in ['contact', 'phone', 'whatsapp', 'call', 'reach you']):
        return 'contact'
    if any(k in m for k in ['hours', 'open', 'timing', 'when are you']):
        return 'hours'
    if any(k in m for k in ['recommend', 'suggest', 'best', 'which one', 'what should', 'help me choose']):
        return 'recommend'
    if any(k in m for k in ['cold brew', 'cold-brew', 'iced', 'refreshing']):
        return 'cold_brew'
    if any(k in m for k in ['instant', 'quick', 'fast', '30 seconds']):
        return 'instant'
    if any(k in m for k in ['yoko', 'kiyo', 'yuhi', 'bean', 'whole bean', 'ground', 'roast']):
        return 'beans'
    if any(k in m for k in ['combo', 'pack', 'bundle']):
        return 'combo'
    if any(k in m for k in ['price', 'cost', 'how much', 'rates']):
        return 'pricing'
    if any(k in m for k in ['brew', 'how to make', 'french press', 'pour over', 'v60', 'moka']):
        return 'brewing'
    if any(k in m for k in ['discount', 'offer', 'sale', 'coupon', 'code', 'promo']):
        return 'discount'
    if any(k in m for k in ['thanks', 'thank you', 'thx', 'ty', 'cheers']):
        return 'thanks'
    if any(k in m for k in ['bye', 'goodbye', 'see you', 'cya']):
        return 'bye'
    return 'fallback'


def bot_reply(msg, cart_total=0):
    intent = bot_intent(msg)
    products = []
    quick = []
    text = ''
    action = None

    if intent == 'greeting':
        text = ("Hey there! ☕ Welcome to FUKU Coffee. I'm your virtual barista — "
                "I can help you pick a blend, place an order, or answer questions. "
                "What are you in the mood for?")
        quick = ['Recommend me a blend', 'Show cold brew', 'Show best sellers', 'Shipping info']

    elif intent == 'recommend':
        text = ("Happy to help! Quick question — what's your vibe?\n\n"
                "🌑 Bold & rich (great with milk) → **YOKO** or **KIYO** (dark roast)\n"
                "🌤️ Smooth & fruity (great pour-over) → **YUHI** (medium roast)\n"
                "❄️ Cold and refreshing → **Cold Brew**\n"
                "⚡ Fast & easy → **FUKU Instant**\n\n"
                "Want me to add one to your cart?")
        quick = ['Add YOKO 250g', 'Add YUHI 250g', 'Add Cold Brew 1L', 'Show all']
        products = ['yoko-250g', 'yuhi-250g', 'cb-1l']

    elif intent == 'cold_brew':
        text = ("Our cold brew is 16-hour slow-steeped — smooth, naturally sweet, "
                "67% less acidic than hot coffee. Available in:\n\n"
                "• Classic 200ml — ₹100 (save ₹50)\n"
                "• Classic 1 Litre — ₹500 (save ₹150)\n"
                "• Combo 1 (+ Tonic) — ₹160\n"
                "• Combo 2 (+ Tonic + Lemon) — ₹210\n"
                "• Big Combo (10 servings) — ₹1,000 — best value")
        quick = ['Add Big Combo', 'Add Classic 1L', 'Show all cold brew']
        products = ['cb-1l', 'cb-200', 'combo-big', 'combo-1']

    elif intent == 'instant':
        text = ("Our instant coffee is freeze-dried from the FUKU signature blend — "
                "premium quality, bold taste, ready in 30 seconds.\n\n"
                "• 250g pouch — ₹500 (was ₹690)\n"
                "• 1 Kg pouch — ₹2,000 (was ₹3,000) — best value\n\n"
                "Perfect for offices, travel, and busy mornings.")
        quick = ['Add Instant 250g', 'Add Instant 1Kg', 'Back to recommendations']
        products = ['instant-250g', 'instant-1kg']

    elif intent == 'beans':
        text = ("We have 3 single-origin Arabica blends, roasted weekly in Surat:\n\n"
                "**YOKO** — Dark roast · Dark Chocolate, Oak, Vanilla\n"
                "**KIYO** — Dark roast · Dark Chocolate, Roasted Almond, Light Caramel\n"
                "**YUHI** — Medium roast · Milk Chocolate, Peach, Cranberry, Roasted Nuts\n\n"
                "Available in 250g (₹500–600) and 1kg (₹2,000–2,400). Whole bean or ground.")
        quick = ['Add YOKO 250g', 'Add YUHI 250g', 'Add KIYO 250g', 'Help me choose']
        products = ['yoko-250g', 'kiyo-250g', 'yuhi-250g']

    elif intent == 'combo':
        text = ("Combos are our best-value packs:\n\n"
                "🥤 **Big Combo** — 1L Cold Brew + 5 Tonic + Lime Powder = ₹1,000 (10 servings)\n"
                "🥤 **Combo 2** — 200ml Cold Brew + Tonic + Lemon = ₹210\n"
                "🥤 **Combo 1** — 200ml Cold Brew + Tonic = ₹160\n\n"
                "The Big Combo is our top seller — perfect for weekends with friends.")
        quick = ['Add Big Combo', 'Add Combo 2', 'Show cold brew range']
        products = ['combo-big', 'combo-2', 'combo-1']

    elif intent == 'order_help':
        text = ("Easy! Two ways to order:\n\n"
                "🛒 **Add to cart** here on the site → click *Checkout on WhatsApp* — I'll send your order to our team.\n\n"
                "📱 **Direct WhatsApp** — message us at +91 95743 23011, we reply within minutes.\n\n"
                "Free shipping over ₹999. Delivery in 3–5 days across India.")
        quick = ['Show best sellers', 'Free shipping info', 'Payment options']

    elif intent == 'shipping':
        text = ("📦 **Delivery — Surat only for now:**\n"
                "• **FREE** within 5 km of Piplod (Vesu, Citylight, Athwa, Piplod)\n"
                "• **₹50** for other Surat pincodes\n"
                "• Same-day or next-day delivery in most cases\n"
                "• Cash on delivery + UPI accepted\n\n"
                "Outside Surat? Message us on WhatsApp — we'll arrange a courier and confirm the cost.")
        quick = ['Order on WhatsApp', 'My pincode is 395007', 'Outside Surat options']

    elif intent == 'returns':
        text = ("🔄 **Returns are easy:**\n"
                "• 7-day return window\n"
                "• Message us on WhatsApp with your order number\n"
                "• Damaged/unsatisfied? We replace or refund — no forms, no fuss\n"
                "• Refunds within 3–5 working days")
        quick = ['Contact support', 'Order help']

    elif intent == 'contact':
        text = ("Reach us anytime:\n\n"
                "📱 WhatsApp: +91 95743 23011 (fastest)\n"
                "📞 Phone: +91 95743 23011\n"
                "📧 Email: hello@fukucoffee.in\n"
                "📷 Instagram: @fukucoffee.in\n"
                "📍 Surat, Gujarat\n"
                "🕐 Mon–Sat · 9am — 8pm IST")
        quick = ['Open WhatsApp', 'Show products']

    elif intent == 'hours':
        text = ("We're open **Mon–Sat, 9am — 8pm IST**. "
                "WhatsApp orders are processed within hours during business time, "
                "and the next morning if sent overnight.")
        quick = ['Place an order', 'Best sellers']

    elif intent == 'pricing':
        text = ("Quick price guide:\n\n"
                "🥤 Cold Brew 200ml — ₹100\n"
                "🥤 Cold Brew 1L — ₹500\n"
                "☕ Instant 250g — ₹500\n"
                "☕ Beans 250g — ₹500–600\n"
                "☕ Beans 1Kg — ₹2,000–2,400\n"
                "🎁 Big Combo — ₹1,000 (best value)\n\n"
                "All prices include GST. Free shipping over ₹999.")
        quick = ['Show best sellers', 'Recommend something', 'Help me choose']

    elif intent == 'brewing':
        text = ("Great question! Quick guide:\n\n"
                "**French Press** — 30g coarse + 500ml @ 93°C, steep 4 min\n"
                "**Pour Over (V60)** — 20g medium-fine + 320ml, 3 min total\n"
                "**Moka Pot** — 18g fine, medium heat, pull off when it gurgles\n"
                "**Cold Brew** — 100g coarse + 1L water, fridge 16 hours\n\n"
                "Want me to recommend the right beans for your method?")
        quick = ['I use French Press', 'I use Pour Over', 'I use Moka Pot']

    elif intent == 'discount':
        text = ("🎁 **Current offers:**\n"
                "• Up to 30% off site-wide (already applied — see strikethrough prices)\n"
                "• Free shipping over ₹999\n"
                "• Use code **FUKU10** for an extra 10% off your first order\n\n"
                "I can add the code at checkout for you!")
        quick = ['Show best sellers', 'Apply FUKU10']
        action = 'discount_code'

    elif intent == 'escalate':
        text = ("Sure! For anything I can't help with, message our team directly on WhatsApp — "
                "we reply within minutes during business hours.")
        quick = ['Open WhatsApp']
        action = 'whatsapp'

    elif intent == 'thanks':
        text = "Anytime! ☕ Let me know if you want anything else."
        quick = ['Show best sellers', 'New arrivals']

    elif intent == 'bye':
        text = "Goodbye! Come back for your next caffeine fix. ☕"
        quick = []

    else:  # fallback
        text = ("Hmm, I'm not sure I caught that. I can help with:\n"
                "• Product recommendations\n• Pricing & combos\n• Shipping & orders\n• Brewing tips\n"
                "Or just message our team on WhatsApp for anything specific!")
        quick = ['Recommend me a blend', 'Show cold brew', 'Shipping info', 'Open WhatsApp']

    # No free-shipping threshold anymore — local-delivery model.

    return {
        'text': text,
        'quick_replies': quick,
        'products': products,
        'intent': intent,
        'action': action,
    }

# ============================================
# HTTP HANDLER
# ============================================
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Cleaner log format
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.command} {self.path} → {args[1] if len(args) > 1 else ''}")

    # ----- helpers -----
    def _json(self, data, status=200):
        body = json.dumps(data, default=str).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def _err(self, msg, status=400):
        self._json({'error': msg}, status)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return {}

    def _require_auth(self):
        if not is_authed(self):
            self._err('Unauthorized', 401)
            return False
        return True

    def _require_super(self):
        if not is_authed(self):
            self._err('Unauthorized', 401); return False
        if not is_super(self):
            self._err('Super admin only — ask Aakash for this action.', 403); return False
        return True

    def _serve_file(self, path):
        full = os.path.normpath(os.path.join(PUBLIC_DIR, path.lstrip('/')))
        if not full.startswith(PUBLIC_DIR):
            return self._err('Forbidden', 403)
        if os.path.isdir(full):
            full = os.path.join(full, 'index.html')
        if not os.path.isfile(full):
            return self._err('Not found', 404)
        ctype, _ = mimetypes.guess_type(full)
        ctype = ctype or 'application/octet-stream'
        with open(full, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    # ----- CORS preflight -----
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.end_headers()

    # ----- GET -----
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        p = url.path
        qs = urllib.parse.parse_qs(url.query)

        if p == '/api/products':
            return self._json(self.list_products())
        if p.startswith('/api/products/'):
            pid = p.split('/')[-1]
            return self._json(self.get_product(pid) or {})
        if p == '/api/admin/orders':
            if not self._require_auth(): return
            limit  = int(qs.get('limit', ['50'])[0])
            status = qs.get('status', [None])[0]
            return self._json(self.list_orders(limit, status))
        if p.startswith('/api/admin/orders/'):
            if not self._require_auth(): return
            oid = int(p.split('/')[-1])
            return self._json(self.get_order(oid))
        if p == '/api/admin/sales/daily':
            if not self._require_auth(): return
            days = int(qs.get('days', ['30'])[0])
            return self._json(self.sales_daily(days))
        if p == '/api/admin/sales/weekly':
            if not self._require_auth(): return
            weeks = int(qs.get('weeks', ['12'])[0])
            return self._json(self.sales_weekly(weeks))
        if p == '/api/admin/sales/monthly':
            if not self._require_auth(): return
            months = int(qs.get('months', ['12'])[0])
            return self._json(self.sales_monthly(months))
        if p == '/api/admin/sales/summary':
            if not self._require_auth(): return
            return self._json(self.sales_summary())
        if p == '/api/admin/sales/top-products':
            if not self._require_auth(): return
            return self._json(self.top_products())
        if p == '/api/admin/sales/by-category':
            if not self._require_auth(): return
            return self._json(self.sales_by_category())
        if p == '/api/admin/stock/low':
            if not self._require_auth(): return
            return self._json(self.low_stock())
        if p == '/api/admin/stock/log':
            if not self._require_auth(): return
            return self._json(self.stock_history(int(qs.get('limit', ['100'])[0])))
        if p == '/api/admin/stock/batches':
            if not self._require_auth(): return
            return self._json(self.list_batches(
                qs.get('product_id', [None])[0],
                int(qs.get('limit', ['200'])[0])
            ))
        if p == '/api/admin/stock/expiring':
            if not self._require_auth(): return
            return self._json(self.list_expiring(int(qs.get('days', ['14'])[0])))
        if p == '/api/admin/chat/log':
            if not self._require_auth(): return
            return self._json(self.chat_history(int(qs.get('limit', ['100'])[0])))
        # ---- Resellers ----
        if p == '/api/admin/resellers':
            if not self._require_auth(): return
            return self._json(self.list_resellers())
        if p.startswith('/api/admin/resellers/') and p.endswith('/stats'):
            if not self._require_auth(): return
            ref = p.split('/')[-2]
            return self._json(self.reseller_stats(ref))
        if p.startswith('/api/reseller/'):
            ref = p.split('/')[-1]
            return self._json(self.public_reseller(ref))
        # ---- Subscriptions ----
        if p == '/api/admin/subscriptions':
            if not self._require_auth(): return
            return self._json(self.list_subscriptions())
        if p == '/api/admin/porter/config':
            if not self._require_auth(): return
            return self._json({
                'mock_mode':  porter_api.is_mock(),
                'pickup':     porter_api.PICKUP,
                'base_url':   porter_api.PORTER_BASE_URL,
                'has_key':    bool(porter_api.PORTER_API_KEY),
            })
        if p == '/api/admin/insights':
            if not self._require_auth(): return
            return self._json(self.smart_insights())
        if p == '/api/admin/notifications':
            if not self._require_auth(): return
            return self._json(self.notifications())
        if p == '/api/admin/search':
            if not self._require_auth(): return
            q = qs.get('q', [''])[0]
            return self._json(self.global_search(q))
        # ---- Social planner ----
        if p == '/api/admin/social/posts':
            if not self._require_auth(): return
            return self._json(self.list_social_posts(
                qs.get('month',[None])[0], qs.get('status',[None])[0]
            ))
        if p == '/api/admin/social/calendar':
            if not self._require_auth(): return
            return self._json(self.social_calendar(qs.get('month',[None])[0]))
        if p == '/api/admin/social/partners':
            if not self._require_auth(): return
            return self._json(self.list_social_partners())
        if p == '/api/admin/social/analytics':
            if not self._require_auth(): return
            return self._json(self.social_analytics())
        if p == '/api/admin/me':
            if not self._require_auth(): return
            uname = self._user()
            u = USERS.get(uname, {})
            return self._json({
                'username': uname,
                'name':     u.get('name', uname),
                'role':     u.get('role', ''),
                'is_super': bool(u.get('is_super')),
            })
        if p == '/api/admin/accounts':
            if not self._require_auth(): return
            return self._json([
                {'username': k, 'name': v['name'], 'role': v['role'],
                 'is_super': bool(v.get('is_super'))}
                for k, v in USERS.items()
            ])
        if p == '/api/admin/team':
            if not self._require_auth(): return
            return self._json(self.list_team())
        if p == '/api/admin/team/stats':
            if not self._require_auth(): return
            return self._json(self.team_stats())
        if p.startswith('/api/admin/porter/status/'):
            if not self._require_auth(): return
            oid = int(p.split('/')[-1])
            return self.porter_refresh_status(oid)

        # Static routes
        if p == '/' or p == '':
            return self._serve_file('/index.html')
        if p == '/admin':
            return self._serve_file('/admin.html')
        return self._serve_file(p)

    # ----- POST -----
    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        p = url.path
        body = self._read_body()

        if p == '/api/admin/login':
            return self.admin_login(body)
        if p == '/api/orders':
            return self.create_order(body)
        if p == '/api/chat':
            return self.chat(body)
        if p == '/api/admin/products':
            if not self._require_super(): return
            return self.create_product(body)
        if p.startswith('/api/admin/products/') and p.endswith('/image'):
            if not self._require_auth(): return
            pid = p.split('/')[-2]
            return self.upload_product_image(pid, body)
        if p == '/api/admin/stock/adjust':
            if not self._require_auth(): return
            return self.adjust_stock(body)
        if p == '/api/admin/stock/batch':
            if not self._require_auth(): return
            return self.add_batch(body)
        if p.startswith('/api/admin/porter/quote/'):
            if not self._require_auth(): return
            oid = int(p.split('/')[-1])
            return self.porter_quote(oid)
        if p.startswith('/api/admin/porter/book/'):
            if not self._require_auth(): return
            oid = int(p.split('/')[-1])
            return self.porter_book(oid, body)
        if p.startswith('/api/admin/porter/cancel/'):
            if not self._require_auth(): return
            oid = int(p.split('/')[-1])
            return self.porter_cancel(oid, body.get('reason', 'admin cancelled'))
        if p.startswith('/api/admin/orders/') and p.endswith('/payment'):
            if not self._require_auth(): return
            oid = int(p.split('/')[-2])
            return self.confirm_payment(oid, body)
        if p == '/api/admin/reset':
            if not self._require_super(): return
            return self.reset_data(body)
        if p == '/api/admin/resellers':
            if not self._require_super(): return
            return self.create_reseller(body)
        if p == '/api/subscriptions':
            return self.create_subscription(body)
        if p == '/api/admin/social/posts':
            if not self._require_auth(): return
            return self.create_social_post(body)
        if p == '/api/admin/social/partners':
            if not self._require_auth(): return
            return self.create_social_partner(body)

        self._err('Not found', 404)

    # ----- PUT -----
    def do_PUT(self):
        url = urllib.parse.urlparse(self.path)
        p = url.path
        body = self._read_body()

        if p.startswith('/api/admin/products/'):
            if not self._require_auth(): return
            pid = p.split('/')[-1]
            return self.update_product(pid, body)
        if p.startswith('/api/admin/orders/') and p.endswith('/status'):
            if not self._require_auth(): return
            oid = int(p.split('/')[-2])
            return self.update_order_status(oid, body)
        if p.startswith('/api/admin/orders/'):
            if not self._require_auth(): return
            try:
                oid = int(p.split('/')[-1])
            except ValueError:
                return self._err('Invalid order id', 400)
            return self.update_order(oid, body)
        if p.startswith('/api/admin/resellers/'):
            if not self._require_super(): return
            ref = p.split('/')[-1]
            return self.update_reseller(ref, body)
        if p.startswith('/api/admin/team/'):
            # Restrict investment / equity / role / active changes to super admin
            tid = p.split('/')[-1]
            sensitive = {'invested_amount','equity_pct','role','active','name'}
            if any(k in body for k in sensitive):
                if not self._require_super(): return
            else:
                if not self._require_auth(): return
            return self.update_team_member(tid, body)
        if p.startswith('/api/admin/subscriptions/') and p.endswith('/status'):
            if not self._require_auth(): return
            sid = int(p.split('/')[-2])
            return self.update_subscription_status(sid, body)
        if p.startswith('/api/admin/social/posts/'):
            if not self._require_auth(): return
            pid = int(p.split('/')[-1])
            return self.update_social_post(pid, body)

        self._err('Not found', 404)

    # ----- DELETE -----
    def do_DELETE(self):
        url = urllib.parse.urlparse(self.path)
        p = url.path
        if p.startswith('/api/admin/products/'):
            if not self._require_super(): return
            pid = p.split('/')[-1]
            return self.delete_product(pid)
        if p.startswith('/api/admin/social/posts/'):
            if not self._require_auth(): return
            pid = int(p.split('/')[-1])
            return self.delete_social_post(pid)
        self._err('Not found', 404)

    # =====================================
    # API IMPLEMENTATIONS
    # =====================================
    def _user(self):
        return current_user(self) or 'system'

    def admin_login(self, body):
        u = (body.get('username', '') or '').strip().lower()
        p = body.get('password', '')
        user = USERS.get(u)
        if user and user['password'] == p:
            token = make_token(u)
            return self._json({
                'token': token, 'username': u,
                'name': user['name'], 'role': user['role'],
                'is_super': bool(user.get('is_super')),
            })
        return self._err('Invalid username or password', 401)

    # ---- PRODUCTS ----
    def list_products(self):
        with db() as c:
            rows = c.execute(
                'SELECT * FROM products WHERE active = 1 ORDER BY sort_order, name'
            ).fetchall()
            return [self._product_row(r) for r in rows]

    def get_product(self, pid):
        with db() as c:
            r = c.execute('SELECT * FROM products WHERE id = ?', (pid,)).fetchone()
            return self._product_row(r) if r else None

    def _product_row(self, r):
        d = dict(r)
        if d.get('combo_items'):
            try: d['combo_items'] = json.loads(d['combo_items'])
            except: d['combo_items'] = []
        else:
            d['combo_items'] = []
        d['in_stock'] = d['stock'] > 0
        d['low_stock'] = 0 < d['stock'] <= (d['low_stock_threshold'] or 10)
        # Earliest expiry from active batches
        with db() as c:
            b = c.execute('''
                SELECT expiry_date, qty_added, batch_date
                FROM stock_batches
                WHERE product_id = ? AND DATE(expiry_date) >= DATE('now')
                ORDER BY expiry_date ASC
                LIMIT 1
            ''', (d['id'],)).fetchone()
            if b:
                d['next_expiry'] = b['expiry_date']
                exp = datetime.strptime(b['expiry_date'], '%Y-%m-%d').date()
                d['days_until_expiry'] = (exp - date.today()).days
                d['expiry_critical'] = d['days_until_expiry'] <= 3
                d['expiry_warning']  = d['days_until_expiry'] <= 7
            else:
                d['next_expiry'] = None
                d['days_until_expiry'] = None
                d['expiry_critical'] = False
                d['expiry_warning'] = False
        return d

    def create_product(self, body):
        with DB_LOCK, db() as c:
            try:
                c.execute('''
                    INSERT INTO products (id, cat, name, short, sub, description, price, was,
                                          roast, type, bag_color, label, combo_items, badge,
                                          bestseller, stock, low_stock_threshold, sort_order)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ''', (
                    body.get('id'), body.get('cat'), body.get('name'),
                    body.get('short'), body.get('sub'), body.get('description'),
                    int(body.get('price', 0)), int(body.get('was', 0)),
                    body.get('roast'), body.get('type'), body.get('bag_color'),
                    body.get('label'), json.dumps(body.get('combo_items') or []),
                    body.get('badge'), int(body.get('bestseller', 0)),
                    int(body.get('stock', 0)), int(body.get('low_stock_threshold', 10)),
                    int(body.get('sort_order', 0)),
                ))
                c.commit()
                return self._json({'ok': True, 'id': body.get('id')}, 201)
            except sqlite3.IntegrityError as e:
                return self._err(f'Duplicate or invalid: {e}', 400)

    def update_product(self, pid, body):
        with DB_LOCK, db() as c:
            existing = c.execute('SELECT * FROM products WHERE id = ?', (pid,)).fetchone()
            if not existing:
                return self._err('Not found', 404)
            allowed = ['name','short','sub','description','price','was','roast','badge',
                       'bestseller','stock','low_stock_threshold','active','sort_order','cat']
            updates = {k: body[k] for k in allowed if k in body}
            if not updates:
                return self._err('No fields to update', 400)
            sets = ', '.join(f'{k} = ?' for k in updates)
            c.execute(f'UPDATE products SET {sets} WHERE id = ?', (*updates.values(), pid))
            # If stock changed, log it
            if 'stock' in updates:
                delta = updates['stock'] - existing['stock']
                c.execute(
                    'INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) VALUES (?,?,?,?,?)',
                    (pid, delta, body.get('stock_reason', 'manual edit'), updates['stock'], self._user())
                )
            c.commit()
            return self._json({'ok': True})

    def delete_product(self, pid):
        with DB_LOCK, db() as c:
            c.execute('UPDATE products SET active = 0 WHERE id = ?', (pid,))
            c.commit()
            return self._json({'ok': True})

    def upload_product_image(self, pid, body):
        """Accept a data URL (base64-encoded image), save it to products/<pid>.<ext>,
           update image_url, and remove any previous file for this product."""
        data_url = body.get('data', '') or ''
        if not data_url.startswith('data:'):
            return self._err('Invalid image data (expected data: URL)', 400)
        try:
            import base64
            header, b64 = data_url.split(',', 1)
            mime = header.split(';')[0].replace('data:', '').lower()
            ext_map = {
                'image/jpeg': 'jpg', 'image/jpg': 'jpg',
                'image/png':  'png', 'image/webp': 'webp',
            }
            ext = ext_map.get(mime)
            if not ext:
                return self._err(f'Unsupported image type: {mime}. Use JPG, PNG, or WebP.', 400)
            img_bytes = base64.b64decode(b64)
            if len(img_bytes) > 6_000_000:
                return self._err('Image too large (max 6 MB). Compress and retry.', 400)
            if len(img_bytes) < 200:
                return self._err('Image too small / corrupt', 400)
        except Exception as e:
            return self._err(f'Image parse error: {e}', 400)

        # Verify product exists
        with db() as c:
            if not c.execute('SELECT 1 FROM products WHERE id = ?', (pid,)).fetchone():
                return self._err('Product not found', 404)

        products_dir = os.path.join(HERE, 'products')
        os.makedirs(products_dir, exist_ok=True)
        # Remove older image files for this product (any extension)
        for old_ext in ('jpg', 'jpeg', 'png', 'webp'):
            old_path = os.path.join(products_dir, f'{pid}.{old_ext}')
            if os.path.isfile(old_path) and old_ext != ext:
                try: os.remove(old_path)
                except: pass
        target = os.path.join(products_dir, f'{pid}.{ext}')
        with open(target, 'wb') as f:
            f.write(img_bytes)

        new_url = f'/products/{pid}.{ext}'
        with DB_LOCK, db() as c:
            c.execute('UPDATE products SET image_url = ? WHERE id = ?', (new_url, pid))
            c.commit()
        return self._json({
            'ok': True, 'image_url': new_url,
            'size_kb': round(len(img_bytes) / 1024, 1),
            'changed_by': self._user(),
        })

    def adjust_stock(self, body):
        pid    = body.get('product_id')
        delta  = int(body.get('delta', 0))
        reason = body.get('reason', 'manual')
        with DB_LOCK, db() as c:
            r = c.execute('SELECT stock FROM products WHERE id = ?', (pid,)).fetchone()
            if not r:
                return self._err('Product not found', 404)
            new_stock = max(0, r['stock'] + delta)
            c.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, pid))
            c.execute(
                'INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) VALUES (?,?,?,?,?)',
                (pid, delta, reason, new_stock, self._user())
            )
            c.commit()
            return self._json({'ok': True, 'new_stock': new_stock})

    def add_batch(self, body):
        pid        = body.get('product_id')
        qty        = int(body.get('qty', 0))
        notes      = body.get('notes', '')
        batch_date = body.get('batch_date')  # YYYY-MM-DD; default today
        if not pid or qty <= 0:
            return self._err('product_id and positive qty required', 400)
        try:
            bd = datetime.strptime(batch_date, '%Y-%m-%d').date() if batch_date else date.today()
        except Exception:
            return self._err('Invalid batch_date (use YYYY-MM-DD)', 400)
        with DB_LOCK, db() as c:
            p = c.execute('SELECT * FROM products WHERE id = ?', (pid,)).fetchone()
            if not p:
                return self._err('Product not found', 404)
            v_days = p['validity_days'] or 60
            expiry = bd + timedelta(days=v_days)
            user = self._user()
            cur = c.execute('''
                INSERT INTO stock_batches (product_id, qty_added, batch_date, expiry_date, notes, added_by)
                VALUES (?,?,?,?,?,?)
            ''', (pid, qty, bd.isoformat(), expiry.isoformat(), notes, user))
            batch_id = cur.lastrowid
            new_stock = p['stock'] + qty
            c.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, pid))
            c.execute(
                'INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) VALUES (?,?,?,?,?)',
                (pid, qty, f'batch #{batch_id} (exp {expiry.isoformat()})', new_stock, user)
            )
            c.commit()
            return self._json({
                'ok': True, 'batch_id': batch_id,
                'new_stock': new_stock,
                'batch_date': bd.isoformat(),
                'expiry_date': expiry.isoformat(),
                'validity_days': v_days,
            }, 201)

    def list_batches(self, product_id=None, limit=200):
        with db() as c:
            today = date.today().isoformat()
            if product_id:
                rows = c.execute('''
                    SELECT b.*, p.name AS product_name, p.cat AS category,
                           CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
                    FROM stock_batches b
                    LEFT JOIN products p ON p.id = b.product_id
                    WHERE b.product_id = ?
                    ORDER BY b.expiry_date ASC
                    LIMIT ?
                ''', (product_id, limit)).fetchall()
            else:
                rows = c.execute('''
                    SELECT b.*, p.name AS product_name, p.cat AS category,
                           CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
                    FROM stock_batches b
                    LEFT JOIN products p ON p.id = b.product_id
                    ORDER BY b.created_at DESC
                    LIMIT ?
                ''', (limit,)).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                d['expired'] = d['expiry_date'] < today
                d['critical'] = (not d['expired']) and d['days_until_expiry'] is not None and d['days_until_expiry'] <= 3
                d['warning']  = (not d['expired']) and d['days_until_expiry'] is not None and d['days_until_expiry'] <= 7
                out.append(d)
            return out

    def list_expiring(self, days=14):
        with db() as c:
            rows = c.execute('''
                SELECT b.*, p.name AS product_name, p.cat AS category,
                       CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
                FROM stock_batches b
                LEFT JOIN products p ON p.id = b.product_id
                WHERE DATE(b.expiry_date) BETWEEN DATE('now') AND DATE('now', ?)
                ORDER BY b.expiry_date ASC
            ''', (f'+{days} days',)).fetchall()
            return [dict(r) for r in rows]

    # ---- ORDERS ----
    def create_order(self, body):
        items = body.get('items', [])
        if not items:
            return self._err('No items in order', 400)
        with DB_LOCK, db() as c:
            # Validate stock and compute totals
            subtotal = 0
            line_items = []
            for it in items:
                pid = it.get('id')
                qty = max(1, int(it.get('qty', 1)))
                p = c.execute('SELECT * FROM products WHERE id = ?', (pid,)).fetchone()
                if not p:
                    return self._err(f'Product {pid} not found', 400)
                if p['stock'] < qty:
                    return self._err(f'{p["name"]} only has {p["stock"]} in stock', 400)
                line_total = p['price'] * qty
                subtotal += line_total
                line_items.append((pid, p['name'], qty, p['price'], line_total))

            shipping, _zone = shipping_for(body.get('shipping_address', ''))
            discount = int(body.get('discount', 0))
            total    = max(0, subtotal + shipping - discount)
            order_no = f"FUKU-{datetime.now().strftime('%y%m%d')}-{secrets.token_hex(2).upper()}"

            # Validate reseller_ref if provided
            reseller_ref = (body.get('reseller_ref') or '').strip().upper() or None
            reseller_row = None
            if reseller_ref:
                reseller_row = c.execute(
                    'SELECT * FROM resellers WHERE ref_code = ? AND active = 1', (reseller_ref,)
                ).fetchone()
                if not reseller_row:
                    reseller_ref = None    # silently drop invalid refs

            cur = c.execute('''
                INSERT INTO orders (order_no, customer_name, customer_phone, customer_email,
                                    shipping_address, subtotal, shipping, discount, total,
                                    source, notes, status, reseller_ref)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                order_no,
                body.get('customer_name'), body.get('customer_phone'),
                body.get('customer_email'), body.get('shipping_address'),
                subtotal, shipping, discount, total,
                body.get('source', 'web'),
                body.get('notes'),
                'pending',
                reseller_ref,
            ))
            order_id = cur.lastrowid

            for li in line_items:
                c.execute('''
                    INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price, line_total)
                    VALUES (?,?,?,?,?,?)
                ''', (order_id, *li))
                # decrement stock
                c.execute(
                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                    (li[2], li[0])
                )
                new_stock = c.execute('SELECT stock FROM products WHERE id = ?', (li[0],)).fetchone()['stock']
                c.execute(
                    'INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) VALUES (?,?,?,?,?)',
                    (li[0], -li[2], f'order {order_no}', new_stock, body.get('source', 'web') + ' order')
                )
            c.commit()

            # Build WA notify-the-reseller URL (client opens this as a 2nd tab)
            reseller_notify_url = None
            if reseller_row:
                items_str = '\n'.join([f"• {li[2]}× {li[1]}" for li in line_items])
                notify_msg = (
                    f"🎉 New FUKU order via your link!\n\n"
                    f"Order: *{order_no}*\n"
                    f"Customer: {body.get('customer_name') or '—'}\n"
                    f"Phone: +91 {body.get('customer_phone') or ''}\n"
                    f"Address: {body.get('shipping_address') or '—'}\n\n"
                    f"Items:\n{items_str}\n\n"
                    f"Total: ₹{total:,}\n"
                    f"Your commission: ~{reseller_row['commission_pct']}%"
                )
                reseller_phone = str(reseller_row['phone']).replace('+','').replace(' ','')
                if not reseller_phone.startswith('91'):
                    reseller_phone = '91' + reseller_phone
                reseller_notify_url = f"https://wa.me/{reseller_phone}?text={urllib.parse.quote(notify_msg)}"

            return self._json({
                'ok': True,
                'order_no': order_no,
                'order_id': order_id,
                'subtotal': subtotal,
                'shipping': shipping,
                'discount': discount,
                'total': total,
                'reseller_ref': reseller_ref,
                'reseller_name': reseller_row['name'] if reseller_row else None,
                'reseller_notify_url': reseller_notify_url,
            }, 201)

    def list_orders(self, limit, status):
        with db() as c:
            q = 'SELECT * FROM orders'
            params = []
            if status:
                q += ' WHERE status = ?'
                params.append(status)
            q += ' ORDER BY created_at DESC LIMIT ?'
            params.append(limit)
            rows = c.execute(q, params).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                items = c.execute(
                    'SELECT * FROM order_items WHERE order_id = ?', (r['id'],)
                ).fetchall()
                d['items'] = [dict(i) for i in items]
                out.append(d)
            return out

    def get_order(self, oid):
        with db() as c:
            r = c.execute('SELECT * FROM orders WHERE id = ?', (oid,)).fetchone()
            if not r: return None
            d = dict(r)
            d['items'] = [dict(i) for i in c.execute(
                'SELECT * FROM order_items WHERE order_id = ?', (oid,)
            ).fetchall()]
            d['delivery_zone'] = self._zone_for_order(d)
            return d

    def update_order_status(self, oid, body):
        status = body.get('status')
        if status not in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled'):
            return self._err('Invalid status', 400)
        with DB_LOCK, db() as c:
            c.execute('UPDATE orders SET status = ? WHERE id = ?', (status, oid))
            c.commit()
            return self._json({'ok': True})

    def update_order(self, oid, body):
        """Full order edit. Updates customer fields and/or items list.
           Adjusts stock & logs changes when items change."""
        with DB_LOCK, db() as c:
            existing = c.execute('SELECT * FROM orders WHERE id = ?', (oid,)).fetchone()
            if not existing:
                return self._err('Order not found', 404)

            # 1) Customer & meta fields
            allowed = ['customer_name','customer_phone','customer_email','shipping_address',
                       'notes','status','source','discount',
                       'entered_by','coffee_handled_by','payment_method']
            cust_updates = {k: body[k] for k in allowed if k in body}
            if 'status' in cust_updates and cust_updates['status'] not in (
                'pending','confirmed','shipped','delivered','cancelled'):
                return self._err('Invalid status', 400)
            if cust_updates:
                sets = ', '.join(f'{k} = ?' for k in cust_updates)
                c.execute(f'UPDATE orders SET {sets} WHERE id = ?',
                          (*cust_updates.values(), oid))

            # 2) Items (optional) — full replace with stock adjustment
            if 'items' in body:
                new_items_raw = body['items'] or []
                # build qty map (skip zero/negative)
                new_map = {}
                for it in new_items_raw:
                    q = int(it.get('qty', 0))
                    if q > 0:
                        new_map[it['id']] = new_map.get(it['id'], 0) + q
                if not new_map:
                    return self._err('Order must have at least one item', 400)

                # current items
                old_rows = c.execute(
                    'SELECT * FROM order_items WHERE order_id = ?', (oid,)
                ).fetchall()
                old_map = {r['product_id']: r['qty'] for r in old_rows}

                # validate stock availability for any increases
                for pid, new_qty in new_map.items():
                    delta = new_qty - old_map.get(pid, 0)
                    if delta > 0:
                        p = c.execute('SELECT * FROM products WHERE id = ?', (pid,)).fetchone()
                        if not p:
                            return self._err(f'Product {pid} not found', 400)
                        if p['stock'] < delta:
                            return self._err(
                                f'{p["name"]} only has {p["stock"]} available '
                                f'(need {delta} more)', 400)

                # restore stock for items being decreased / removed
                for pid, old_qty in old_map.items():
                    new_qty = new_map.get(pid, 0)
                    delta = new_qty - old_qty
                    if delta < 0:
                        restore = -delta
                        c.execute('UPDATE products SET stock = stock + ? WHERE id = ?',
                                  (restore, pid))
                        ns = c.execute('SELECT stock FROM products WHERE id = ?',
                                       (pid,)).fetchone()['stock']
                        c.execute(
                            'INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) VALUES (?,?,?,?,?)',
                            (pid, restore, f"order {existing['order_no']} edited (restored)", ns, self._user())
                        )
                # deduct stock for items being increased / added
                for pid, new_qty in new_map.items():
                    delta = new_qty - old_map.get(pid, 0)
                    if delta > 0:
                        c.execute('UPDATE products SET stock = stock - ? WHERE id = ?',
                                  (delta, pid))
                        ns = c.execute('SELECT stock FROM products WHERE id = ?',
                                       (pid,)).fetchone()['stock']
                        c.execute(
                            'INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) VALUES (?,?,?,?,?)',
                            (pid, -delta, f"order {existing['order_no']} edited (added)", ns, self._user())
                        )

                # replace order_items and recompute totals
                c.execute('DELETE FROM order_items WHERE order_id = ?', (oid,))
                subtotal = 0
                for pid, qty in new_map.items():
                    p = c.execute('SELECT * FROM products WHERE id = ?', (pid,)).fetchone()
                    if not p:
                        continue
                    line_total = p['price'] * qty
                    subtotal += line_total
                    c.execute('''
                        INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price, line_total)
                        VALUES (?,?,?,?,?,?)
                    ''', (oid, pid, p['name'], qty, p['price'], line_total))

                addr_for_ship = cust_updates.get('shipping_address', existing['shipping_address'])
                shipping, _zone = shipping_for(addr_for_ship)
                discount = int(cust_updates.get('discount', existing['discount'] or 0))
                total = max(0, subtotal + shipping - discount)
                c.execute(
                    'UPDATE orders SET subtotal = ?, shipping = ?, total = ? WHERE id = ?',
                    (subtotal, shipping, total, oid)
                )

            c.commit()
            updated = self.get_order(oid)
            return self._json({'ok': True, 'order': updated})

    # ---- PORTER DELIVERY ----
    def _drop_from_order(self, order):
        """Build a Porter `drop` object from an order's stored fields."""
        addr = (order.get('shipping_address') or '').strip()
        pincode = _pincode_from(addr)
        # crude city extraction — last comma-separated chunk usually
        parts = [p.strip() for p in addr.split(',') if p.strip()]
        city = parts[-1] if parts else ''
        if pincode and city == pincode:
            city = parts[-2] if len(parts) >= 2 else ''
        return {
            'name':         order.get('customer_name') or '',
            'phone':        '+91' + str(order.get('customer_phone') or '').replace('+91','').strip(),
            'address_line': addr,
            'city':         city or 'Surat',
            'state':        'Gujarat' if pincode.startswith('39') else '',
            'pincode':      pincode or '395007',
            'country':      'India',
        }

    def _zone_for_order(self, order):
        """Return zone label using server-side shipping rules: free_5km / surat_paid / outside_surat / unknown."""
        addr = order.get('shipping_address') or ''
        _, zone = shipping_for(addr)
        # map shipping_for() vocab → Porter vocab
        return {
            'free':    'free_5km',
            'paid':    'surat_paid',
            'outside': 'outside_surat',
            'unknown': 'unknown',
        }.get(zone, 'unknown')

    def porter_quote(self, oid):
        o = self.get_order(oid)
        if not o: return self._err('Order not found', 404)
        if not o.get('shipping_address'):
            return self._err('Order has no shipping address', 400)
        drop = self._drop_from_order(o)
        item_count = sum(i['qty'] for i in o['items'])
        q = porter_api.get_quote(drop, item_value=o['total'], item_count=item_count)
        return self._json({'ok': True, 'quote': q, 'drop': drop})

    def porter_book(self, oid, body):
        o = self.get_order(oid)
        if not o: return self._err('Order not found', 404)
        if o.get('porter_order_id'):
            return self._err('Already booked with Porter (' + o['porter_order_id'] + ')', 400)
        drop = self._drop_from_order(o)
        item_count = sum(i['qty'] for i in o['items'])
        comments = f"Order {o['order_no']} — {len(o['items'])} SKUs, {item_count} units. Handle with care."
        booking = porter_api.book(drop,
                                  item_value=o['total'],
                                  item_count=item_count,
                                  additional_comments=comments)
        if booking.get('error'):
            return self._err(f"Porter: {booking.get('error')} — {booking.get('detail','')}", 502)

        with DB_LOCK, db() as c:
            c.execute('''
                UPDATE orders SET
                    porter_order_id = ?,
                    porter_status = ?,
                    porter_tracking_url = ?,
                    porter_fare = ?,
                    porter_eta_minutes = ?,
                    porter_vehicle = ?,
                    porter_booked_at = ?,
                    porter_payload = ?,
                    status = CASE WHEN status IN ('pending','confirmed') THEN 'shipped' ELSE status END
                WHERE id = ?
            ''', (
                booking.get('order_id'),
                booking.get('status', 'open'),
                booking.get('tracking_url'),
                booking.get('fare_inr'),
                booking.get('eta_minutes'),
                booking.get('vehicle_type'),
                datetime.now().isoformat(),
                json.dumps(booking),
                oid,
            ))
            c.commit()
        updated = self.get_order(oid)
        return self._json({'ok': True, 'booking': booking, 'order': updated}, 201)

    def porter_refresh_status(self, oid):
        o = self.get_order(oid)
        if not o: return self._err('Order not found', 404)
        if not o.get('porter_order_id'):
            return self._err('No Porter booking on this order', 400)
        s = porter_api.get_status(o['porter_order_id'])
        if s.get('error'):
            return self._err(f"Porter: {s.get('error')}", 502)
        new_status = s.get('status', o.get('porter_status'))
        with DB_LOCK, db() as c:
            c.execute(
                'UPDATE orders SET porter_status = ? WHERE id = ?',
                (new_status, oid)
            )
            if new_status == 'delivered':
                c.execute(
                    "UPDATE orders SET status = 'delivered' WHERE id = ? AND status != 'cancelled'",
                    (oid,)
                )
            c.commit()
        return self._json({'ok': True, 'status': s})

    def porter_cancel(self, oid, reason):
        o = self.get_order(oid)
        if not o: return self._err('Order not found', 404)
        if not o.get('porter_order_id'):
            return self._err('No Porter booking', 400)
        r = porter_api.cancel(o['porter_order_id'], reason)
        with DB_LOCK, db() as c:
            c.execute('UPDATE orders SET porter_status = ? WHERE id = ?',
                      ('cancelled', oid))
            c.commit()
        return self._json({'ok': True, 'result': r})

    # ---- TEAM ----
    def list_team(self):
        with db() as c:
            rows = c.execute(
                'SELECT * FROM team_members WHERE active = 1 ORDER BY name'
            ).fetchall()
            return [dict(r) for r in rows]

    def team_stats(self):
        with db() as c:
            team = c.execute(
                'SELECT * FROM team_members WHERE active = 1 ORDER BY name'
            ).fetchall()
            out = []
            for t in team:
                tid = t['id']
                entered = c.execute('''
                    SELECT COUNT(*) AS orders,
                           COALESCE(SUM(total), 0) AS revenue
                    FROM orders
                    WHERE entered_by = ? AND status != 'cancelled'
                ''', (tid,)).fetchone()
                coffee = c.execute('''
                    SELECT COUNT(*) AS orders
                    FROM orders
                    WHERE coffee_handled_by = ? AND status != 'cancelled'
                ''', (tid,)).fetchone()
                payments = c.execute('''
                    SELECT COUNT(*) AS confirmed,
                           COALESCE(SUM(total), 0) AS collected
                    FROM orders
                    WHERE payment_confirmed_by = ? AND payment_status = 'paid'
                ''', (tid,)).fetchone()
                out.append({
                    **dict(t),
                    'orders_entered':     entered['orders'],
                    'revenue_entered':    entered['revenue'],
                    'orders_coffee':      coffee['orders'],
                    'payments_confirmed': payments['confirmed'],
                    'revenue_collected':  payments['collected'],
                })
            return out

    # ---- PAYMENT CONFIRMATION ----
    def confirm_payment(self, oid, body):
        method = body.get('payment_method')  # 'cash' or 'online'
        if method not in ('cash', 'online'):
            return self._err("payment_method must be 'cash' or 'online'", 400)
        confirmed_by = body.get('confirmed_by') or 'nisarg'
        reference    = body.get('payment_reference', '')

        with DB_LOCK, db() as c:
            r = c.execute('SELECT * FROM orders WHERE id = ?', (oid,)).fetchone()
            if not r: return self._err('Order not found', 404)
            # Sanity: payment confirmer should be flagged as a payment handler
            handler = c.execute(
                'SELECT * FROM team_members WHERE id = ?', (confirmed_by,)
            ).fetchone()
            if not handler:
                return self._err(f'Unknown team member: {confirmed_by}', 400)
            now = datetime.now().isoformat()
            c.execute('''
                UPDATE orders SET
                    payment_method       = ?,
                    payment_status       = 'paid',
                    payment_confirmed_by = ?,
                    payment_confirmed_at = ?,
                    payment_reference    = ?
                WHERE id = ?
            ''', (method, confirmed_by, now, reference, oid))
            c.commit()
        return self._json({'ok': True, 'order': self.get_order(oid)})

    # ---- RESET / GO LIVE ----
    def reset_data(self, body):
        """Wipe transactional data so the shop can start live.
           mode='transactions' → clears orders + chats (keeps products & stock)
           mode='full'         → also clears stock batches/log and zeroes stock
        """
        if body.get('confirm') != 'RESET':
            return self._err('Type RESET to confirm', 400)
        mode = body.get('mode', 'transactions')
        user = self._user()
        with DB_LOCK, db() as c:
            c.execute('DELETE FROM order_items')
            c.execute('DELETE FROM orders')
            c.execute('DELETE FROM chat_log')
            # reset autoincrement counters
            c.execute("DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items')")
            wiped = {'orders': True, 'chats': True}
            if mode == 'full':
                c.execute('DELETE FROM stock_batches')
                c.execute('DELETE FROM stock_log')
                c.execute("DELETE FROM sqlite_sequence WHERE name IN ('stock_batches','stock_log')")
                c.execute('UPDATE products SET stock = 0')
                # log the zeroing per product
                for r in c.execute('SELECT id FROM products').fetchall():
                    c.execute(
                        'INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) VALUES (?,?,?,?,?)',
                        (r['id'], 0, 'RESET — go live (stock zeroed)', 0, user)
                    )
                wiped.update({'stock_batches': True, 'stock_log': True, 'stock_zeroed': True})
            c.commit()
        return self._json({'ok': True, 'mode': mode, 'wiped': wiped, 'by': user})

    # ---- SMART INSIGHTS (auto-generated observations) ----
    def smart_insights(self):
        out = []
        with db() as c:
            # 1) Revenue trend week-over-week
            this_w  = c.execute("""SELECT COALESCE(SUM(total),0) AS r FROM orders
                                   WHERE status != 'cancelled' AND DATE(created_at) >= DATE('now','-6 days')""").fetchone()['r']
            prev_w  = c.execute("""SELECT COALESCE(SUM(total),0) AS r FROM orders
                                   WHERE status != 'cancelled'
                                     AND DATE(created_at) >= DATE('now','-13 days')
                                     AND DATE(created_at) <  DATE('now','-6 days')""").fetchone()['r']
            if prev_w > 0:
                delta_pct = (this_w - prev_w) / prev_w * 100
                if delta_pct >= 10:
                    out.append({'icon':'🔥','severity':'good',
                                'title':f'Revenue up {delta_pct:.0f}% this week',
                                'detail':f'₹{this_w:,} vs ₹{prev_w:,} last week. Momentum is building — keep it.'})
                elif delta_pct <= -15:
                    out.append({'icon':'📉','severity':'warn',
                                'title':f'Revenue down {abs(delta_pct):.0f}% this week',
                                'detail':f'₹{this_w:,} vs ₹{prev_w:,} last week. Consider a flash promo or chatbot upsell.'})

            # 2) Fastest-moving SKU vs prior week
            sku_now = c.execute("""SELECT oi.product_id, oi.product_name, SUM(oi.qty) AS q
                                   FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                   WHERE o.status != 'cancelled' AND DATE(o.created_at) >= DATE('now','-6 days')
                                   GROUP BY oi.product_id ORDER BY q DESC LIMIT 1""").fetchone()
            if sku_now:
                sku_prev = c.execute("""SELECT SUM(oi.qty) AS q
                                        FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                        WHERE o.status != 'cancelled'
                                          AND oi.product_id = ?
                                          AND DATE(o.created_at) >= DATE('now','-13 days')
                                          AND DATE(o.created_at) <  DATE('now','-6 days')""",
                                     (sku_now['product_id'],)).fetchone()['q'] or 0
                ratio = (sku_now['q'] / sku_prev) if sku_prev else None
                if ratio and ratio >= 1.2:
                    out.append({'icon':'☕','severity':'good',
                                'title':f'{sku_now["product_name"]} is your hot mover',
                                'detail':f'{sku_now["q"]} units this week, {ratio:.1f}× last week. Make sure you have stock.'})
                else:
                    out.append({'icon':'⭐','severity':'info',
                                'title':f'Top seller this week: {sku_now["product_name"]}',
                                'detail':f'{sku_now["q"]} units sold.'})

            # 3) Stock runway warning — items selling > stock for week
            for r in c.execute("""SELECT p.id, p.name, p.stock,
                                         (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi
                                          JOIN orders o ON o.id=oi.order_id
                                          WHERE o.status!='cancelled' AND oi.product_id=p.id
                                            AND DATE(o.created_at) >= DATE('now','-13 days')) AS sold_14d
                                  FROM products p WHERE p.active=1 AND p.stock > 0""").fetchall():
                if r['sold_14d'] > 0:
                    daily = r['sold_14d'] / 14.0
                    days_left = r['stock'] / daily if daily else 999
                    if days_left < 5:
                        out.append({'icon':'⏰','severity':'warn',
                                    'title':f'{r["name"]} runs out in ~{days_left:.0f} days',
                                    'detail':f'Stock {r["stock"]}, selling {daily:.1f}/day. Add a batch soon.'})

            # 4) Expiring batches
            n_exp = c.execute("""SELECT COUNT(*) AS c FROM stock_batches
                                 WHERE DATE(expiry_date) BETWEEN DATE('now') AND DATE('now','+3 days')""").fetchone()['c']
            if n_exp:
                out.append({'icon':'⚡','severity':'warn',
                            'title':f'{n_exp} batch{"es" if n_exp>1 else ""} expire in next 3 days',
                            'detail':'Push them with a quick WhatsApp blast or discount.'})

            # 5) Pending payments backlog
            unpaid = c.execute("""SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS r FROM orders
                                  WHERE status != 'cancelled' AND payment_status = 'unpaid'""").fetchone()
            if unpaid['c'] >= 5:
                out.append({'icon':'💰','severity':'info',
                            'title':f'₹{unpaid["r"]:,} in unpaid orders',
                            'detail':f'{unpaid["c"]} orders awaiting payment confirmation by Nisarg.'})

            # 6) Top reseller this week
            top_res = c.execute("""SELECT r.name, r.ref_code, COUNT(o.id) AS n, COALESCE(SUM(o.total),0) AS rev
                                   FROM resellers r LEFT JOIN orders o ON o.reseller_ref = r.ref_code
                                   WHERE o.status != 'cancelled'
                                     AND DATE(o.created_at) >= DATE('now','-6 days')
                                   GROUP BY r.ref_code HAVING n > 0
                                   ORDER BY rev DESC LIMIT 1""").fetchone()
            if top_res:
                out.append({'icon':'🤝','severity':'good',
                            'title':f'{top_res["name"]} is top reseller this week',
                            'detail':f'₹{top_res["rev"]:,} from {top_res["n"]} orders via {top_res["ref_code"]}.'})

            # 7) Pending subscriptions awaiting action
            n_subs = c.execute("SELECT COUNT(*) AS c FROM subscriptions WHERE status='requested'").fetchone()['c']
            if n_subs:
                out.append({'icon':'🔁','severity':'info',
                            'title':f'{n_subs} subscription request{"s" if n_subs>1 else ""} pending',
                            'detail':'Confirm them on WhatsApp to convert to active recurring revenue.'})

            # 8) Chatbot WhatsApp handoffs
            n_esc = c.execute("""SELECT COUNT(*) AS c FROM chat_log
                                 WHERE intent='escalate' AND DATE(created_at) >= DATE('now','-6 days')""").fetchone()['c']
            if n_esc >= 5:
                out.append({'icon':'📱','severity':'info',
                            'title':f'{n_esc} customers asked for WhatsApp this week',
                            'detail':'Chatbot is handling most queries well — these are the ones that needed a human.'})

            # 9) AOV trend
            aov_now = c.execute("""SELECT AVG(total) AS a FROM orders
                                   WHERE status != 'cancelled' AND DATE(created_at) >= DATE('now','-6 days')""").fetchone()['a']
            aov_prev = c.execute("""SELECT AVG(total) AS a FROM orders
                                    WHERE status != 'cancelled'
                                      AND DATE(created_at) >= DATE('now','-13 days')
                                      AND DATE(created_at) <  DATE('now','-6 days')""").fetchone()['a']
            if aov_now and aov_prev and aov_now > aov_prev * 1.1:
                out.append({'icon':'💸','severity':'good',
                            'title':f'AOV up {(aov_now/aov_prev-1)*100:.0f}% this week',
                            'detail':f'Customers are spending ₹{aov_now:.0f} per order vs ₹{aov_prev:.0f}. Upsells working.'})

            # 10) Idle observation if nothing else
            if not out:
                out.append({'icon':'🧘','severity':'info',
                            'title':'All quiet on the FUKU front',
                            'detail':'No urgent insights right now. Good time to plan a marketing push.'})

        return out

    # ---- NOTIFICATIONS (action items) ----
    def notifications(self):
        notes = []
        with db() as c:
            pending = c.execute("""SELECT COUNT(*) AS c FROM orders WHERE status='pending'""").fetchone()['c']
            if pending: notes.append({'icon':'🛒','title':f'{pending} pending order{"s" if pending>1 else ""}',
                                      'detail':'Awaiting confirmation', 'view':'orders', 'severity':'warn'})

            unpaid_stale = c.execute("""SELECT COUNT(*) AS c FROM orders
                                        WHERE payment_status='unpaid' AND status != 'cancelled'
                                          AND DATE(created_at) < DATE('now','-1 day')""").fetchone()['c']
            if unpaid_stale: notes.append({'icon':'💰','title':f'{unpaid_stale} unpaid orders > 24h',
                                           'detail':'Nisarg to follow up', 'view':'orders', 'severity':'warn'})

            oos = c.execute("SELECT COUNT(*) AS c FROM products WHERE active=1 AND stock=0").fetchone()['c']
            if oos: notes.append({'icon':'📦','title':f'{oos} product{"s" if oos>1 else ""} out of stock',
                                  'detail':'Add a batch ASAP', 'view':'stock', 'severity':'danger'})

            low = c.execute("""SELECT COUNT(*) AS c FROM products
                               WHERE active=1 AND stock > 0 AND stock <= low_stock_threshold""").fetchone()['c']
            if low: notes.append({'icon':'⚠️','title':f'{low} item{"s" if low>1 else ""} low on stock',
                                  'detail':'Reorder before zero', 'view':'stock', 'severity':'warn'})

            exp_soon = c.execute("""SELECT COUNT(*) AS c FROM stock_batches
                                    WHERE DATE(expiry_date) BETWEEN DATE('now') AND DATE('now','+3 days')""").fetchone()['c']
            if exp_soon: notes.append({'icon':'⏰','title':f'{exp_soon} batch{"es" if exp_soon>1 else ""} expire in 3 days',
                                       'detail':'Push them out', 'view':'stock', 'severity':'warn'})

            new_subs = c.execute("SELECT COUNT(*) AS c FROM subscriptions WHERE status='requested'").fetchone()['c']
            if new_subs: notes.append({'icon':'🔁','title':f'{new_subs} subscription request{"s" if new_subs>1 else ""}',
                                       'detail':'Confirm on WhatsApp', 'view':'subscriptions', 'severity':'info'})

        return notes

    # ---- GLOBAL SEARCH (command palette) ----
    def global_search(self, q):
        q = (q or '').strip()
        if not q: return {'orders':[], 'products':[], 'resellers':[]}
        like = f'%{q}%'
        with db() as c:
            orders = [dict(r) for r in c.execute("""
                SELECT id, order_no, customer_name, total, status FROM orders
                WHERE order_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?
                ORDER BY created_at DESC LIMIT 8
            """, (like, like, like)).fetchall()]
            products = [dict(r) for r in c.execute("""
                SELECT id, name, price, stock FROM products
                WHERE active=1 AND (name LIKE ? OR id LIKE ?)
                ORDER BY sort_order LIMIT 8
            """, (like, like)).fetchall()]
            resellers = [dict(r) for r in c.execute("""
                SELECT ref_code, name, city FROM resellers
                WHERE active=1 AND (ref_code LIKE ? OR name LIKE ? OR city LIKE ?)
                LIMIT 8
            """, (like, like, like)).fetchall()]
        return {'orders': orders, 'products': products, 'resellers': resellers}

    # ---- SOCIAL PLANNER ----
    def list_social_partners(self):
        with db() as c:
            rows = c.execute(
                'SELECT * FROM social_partners WHERE active=1 ORDER BY followers DESC'
            ).fetchall()
            return [dict(r) for r in rows]

    def create_social_partner(self, body):
        h = (body.get('handle') or '').strip()
        if not h.startswith('@'): h = '@' + h
        if not h or len(h) < 2: return self._err('handle required', 400)
        with DB_LOCK, db() as c:
            try:
                c.execute('''
                    INSERT INTO social_partners (handle, platform, category, followers,
                                                  contact_name, contact_phone, typical_cost, notes)
                    VALUES (?,?,?,?,?,?,?,?)
                ''', (
                    h, body.get('platform','instagram'), body.get('category',''),
                    int(body.get('followers') or 0),
                    body.get('contact_name',''), body.get('contact_phone',''),
                    int(body.get('typical_cost') or 0), body.get('notes',''),
                ))
                c.commit()
                return self._json({'ok': True, 'handle': h}, 201)
            except sqlite3.IntegrityError:
                return self._err(f'{h} already exists', 400)

    def list_social_posts(self, month=None, status=None):
        with db() as c:
            q = 'SELECT * FROM social_posts'
            conds = []; params = []
            if month:  # YYYY-MM
                conds.append('substr(scheduled_date,1,7) = ?'); params.append(month)
            if status:
                conds.append('status = ?'); params.append(status)
            if conds: q += ' WHERE ' + ' AND '.join(conds)
            q += ' ORDER BY scheduled_date, scheduled_time'
            rows = c.execute(q, params).fetchall()
            return [dict(r) for r in rows]

    def social_calendar(self, month=None):
        """Return a date→[posts] map for the given YYYY-MM (default current)."""
        if not month:
            month = date.today().strftime('%Y-%m')
        with db() as c:
            rows = c.execute('''
                SELECT * FROM social_posts
                WHERE substr(scheduled_date,1,7) = ?
                ORDER BY scheduled_date, scheduled_time
            ''', (month,)).fetchall()
        by_date = {}
        for r in rows:
            d = dict(r)
            by_date.setdefault(d['scheduled_date'], []).append(d)
        # also include some month meta
        y, m = map(int, month.split('-'))
        # days in month
        if m == 12: next_m = date(y+1, 1, 1)
        else:       next_m = date(y, m+1, 1)
        days_in_month = (next_m - date(y, m, 1)).days
        return {
            'month': month,
            'first_weekday': date(y, m, 1).isoweekday(),   # 1 = Monday
            'days_in_month': days_in_month,
            'posts_by_date': by_date,
            'total': len(rows),
        }

    def create_social_post(self, body):
        title = (body.get('title') or '').strip()
        sdate = body.get('scheduled_date')
        ctype = body.get('content_type')
        if not (title and sdate and ctype):
            return self._err('title, scheduled_date, content_type required', 400)
        try:
            datetime.strptime(sdate, '%Y-%m-%d')
        except Exception:
            return self._err('scheduled_date: YYYY-MM-DD', 400)
        with DB_LOCK, db() as c:
            cur = c.execute('''
                INSERT INTO social_posts (title, content_type, platform, partner_handle,
                                          scheduled_date, scheduled_time, status, caption,
                                          hashtags, media_notes, assigned_to, cost, notes,
                                          created_by)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                title, ctype, body.get('platform','instagram'),
                body.get('partner_handle') or None,
                sdate, body.get('scheduled_time'),
                body.get('status','scheduled'),
                body.get('caption',''), body.get('hashtags',''),
                body.get('media_notes',''), body.get('assigned_to'),
                int(body.get('cost') or 0), body.get('notes',''),
                self._user(),
            ))
            c.commit()
            return self._json({'ok': True, 'id': cur.lastrowid}, 201)

    def update_social_post(self, pid, body):
        allowed = ['title','content_type','platform','partner_handle','scheduled_date',
                   'scheduled_time','status','caption','hashtags','media_notes',
                   'assigned_to','cost','posted_at','posted_url','reach','likes',
                   'comments','shares','saves','link_clicks','notes']
        upd = {k: body[k] for k in allowed if k in body}
        if not upd:
            return self._err('No fields to update', 400)
        with DB_LOCK, db() as c:
            sets = ', '.join(f'{k} = ?' for k in upd)
            c.execute(f'UPDATE social_posts SET {sets} WHERE id = ?',
                      (*upd.values(), pid))
            c.commit()
            return self._json({'ok': True})

    def delete_social_post(self, pid):
        with DB_LOCK, db() as c:
            c.execute('DELETE FROM social_posts WHERE id = ?', (pid,))
            c.commit()
            return self._json({'ok': True})

    def social_analytics(self):
        """Aggregate posted-content performance + spend."""
        with db() as c:
            t = c.execute('''
                SELECT COUNT(*) AS posts,
                       COALESCE(SUM(reach),0) AS total_reach,
                       COALESCE(SUM(likes),0) AS total_likes,
                       COALESCE(SUM(comments),0) AS total_comments,
                       COALESCE(SUM(cost),0) AS total_spend
                FROM social_posts WHERE status='posted'
            ''').fetchone()
            by_partner = c.execute('''
                SELECT COALESCE(partner_handle,'@fukucoffee.in (own)') AS partner,
                       COUNT(*) AS posts,
                       COALESCE(SUM(reach),0)    AS reach,
                       COALESCE(SUM(likes),0)    AS likes,
                       COALESCE(SUM(comments),0) AS comments,
                       COALESCE(SUM(cost),0)     AS spend
                FROM social_posts WHERE status='posted'
                GROUP BY partner_handle
                ORDER BY reach DESC
            ''').fetchall()
            upcoming = c.execute('''
                SELECT COUNT(*) AS c FROM social_posts
                WHERE status IN ('draft','scheduled') AND DATE(scheduled_date) >= DATE('now')
            ''').fetchone()['c']
            return {
                'totals':    dict(t),
                'by_partner':[dict(r) for r in by_partner],
                'upcoming':  upcoming,
            }

    # ---- RESELLERS ----
    def list_resellers(self):
        with db() as c:
            rows = c.execute(
                'SELECT * FROM resellers WHERE active = 1 ORDER BY created_at DESC'
            ).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                s = c.execute('''
                    SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
                    FROM orders WHERE reseller_ref = ? AND status != 'cancelled'
                ''', (d['ref_code'],)).fetchone()
                d['orders_count'] = s['orders']
                d['revenue']      = s['revenue']
                d['commission_due'] = round(s['revenue'] * (d['commission_pct'] or 0) / 100)
                d['share_url']    = f"http://localhost:{PORT}/?ref={d['ref_code']}"
                out.append(d)
            return out

    def reseller_stats(self, ref):
        with db() as c:
            r = c.execute('SELECT * FROM resellers WHERE ref_code = ?', (ref,)).fetchone()
            if not r: return {}
            d = dict(r)
            orders = c.execute('''
                SELECT * FROM orders WHERE reseller_ref = ?
                ORDER BY created_at DESC LIMIT 50
            ''', (ref,)).fetchall()
            d['orders'] = [dict(o) for o in orders]
            return d

    def public_reseller(self, ref):
        """Lightweight info for the storefront banner — no PII."""
        with db() as c:
            r = c.execute(
                'SELECT name, city FROM resellers WHERE ref_code = ? AND active = 1',
                (ref.upper(),)
            ).fetchone()
            return dict(r) if r else {}

    def create_reseller(self, body):
        ref = (body.get('ref_code') or '').strip().upper()
        if not ref or not body.get('name') or not body.get('phone'):
            return self._err('ref_code, name and phone are required', 400)
        if not re.match(r'^[A-Z0-9\-]{3,20}$', ref):
            return self._err('ref_code: 3–20 chars, A-Z 0-9 - only', 400)
        with DB_LOCK, db() as c:
            try:
                c.execute('''
                    INSERT INTO resellers (ref_code, name, phone, email, city,
                                            commission_pct, notes)
                    VALUES (?,?,?,?,?,?,?)
                ''', (
                    ref, body['name'].strip(), str(body['phone']).strip(),
                    body.get('email','').strip(), body.get('city','').strip(),
                    float(body.get('commission_pct', 10)),
                    body.get('notes','').strip(),
                ))
                c.commit()
            except sqlite3.IntegrityError:
                return self._err(f'ref_code "{ref}" already exists', 400)
            return self._json({
                'ok': True, 'ref_code': ref,
                'share_url': f"http://localhost:{PORT}/?ref={ref}",
            }, 201)

    def update_reseller(self, ref, body):
        allowed = ['name','phone','email','city','commission_pct','notes','active']
        upd = {k: body[k] for k in allowed if k in body}
        if not upd:
            return self._err('No fields to update', 400)
        with DB_LOCK, db() as c:
            sets = ', '.join(f'{k} = ?' for k in upd)
            c.execute(f'UPDATE resellers SET {sets} WHERE ref_code = ?',
                      (*upd.values(), ref.upper()))
            c.commit()
            return self._json({'ok': True})

    # ---- TEAM MEMBER UPDATE (for investments etc) ----
    def update_team_member(self, tid, body):
        allowed = ['name','role','phone','email','invested_amount','equity_pct',
                   'is_payment_handler','is_coffee_handler','active']
        upd = {k: body[k] for k in allowed if k in body}
        if not upd:
            return self._err('No fields to update', 400)
        with DB_LOCK, db() as c:
            sets = ', '.join(f'{k} = ?' for k in upd)
            c.execute(f'UPDATE team_members SET {sets} WHERE id = ?',
                      (*upd.values(), tid))
            c.commit()
            return self._json({'ok': True})

    # ---- SUBSCRIPTIONS ----
    def list_subscriptions(self):
        with db() as c:
            rows = c.execute('SELECT * FROM subscriptions ORDER BY created_at DESC').fetchall()
            return [dict(r) for r in rows]

    def create_subscription(self, body):
        plan = body.get('plan')
        if plan not in ('weekly','biweekly','monthly'):
            return self._err('plan must be weekly/biweekly/monthly', 400)
        freq = {'weekly': 7, 'biweekly': 14, 'monthly': 30}[plan]
        next_d = (date.today() + timedelta(days=freq)).isoformat()
        with DB_LOCK, db() as c:
            cur = c.execute('''
                INSERT INTO subscriptions (plan, customer_name, customer_phone, customer_email,
                                           shipping_address, product_id, qty_per_delivery,
                                           frequency_days, status, next_delivery, notes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                plan, body.get('customer_name'), body.get('customer_phone'),
                body.get('customer_email'), body.get('shipping_address'),
                body.get('product_id'), int(body.get('qty_per_delivery', 1)),
                freq, 'requested', next_d, body.get('notes'),
            ))
            sid = cur.lastrowid
            c.commit()
            return self._json({'ok': True, 'id': sid}, 201)

    def update_subscription_status(self, sid, body):
        status = body.get('status')
        if status not in ('requested','active','paused','cancelled','completed'):
            return self._err('Invalid status', 400)
        with DB_LOCK, db() as c:
            c.execute('UPDATE subscriptions SET status = ? WHERE id = ?', (status, sid))
            c.commit()
            return self._json({'ok': True})

    # ---- SALES REPORTS ----
    def sales_daily(self, days):
        with db() as c:
            today = date.today()
            start = today - timedelta(days=days - 1)
            rows = c.execute('''
                SELECT DATE(created_at) AS d,
                       COUNT(*) AS order_count,
                       SUM(total) AS revenue,
                       SUM((SELECT SUM(qty) FROM order_items WHERE order_id = orders.id)) AS units
                FROM orders
                WHERE DATE(created_at) >= ? AND status != 'cancelled'
                GROUP BY DATE(created_at)
                ORDER BY d
            ''', (start.isoformat(),)).fetchall()
            by_date = {r['d']: dict(r) for r in rows}
            out = []
            for i in range(days):
                d = (start + timedelta(days=i)).isoformat()
                r = by_date.get(d, {})
                out.append({
                    'date': d,
                    'order_count': r.get('order_count', 0) or 0,
                    'revenue': r.get('revenue', 0) or 0,
                    'units': r.get('units', 0) or 0,
                })
            return out

    def sales_weekly(self, weeks):
        with db() as c:
            # use ISO week
            rows = c.execute('''
                SELECT strftime('%Y-W%W', created_at) AS wk,
                       COUNT(*) AS order_count,
                       SUM(total) AS revenue
                FROM orders
                WHERE status != 'cancelled'
                  AND created_at >= datetime('now', ?)
                GROUP BY wk
                ORDER BY wk
            ''', (f'-{weeks * 7} days',)).fetchall()
            return [dict(r) for r in rows]

    def sales_monthly(self, months):
        with db() as c:
            rows = c.execute('''
                SELECT strftime('%Y-%m', created_at) AS month,
                       COUNT(*) AS order_count,
                       SUM(total) AS revenue,
                       SUM((SELECT SUM(qty) FROM order_items WHERE order_id = orders.id)) AS units
                FROM orders
                WHERE status != 'cancelled'
                  AND created_at >= datetime('now', ?)
                GROUP BY month
                ORDER BY month
            ''', (f'-{months * 31} days',)).fetchall()
            return [dict(r) for r in rows]

    def sales_summary(self):
        with db() as c:
            today = date.today().isoformat()
            seven_ago = (date.today() - timedelta(days=6)).isoformat()
            thirty_ago = (date.today() - timedelta(days=29)).isoformat()

            def metric(start_date):
                r = c.execute('''
                    SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue,
                           COALESCE(SUM((SELECT SUM(qty) FROM order_items WHERE order_id = orders.id)),0) AS units
                    FROM orders
                    WHERE status != 'cancelled' AND DATE(created_at) >= ?
                ''', (start_date,)).fetchone()
                return dict(r)

            today_m  = metric(today)
            week_m   = metric(seven_ago)
            month_m  = metric(thirty_ago)

            all_time = c.execute('''
                SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
                FROM orders WHERE status != 'cancelled'
            ''').fetchone()

            pending = c.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'").fetchone()['c']
            low_stock = c.execute(
                'SELECT COUNT(*) AS c FROM products WHERE stock > 0 AND stock <= low_stock_threshold AND active = 1'
            ).fetchone()['c']
            out_of_stock = c.execute(
                'SELECT COUNT(*) AS c FROM products WHERE stock = 0 AND active = 1'
            ).fetchone()['c']
            total_products = c.execute(
                'SELECT COUNT(*) AS c FROM products WHERE active = 1'
            ).fetchone()['c']

            avg_order = (all_time['revenue'] / all_time['orders']) if all_time['orders'] else 0

            return {
                'today':    today_m,
                'week':     week_m,
                'month':    month_m,
                'all_time': dict(all_time),
                'pending_orders': pending,
                'low_stock_count': low_stock,
                'out_of_stock_count': out_of_stock,
                'total_products': total_products,
                'avg_order_value': round(avg_order, 2),
            }

    def top_products(self):
        with db() as c:
            rows = c.execute('''
                SELECT oi.product_id, oi.product_name,
                       SUM(oi.qty) AS units_sold,
                       SUM(oi.line_total) AS revenue
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.status != 'cancelled'
                GROUP BY oi.product_id
                ORDER BY units_sold DESC
                LIMIT 10
            ''').fetchall()
            return [dict(r) for r in rows]

    def sales_by_category(self):
        with db() as c:
            rows = c.execute('''
                SELECT p.cat AS category,
                       SUM(oi.qty) AS units_sold,
                       SUM(oi.line_total) AS revenue
                FROM order_items oi
                JOIN orders o   ON o.id = oi.order_id
                JOIN products p ON p.id = oi.product_id
                WHERE o.status != 'cancelled'
                GROUP BY p.cat
                ORDER BY revenue DESC
            ''').fetchall()
            return [dict(r) for r in rows]

    def low_stock(self):
        with db() as c:
            rows = c.execute('''
                SELECT * FROM products
                WHERE active = 1 AND stock <= low_stock_threshold
                ORDER BY stock ASC, name
            ''').fetchall()
            return [dict(r) for r in rows]

    def stock_history(self, limit):
        with db() as c:
            rows = c.execute('''
                SELECT sl.*, p.name AS product_name
                FROM stock_log sl
                LEFT JOIN products p ON p.id = sl.product_id
                ORDER BY sl.created_at DESC
                LIMIT ?
            ''', (limit,)).fetchall()
            return [dict(r) for r in rows]

    # ---- CHAT ----
    def chat(self, body):
        msg = (body.get('message') or '').strip()
        session_id = body.get('session_id') or 'anon'
        cart_total = int(body.get('cart_total', 0))
        if not msg:
            return self._err('Empty message', 400)
        reply = bot_reply(msg, cart_total)
        with DB_LOCK, db() as c:
            c.execute(
                'INSERT INTO chat_log (session_id, user_msg, bot_msg, intent) VALUES (?,?,?,?)',
                (session_id, msg, reply['text'], reply['intent'])
            )
            c.commit()
        return self._json(reply)

    def chat_history(self, limit):
        with db() as c:
            rows = c.execute(
                'SELECT * FROM chat_log ORDER BY created_at DESC LIMIT ?', (limit,)
            ).fetchall()
            return [dict(r) for r in rows]


# ============================================
# MAIN
# ============================================
def main():
    init_db()
    print(f"\n  ☕ FUKU Coffee server")
    print(f"  ──────────────────────────────────")
    print(f"  🌐 Storefront : http://localhost:{PORT}/")
    print(f"  🔐 Admin      : http://localhost:{PORT}/admin")
    print(f"  👥 Logins:")
    for uname, u in USERS.items():
        tag = ' 🛡️ SUPER' if u.get('is_super') else ''
        print(f"       {uname:9} / {u['password']:14} — {u['name']} ({u['role']}){tag}")
    print(f"  🗄️  Database   : {DB_PATH}")
    print(f"  ──────────────────────────────────")
    print(f"  Press Ctrl-C to stop.\n")

    try:
        server = DualStackHTTPServer(('::', PORT), Handler)
        print(f"  Bound IPv4+IPv6 on port {PORT}")
    except OSError:
        # fall back to IPv4-only if IPv6 isn't available
        server = HTTPServer(('0.0.0.0', PORT), Handler)
        print(f"  Bound IPv4-only on port {PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  bye ☕")
        server.shutdown()

if __name__ == '__main__':
    main()
