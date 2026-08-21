from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter, completion_payload


@pytest.mark.asyncio
async def test_full_log_queue_does_not_change_chat_result(gateway_env: dict[str, str]) -> None:
    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=completion_payload(), request=request)

    config = load_config().model_copy(update={"log_queue_capacity": 1})
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=FakeLimiter())
    app.state.proxy_logging.emit({"event": "service.ready", "severity": "info"})
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions", json={"model": "test-chat", "messages": [{"role": "user", "content": "hello"}]}
        )
    assert response.status_code == 200
    assert app.state.prometheus.log_events_dropped_total.labels("queue_full")._value.get() == 1
