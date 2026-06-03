"""
FUKU Coffee — GO LIVE
Wipes all demo/transactional data so you can start using the shop for real.
Keeps: products, team members, and your 4 login accounts.
Clears: all orders, order items, chat logs, stock batches & stock history.
Sets:   every product's stock to 0 (you then add real stock via Admin → Stock → Add Stock).

Run:  python3 go_live.py
"""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB   = os.path.join(HERE, 'fuku.db')

def main():
    if not os.path.exists(DB):
        print("No database found. Run  python3 seed.py  first (or start the server once).")
        return

    print("\n  ☕ FUKU Coffee — GO LIVE")
    print("  " + "─" * 44)
    print("  This will DELETE all orders, chats, stock batches &")
    print("  history, and set every product's stock to 0.")
    print("  Products, team, and logins are kept.\n")
    ans = input("  Type  GO LIVE  to confirm: ").strip()
    if ans != 'GO LIVE':
        print("  Cancelled.\n")
        return

    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('DELETE FROM order_items')
    c.execute('DELETE FROM orders')
    c.execute('DELETE FROM chat_log')
    c.execute('DELETE FROM stock_batches')
    c.execute('DELETE FROM stock_log')
    c.execute("DELETE FROM sqlite_sequence WHERE name IN "
              "('orders','order_items','stock_batches','stock_log')")
    c.execute('UPDATE products SET stock = 0')
    # seed a zero baseline log entry per product
    for (pid,) in c.execute('SELECT id FROM products').fetchall():
        c.execute("INSERT INTO stock_log (product_id, delta, reason, new_stock, changed_by) "
                  "VALUES (?,?,?,?,?)", (pid, 0, 'GO LIVE — stock zeroed', 0, 'go_live script'))
    conn.commit()

    n_products = c.execute('SELECT COUNT(*) FROM products').fetchone()[0]
    conn.close()

    print(f"\n  ✓ Cleared all orders, chats, batches & history")
    print(f"  ✓ Reset stock to 0 for {n_products} products")
    print(f"  ✓ Products, team & logins preserved")
    print("\n  You're live! Next steps:")
    print("    1. python3 server.py")
    print("    2. Open http://localhost:8765/admin")
    print("    3. Stock → + Add Stock  → enter your real inventory\n")

if __name__ == '__main__':
    main()
