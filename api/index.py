"""
Vercel entry point — wraps our existing server.py Handler.
Vercel's Python runtime requires a top-level class literally named `handler`
that subclasses BaseHTTPRequestHandler.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Vercel runs from /var/task; chdir so relative paths (products/) resolve
try:
    os.chdir(PROJECT_ROOT)
except OSError:
    pass  # read-only filesystem — that's OK on Vercel

from server import Handler, init_db   # noqa: E402

# Initialise schema on cold start (idempotent)
try:
    init_db()
except Exception as _e:
    print(f"[fuku] init_db crash: {_e}")

# Vercel detects this name via AST; must be a class, not an alias.
class handler(Handler):
    pass
