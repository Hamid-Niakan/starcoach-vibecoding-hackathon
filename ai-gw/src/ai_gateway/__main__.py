from __future__ import annotations

import asyncio

import uvicorn

from ai_gateway.startup import validate_startup


def main() -> None:
    asyncio.run(validate_startup())
    uvicorn.run(
        "ai_gateway.main:app",
        host="0.0.0.0",
        port=4000,
        workers=1,
        access_log=False,
        server_header=False,
        log_level="critical",
    )


if __name__ == "__main__":
    main()
