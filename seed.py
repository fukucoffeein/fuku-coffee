"""
FUKU Coffee — Database seed.
Resets fuku.db, seeds 14 products, and generates 60 days of synthetic orders
so the admin dashboard has data from day one.
Run:  python3 seed.py
"""
import json
import os
import random
import secrets
import sqlite3
from datetime import datetime, timedelta

HERE    = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, 'fuku.db')

PRODUCTS = [
    # COFFEE BEANS — 60 days from roast
    dict(id='yoko-1kg', cat='beans', name='YOKO Blend — 1 Kg', short='YOKO', sub='Blend',
         description='Dark Roast · Notes of Dark Chocolate, Oak & Vanilla. Full-bodied with low acidity — built for espresso and milk drinks.',
         price=2400, was=3200, roast='Dark Roast', type='bag', bag_color='yoko',
         badge='BEST SELLER', bestseller=1, stock=45, validity_days=60, sort_order=1),
    dict(id='yoko-250g', cat='beans', name='YOKO Blend — 250 g', short='YOKO', sub='Blend',
         description='Dark Roast · Notes of Dark Chocolate, Oak & Vanilla. Perfect starter size for the curious palate.',
         price=600, was=800, roast='Dark Roast', type='bag', bag_color='yoko',
         badge='', bestseller=1, stock=120, validity_days=60, sort_order=2),
    dict(id='kiyo-1kg', cat='beans', name='KIYO Blend — 1 Kg', short='KIYO', sub='Blend',
         description='Dark Roast · Notes of Dark Chocolate, Roasted Almond & Light Caramel. Nutty, smooth, deeply satisfying.',
         price=2400, was=3200, roast='Dark Roast', type='bag', bag_color='kiyo',
         badge='', bestseller=0, stock=32, validity_days=60, sort_order=3),
    dict(id='kiyo-250g', cat='beans', name='KIYO Blend — 250 g', short='KIYO', sub='Blend',
         description='Dark Roast · Notes of Dark Chocolate, Roasted Almond & Light Caramel. The everyday dark roast.',
         price=600, was=800, roast='Dark Roast', type='bag', bag_color='kiyo',
         badge='', bestseller=1, stock=98, validity_days=60, sort_order=4),
    dict(id='yuhi-1kg', cat='beans', name='YUHI Blend — 1 Kg', short='YUHI', sub='Blend',
         description='Medium Roast · Notes of Milk Chocolate, Peach, Cranberry & Roasted Nuts. Bright, balanced, beautiful in pour-over.',
         price=2000, was=2800, roast='Medium Roast', type='bag', bag_color='yuhi',
         badge='STAFF PICK', bestseller=0, stock=8, validity_days=60, sort_order=5),
    dict(id='yuhi-250g', cat='beans', name='YUHI Blend — 250 g', short='YUHI', sub='Blend',
         description='Medium Roast · Notes of Milk Chocolate, Peach, Cranberry & Roasted Nuts. The friendly daily driver.',
         price=500, was=700, roast='Medium Roast', type='bag', bag_color='yuhi',
         badge='', bestseller=1, stock=140, validity_days=60, sort_order=6),

    # INSTANT — 365 days sealed
    dict(id='instant-250g', cat='instant', name='FUKU Instant Coffee — 250 g', short='INSTANT', sub='Premium',
         description='Premium Quality · Bold Taste · Rich Aroma. Freeze-dried from our signature blend — ready in 30 seconds.',
         price=500, was=690, roast='Freeze-Dried', type='bag', bag_color='kiyo',
         badge='NEW', bestseller=0, stock=85, validity_days=365, sort_order=7),
    dict(id='instant-1kg', cat='instant', name='FUKU Instant Coffee — 1 Kg', short='INSTANT', sub='Bulk',
         description='Best Quality · 1Kg pack. For offices, families, and serial sippers. Stays fresh for 12 months sealed.',
         price=2000, was=3000, roast='Freeze-Dried', type='bag', bag_color='kiyo',
         badge='SAVE BIG', bestseller=0, stock=22, validity_days=365, sort_order=8),

    # COLD BREW — 10 days
    dict(id='cb-200', cat='coldbrew', name='Classic Cold Brew — 200 ml', short='Cold Brew',
         description='Brewed to perfection. 16-hour cold steep. Smooth, naturally sweet, never bitter. Single serve.',
         price=100, was=150, type='bottle', label='COLD<br/>BREW',
         badge='', bestseller=0, stock=180, validity_days=10, sort_order=9),
    dict(id='cb-1l', cat='coldbrew', name='Classic Cold Brew — 1 Litre', short='Cold Brew',
         description="Your daily dose. 1-litre bottle — that's 5 servings of pure, slow-brewed iced coffee. Refrigerate after opening.",
         price=500, was=650, type='bottle', label='COLD<br/>BREW 1L',
         badge='', bestseller=1, stock=64, validity_days=10, sort_order=10),
    dict(id='combo-1', cat='coldbrew', name='Combo 1 — Cold Brew + Tonic', short='Combo 1',
         description='200ml Cold Brew + 1 Tonic Water · 2 servings. The classic refresher — pour, stir, serve over ice.',
         price=160, was=200, type='combo', combo_items=['bottle','tonic'],
         badge='', bestseller=0, stock=55, validity_days=10, sort_order=11),
    dict(id='combo-2', cat='coldbrew', name='Combo 2 — Cold Brew + Tonic + Lemon', short='Combo 2',
         description='200ml Cold Brew + 1 Tonic + FUKU Lemon Powder · 2 servings. A zesty twist on the classic.',
         price=210, was=250, type='combo', combo_items=['bottle','tonic','jar'],
         badge='', bestseller=0, stock=42, validity_days=10, sort_order=12),
    dict(id='combo-big', cat='coldbrew', name='Big Combo — 10 Servings', short='Big Combo',
         description='1L Cold Brew + 5 Tonic + FUKU Lime Powder · 10 servings. Best value for sharing weekends.',
         price=1000, was=1200, type='combo', combo_items=['bottle','tonic','jar'],
         badge='BEST VALUE', bestseller=1, stock=18, validity_days=10, sort_order=13),
    # LIME POWDER — 180 days
    dict(id='lime-powder', cat='coldbrew', name='Lime Gucchi Powder', short='Lime Powder',
         description='12g · 2 servings · 6g each. The secret ingredient for your cold brew. Zesty, refreshing, all natural.',
         price=50, was=100, type='powder',
         badge='', bestseller=0, stock=210, validity_days=180, sort_order=14),
]

