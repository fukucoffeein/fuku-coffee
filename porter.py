"""
FUKU Coffee — Porter Logistics Integration
==========================================
Talks to Porter's Business API for last-mile delivery bookings.
- Real mode  → uses PORTER_API_KEY against api.porter.in
- Mock mode  → simulates Porter responses (default; lets you demo without keys)

Configure with environment variables:
  PORTER_API_KEY   — your Porter Business API key (enables live mode)
  PORTER_BASE_URL  — defaults to https://pfe-apigw.porter.in (prod);
                     use https://pfe-apigw-uat.porter.in for sandbox
  PORTER_MOCK      — "1" forces mock mode even with a key (for testing)

Pickup point (FUKU Roastery, Surat) is configured below.
"""
import json
import os
import random
import secrets
import urllib.request
import urllib.error
from datetime import datetime, timedelta

# ====== CONFIG ======
PORTER_API_KEY  = os.environ.get('PORTER_API_KEY', '')
PORTER_BASE_URL = os.environ.get('PORTER_BASE_URL', 'https://pfe-apigw.porter.in')
PORTER_MOCK     = os.environ.get('PORTER_MOCK', '') == '1' or not PORTER_API_KEY

PICKUP = {
    'name':         'FUKU Coffee Roastery',
    'phone':        '+919574323011',
    'address_line': 'FUKU Coffee Roastery, Piplod',
    'city':         'Surat',
    'state':        'Gujarat',
    'pincode':      '395007',
    'country':      'India',
    'lat':          21.1395,    # Piplod, Surat
    'lng':          72.7780,
}

# Service zones — must mirror server.py's shipping_for() logic.
PIPLOD_5KM = {'395007','395017','395009','395013'}
SURAT_OTHER = {'395001','395002','395003','395004','395005','395006','395008',
               '395010','395011','395012','395023'}

def zone_for(pincode):
    pc = (pincode or '').strip()
    if pc in PIPLOD_5KM:          return 'free_5km'      # in-house bike, Porter optional
    if pc in SURAT_OTHER:         return 'surat_paid'
    if pc.startswith(('395','394')): return 'surat_paid'
    return 'outside_surat'

# ====== HELPERS ======
def _http(method, path, body=None):
    """Real Porter HTTP call. Only used when not in mock mode."""
    url = PORTER_BASE_URL.rstrip('/') + path
    data = json.dumps(body).encode() if body is not None else None
    req  = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    req.add_header('X-API-KEY', PORTER_API_KEY)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode('utf-8', 'ignore')
        return {'error': f'Porter HTTP {e.code}', 'detail': msg}
    except Exception as e:
        return {'error': f'Porter unreachable: {e}'}

# ====== MOCK PRICING (Surat-tuned) ======
def _mock_fare(drop_pincode, item_value=0, item_count=1):
    """Surat-tuned stand-in pricing. Inside 5 km is cheapest; out-of-state is highest."""
    z = zone_for(drop_pincode)
    if z == 'free_5km':           # near Piplod
        base = 45;  vehicle = '2-Wheeler';   eta = random.randint(20, 40)
        distance_km = round(random.uniform(0.8, 5.0), 1)
    elif z == 'surat_paid':       # rest of Surat
        base = 95;  vehicle = '2-Wheeler';   eta = random.randint(35, 75)
        distance_km = round(random.uniform(5.0, 18.0), 1)
    else:                         # outside Surat — needs confirmation
        base = 380; vehicle = '3-Wheeler/Tata Ace'; eta = random.randint(360, 1800)
        distance_km = round(random.uniform(60, 1200), 1)
    fare = base + max(0, item_count - 1) * 8
    insurance = round(item_value * 0.01) if item_value > 1500 else 0
    return {
        'zone': z,
        'fare_inr': fare + insurance,
        'base_fare': base,
        'item_handling': max(0, item_count - 1) * 8,
        'insurance': insurance,
        'eta_minutes': eta,
        'vehicle_type': vehicle,
        'distance_km': distance_km,
    }

