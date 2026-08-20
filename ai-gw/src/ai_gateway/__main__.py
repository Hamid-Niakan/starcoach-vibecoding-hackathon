from __future__ import annotations

import uvicorn


def main() -> None:
    uvicorn.run(
        "ai_gateway.main:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
        access_log=False,
        server_header=False,
        log_level="critical",
    )


if __name__ == "__main__":
    main()
