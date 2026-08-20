from __future__ import annotations

REQUEST_ID_HEADER = "x-request-id"
REQUEST_ID_SCOPE_KEY = "ai_gateway.request_id"

NO_STORE_HEADERS = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": (
        "default-src 'none'; style-src 'self'; script-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
    ),
}
