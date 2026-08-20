from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

router = APIRouter()
_scrape_limit = asyncio.Semaphore(4)


@router.get("/metrics", include_in_schema=False)
async def metrics(request: Request) -> Response:
    async with _scrape_limit:
        body = generate_latest(request.app.state.prometheus.registry)
    return Response(
        body,
        headers={
            "Content-Type": CONTENT_TYPE_LATEST,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