def _mock_order_id():
    return 'CRN' + secrets.token_hex(5).upper()

def _mock_tracking_url(order_id):
    return f'https://porter.in/track/{order_id}'

# ====== PUBLIC API ======
def is_mock():
    return PORTER_MOCK

def get_quote(drop, item_value=0, item_count=1):
    """Get a delivery quote for a drop address.
       drop = { 'name','phone','address_line','city','state','pincode' }
    """
    if PORTER_MOCK:
        q = _mock_fare(drop.get('pincode'), item_value, item_count)
        q['quote_id'] = 'Q' + secrets.token_hex(6).upper()
        q['valid_for_seconds'] = 600
        q['mock'] = True
        return q
    # Real-mode body shape per Porter docs
    body = {
        'pickup_details': {'address': _addr(PICKUP)},
        'drop_details':   {'address': _addr(drop)},
        'customer':       _cust(drop),
    }
    res = _http('POST', '/v1/get_quote', body)
    return res

def book(drop, item_value=0, item_count=1, quote_id=None, additional_comments=''):
    """Book a Porter delivery. Returns {order_id, status, tracking_url, fare}."""
    if PORTER_MOCK:
        q = _mock_fare(drop.get('pincode'), item_value, item_count)
        order_id = _mock_order_id()
        return {
            'order_id':     order_id,
            'status':       'open',     # open / accepted / picked_up / in_transit / delivered
            'tracking_url': _mock_tracking_url(order_id),
            'fare_inr':     q['fare_inr'],
            'eta_minutes':  q['eta_minutes'],
            'vehicle_type': q['vehicle_type'],
            'distance_km':  q['distance_km'],
            'pickup':       PICKUP,
            'drop':         drop,
            'created_at':   datetime.now().isoformat(),
            'mock':         True,
        }
    body = {
        'request_id': 'FUKU_' + secrets.token_hex(8),
        'pickup_details': {'address': _addr(PICKUP)},
        'drop_details':   {'address': _addr(drop)},
        'customer':       _cust(drop),
        'additional_comments': additional_comments[:200],
    }
    res = _http('POST', '/v1/orders/create', body)
    return res

def get_status(order_id):
    """Refresh a Porter order's status."""
    if PORTER_MOCK:
        # Walk through statuses deterministically based on the order id char sum
        flow = ['open', 'accepted', 'rider_assigned', 'picked_up', 'in_transit', 'delivered']
        idx = (sum(ord(c) for c in order_id) + datetime.now().hour) % len(flow)
        status = flow[min(idx, len(flow) - 1)]
        return {
            'order_id': order_id,
            'status':   status,
            'driver': {
                'name':   'Rider ' + order_id[-3:],
                'phone':  '+91 90000 ' + order_id[-5:-1],
                'vehicle_no': 'GJ-05-' + order_id[-4:],
            } if status not in ('open',) else None,
            'updated_at': datetime.now().isoformat(),
            'mock':       True,
        }
    return _http('GET', f'/v1/orders/{order_id}')

def cancel(order_id, reason='customer request'):
    if PORTER_MOCK:
        return {
            'order_id': order_id, 'status': 'cancelled',
            'reason': reason, 'mock': True,
        }
    return _http('POST', f'/v1/orders/{order_id}/cancel', {'reason': reason})

# ====== INTERNAL SHAPING ======
def _addr(d):
    return {
        'apartment_address': '',
        'street_address1':   d.get('address_line', ''),
        'street_address2':   '',
        'landmark':          '',
        'city':              d.get('city', ''),
        'state':             d.get('state', ''),
        'pincode':           d.get('pincode', ''),
        'country':           d.get('country', 'India'),
        'lat':               d.get('lat'),
        'lng':               d.get('lng'),
        'contact_details': {
            'name':         d.get('name', ''),
            'phone_number': d.get('phone', ''),
        }
    }

def _cust(d):
    return {
        'name':   d.get('name', ''),
        'mobile': {'country_code': '+91',
                   'number': str(d.get('phone', '')).replace('+91', '').strip()},
    }
