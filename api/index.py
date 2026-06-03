"""
Vercel entry point — wraps our existing server.py Handler.
Vercel's Python runtime auto-exposes a BaseHTTPRequestHandler subclass
named `handler` as the function.
"""
import os, sys

# Make sure we can import server.py from the project root
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Vercel runs from /var/task — chdir so relative paths (products/, fuku.db) resolve
os.chdir(PROJECT_ROOT)

from server import Handler, init_db   # noqa: E402

# Initialise schema on cold start (idempotent — uses CREATE TABLE IF NOT EXISTS)
init_db()

# Vercel discovers this name as the function handler
handler = Handler
