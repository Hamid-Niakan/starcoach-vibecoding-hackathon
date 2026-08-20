import httpx
import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from ai_gateway.proxy.middleware.in_flight_requests_middleware import InFlightRequestsMiddleware


@pytest.mark.asyncio
async def test_counter_returns_to_zero_on_success_and_error() -> None:
    async def ok(_):
        assert middleware.in_flight == 1
        return PlainTextResponse("ok")

    middleware = InFlightRequestsMiddleware(Starlette(routes=[Route("/", ok)]))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=middleware), base_url="http://test") as client:
        assert (await client.get("/")).status_code == 200
    assert middleware.in_flight == 0