CUSTOMER_POOL = [
    ('Priya M.',     '9820111122', 'priya@example.com',  'Bandra, Mumbai'),
    ('Rohan S.',     '9740022233', 'rohan@example.com',  'Indiranagar, Bengaluru'),
    ('Aisha K.',     '7600334455', 'aisha@example.com',  'Navrangpura, Ahmedabad'),
    ('Karan D.',     '9426556677', 'karan@example.com',  'Adajan, Surat'),
    ('Meera P.',     '9890778899', 'meera@example.com',  'Kothrud, Pune'),
    ('Anil R.',      '9376990011', 'anil@example.com',   'Alkapuri, Vadodara'),
    ('Sneha T.',     '9819223344', 'sneha@example.com',  'Powai, Mumbai'),
    ('Vikram J.',    '9986445566', 'vikram@example.com', 'Whitefield, Bengaluru'),
    ('Nikhil G.',    '9824667788', 'nikhil@example.com', 'Vesu, Surat'),
    ('Rhea A.',      '9920880099', 'rhea@example.com',   'Juhu, Mumbai'),
    ('Tanvi B.',     '9879221100', 'tanvi@example.com',  'Bopal, Ahmedabad'),
    ('Mihir K.',     '9913443322', 'mihir@example.com',  'Citylight, Surat'),
    ('Devika S.',    '9152665544', 'devika@example.com', 'Versova, Mumbai'),
    ('Arjun N.',     '8000887766', 'arjun@example.com',  'Vastrapur, Ahmedabad'),
    ('Pooja R.',     '7574998877', 'pooja@example.com',  'Piplod, Surat'),
]

