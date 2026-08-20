from __future__ import annotations

import sys

from ai_gateway.proxy.proxy_server import create_app

try:
    app = create_app()
except Exception:
    sys.stderr.write("ai-gateway startup configuration invalid\n")
    raise RuntimeError("gateway_startup_failed") from None