SOURCES = ['web', 'web', 'web', 'whatsapp', 'whatsapp', 'chatbot']
STATUSES = ['delivered'] * 7 + ['shipped'] * 2 + ['confirmed'] + ['cancelled']
# Team members handling order entries (weighted: aakash/chilman take most web/wa entries)
ENTRY_TEAM = ['aakash','aakash','aakash','chilman','chilman','vihang','nisarg']
PAYMENT_METHODS = ['cash','cash','online','online','online','online']

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def reset():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    print(f"✓ Removed old db ({DB_PATH})")

def create_schema():
    # Use the same schema as server.init_db()
    import importlib.util
    spec = importlib.util.spec_from_file_location('server', os.path.join(HERE, 'server.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.init_db()
    print("✓ Schema created")

def insert_products():
    with db() as c:
        for p in PRODUCTS:
            c.execute('''
                INSERT INTO products (id, cat, name, short, sub, description, price, was,
                                      roast, type, bag_color, label, combo_items, badge,
                                      bestseller, stock, validity_days, sort_order)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                p['id'], p['cat'], p['name'], p.get('short'), p.get('sub'),
                p['description'], p['price'], p.get('was', 0),
                p.get('roast'), p.get('type'), p.get('bag_color'),
                p.get('label'), json.dumps(p.get('combo_items') or []),
                p.get('badge'), p.get('bestseller', 0),
                p.get('stock', 50), p.get('validity_days', 60),
                p.get('sort_order', 0),
            ))
            # initial stock log
            c.execute(
                'INSERT INTO stock_log (product_id, delta, reason, new_stock, created_at) VALUES (?,?,?,?,?)',
                (p['id'], p['stock'], 'initial stock', p['stock'],
                 (datetime.now() - timedelta(days=60)).isoformat())
            )
        c.commit()
    print(f"✓ Seeded {len(PRODUCTS)} products (with validity_days set)")

def generate_batches():
    """Create a few stock batches per product with varied batch dates so some
    are fresh, some close to expiry, and the dashboard shows the feature."""
    total = 0
    with db() as c:
        for p in PRODUCTS:
            v = p.get('validity_days', 60)
            stock = p.get('stock', 50)
            # Split current stock into 2-3 batches with different dates
            if v <= 14:  # short shelf-life (cold brew, combos)
                splits = [
                    (int(stock * 0.45), random.randint(1, 3)),   # fresh — 1-3 days ago
                    (int(stock * 0.35), random.randint(4, 6)),   # mid — 4-6 days ago
                    (stock - int(stock * 0.45) - int(stock * 0.35), random.randint(7, 9)),  # close to expiry
                ]
            elif v <= 90:  # beans
                splits = [
                    (int(stock * 0.55), random.randint(2, 10)),  # fresh batch
                    (stock - int(stock * 0.55), random.randint(20, 45)),  # older batch
                ]
            else:  # instant, powder — long life
                splits = [(stock, random.randint(10, 60))]

            for qty, days_ago in splits:
                if qty <= 0:
                    continue
                batch_date = (datetime.now() - timedelta(days=days_ago)).date()
                expiry    = batch_date + timedelta(days=v)
                c.execute('''
                    INSERT INTO stock_batches (product_id, qty_added, batch_date, expiry_date, notes, added_by, created_at)
                    VALUES (?,?,?,?,?,?,?)
                ''', (
                    p['id'], qty, batch_date.isoformat(), expiry.isoformat(),
                    f'Initial batch ({v}-day shelf life)', 'system',
                    (datetime.now() - timedelta(days=days_ago)).isoformat(),
                ))
                total += 1
        c.commit()
    print(f"✓ Generated {total} stock batches with varied expiry dates")

def generate_orders(days=60, avg_per_day=12):
    """Generate synthetic order history for nicer charts. Does NOT touch stock."""
    weights = [p.get('bestseller', 0) * 4 + 1 for p in PRODUCTS]
    total_orders = 0
    with db() as c:
        for d in range(days):
            day = datetime.now() - timedelta(days=d)
            # weekday bump, weekend dip, recent uptick
            day_factor = 1.0 + (0.4 if day.weekday() < 5 else -0.1) + (0.5 if d < 7 else 0)
            n_orders = max(1, int(random.gauss(avg_per_day * day_factor, 4)))
            for _ in range(n_orders):
                customer = random.choice(CUSTOMER_POOL)
                n_items  = random.choices([1, 2, 3, 4], weights=[55, 28, 12, 5])[0]
                chosen   = random.choices(PRODUCTS, weights=weights, k=n_items)
                # unique by product id
                seen = {}
                for pr in chosen:
                    seen[pr['id']] = seen.get(pr['id'], 0) + 1
                line_items = []
                subtotal = 0
                for pid, qty in seen.items():
                    pr = next(p for p in PRODUCTS if p['id'] == pid)
                    line_total = pr['price'] * qty
                    subtotal += line_total
                    line_items.append((pid, pr['name'], qty, pr['price'], line_total))

                shipping = 0 if subtotal >= 999 else 80
                total    = subtotal + shipping
                status   = random.choice(STATUSES) if d > 1 else random.choice(['pending', 'confirmed'])
                source   = random.choice(SOURCES)
                ts = (day - timedelta(
                    hours=random.randint(0, 23),
                    minutes=random.randint(0, 59),
                )).isoformat()
                order_no = f"FUKU-{day.strftime('%y%m%d')}-{secrets.token_hex(2).upper()}"

                entered_by = random.choice(ENTRY_TEAM)
                coffee_by  = 'vihang'   # Vihang handles all coffee prep & quality
                pay_method = random.choice(PAYMENT_METHODS)
                # Most delivered orders are paid (confirmed by Nisarg)
                if status == 'delivered' or (status == 'shipped' and random.random() < 0.85):
                    pay_status = 'paid'
                    pay_confirmed_by = 'nisarg'
                    pay_confirmed_at = ts
                elif status == 'cancelled':
                    pay_status = 'unpaid'
                    pay_confirmed_by = None
                    pay_confirmed_at = None
                else:
                    pay_status = random.choices(['paid','unpaid'], weights=[40,60])[0]
                    pay_confirmed_by = 'nisarg' if pay_status == 'paid' else None
                    pay_confirmed_at = ts if pay_status == 'paid' else None
                pay_ref = ('UPI'+secrets.token_hex(3).upper()) if (pay_method == 'online' and pay_status == 'paid') else None

                cur = c.execute('''
                    INSERT INTO orders (order_no, customer_name, customer_phone, customer_email,
                                        shipping_address, subtotal, shipping, discount, total,
                                        status, source, created_at,
                                        entered_by, coffee_handled_by,
                                        payment_method, payment_status,
                                        payment_confirmed_by, payment_confirmed_at, payment_reference)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ''', (
                    order_no, customer[0], customer[1], customer[2], customer[3],
                    subtotal, shipping, 0, total, status, source, ts,
                    entered_by, coffee_by,
                    pay_method, pay_status,
                    pay_confirmed_by, pay_confirmed_at, pay_ref,
                ))
                oid = cur.lastrowid
                for li in line_items:
                    c.execute('''
                        INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price, line_total)
                        VALUES (?,?,?,?,?,?)
                    ''', (oid, *li))
                total_orders += 1
        c.commit()
    print(f"✓ Generated {total_orders} synthetic orders across {days} days")

def main():
    print("\n  ☕ FUKU Coffee — DB SEED\n  " + "─" * 40)
    reset()
    create_schema()
    insert_products()
    generate_batches()
    generate_orders(days=60, avg_per_day=12)
    print("\n  Done. Run:  python3 server.py\n")

if __name__ == '__main__':
    main()
