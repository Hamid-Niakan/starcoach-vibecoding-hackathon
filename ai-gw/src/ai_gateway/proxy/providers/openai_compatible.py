from __future__ import annotations

import asyncio
import ipaddress
import socket
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from ai_gateway.proxy.constants import REQUEST_ID_HEADER
from ai_gateway.proxy.errors import ProxyException
from ai_gateway.proxy.proxy_config import ProxyConfig


class OpenAICompatible:
    """One fixed OpenAI-compatible destination with no caller-controlled routing."""

    def __init__(self, config: ProxyConfig, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.config = config
        base = urlsplit(str(config.litellm_params.api_base))
        path = base.path.rstrip("/") + "/chat/completions"
        self.chat_completions_url = urlunsplit((base.scheme, base.netloc, path, "", ""))
        self._client = httpx.AsyncClient(
            transport=transport,
            timeout=httpx.Timeout(
                connect=config.connect_timeout_seconds,
                read=config.read_timeout_seconds,
                write=config.write_timeout_seconds,
                pool=config.pool_timeout_seconds,
            ),
            limits=httpx.Limits(
                max_connections=config.max_connections,
                max_keepalive_connections=config.max_keepalive_connections,
            ),
            follow_redirects=False,
            trust_env=False,
        )

    def _headers(self, request_id: str, *, streaming: bool) -> dict[str, str]:
        return {
            "authorization": f"Bearer {self.config.litellm_params.api_key.get_secret_value()}",
            "content-type": "application/json",
            "accept": "text/event-stream" if streaming else "application/json",
            "accept-encoding": "identity",
            "user-agent": "ai-gateway/1",
            REQUEST_ID_HEADER: request_id,
        }

    async def send(self, payload: dict[str, Any], request_id: str, *, streaming: bool) -> httpx.Response:
        await self._validate_destination_addresses()
        request = self._client.build_request(
            "POST",
            self.chat_completions_url,
            headers=self._headers(request_id, streaming=streaming),
            json=payload,
        )
        try:
            response = await self._client.send(request, stream=streaming)
            header_size = sum(len(key) + len(value) for key, value in response.headers.raw)
            if header_size > self.config.max_upstream_header_bytes:
                await response.aclose()
                raise ProxyException(
                    status_code=502,
                    message="The upstream response was invalid.",
                    error_type="server_error",
                    code="upstream_headers_too_large",
                )
            return response
        except httpx.TimeoutException as exc:
            raise ProxyException(
                status_code=504,
                message="The upstream request timed out.",
                error_type="server_error",
                code="upstream_timeout",
            ) from exc
        except httpx.HTTPError as exc:
            raise ProxyException(
                status_code=502,
                message="The upstream service could not be reached.",
                error_type="server_error",
                code="upstream_error",
            ) from exc

    async def _validate_destination_addresses(self) -> None:
        parsed = urlsplit(self.chat_completions_url)
        host = parsed.hostname
        if host is None:
            raise ProxyException.service_unavailable()
        try:
            literal = ipaddress.ip_address(host)
            addresses = [literal]
        except ValueError:
            if self.config.allow_private_upstream:
                return
            try:
                infos = await asyncio.get_running_loop().getaddrinfo(
                    host,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                )
                addresses = [ipaddress.ip_address(info[4][0]) for info in infos]
            except OSError as exc:
                raise ProxyException(
                    status_code=502,
                    message="The upstream service could not be reached.",
                    error_type="server_error",
                    code="upstream_dns",
                ) from exc
        for address in addresses:
            hard_forbidden = address.is_link_local or address.is_multicast or address.is_unspecified
            private = address.is_private or address.is_loopback or address.is_reserved
            if hard_forbidden or (private and not self.config.allow_private_upstream):
                raise ProxyException(
                    status_code=502,
                    message="The upstream destination is unavailable.",
                    error_type="server_error",
                    code="upstream_destination_rejected",
                )

    async def close(self) -> None:
        await self._client.aclose()


async def bounded_response_body(response: httpx.Response, maximum: int) -> bytes:
    result = bytearray()
    async for chunk in response.aiter_bytes():
        result.extend(chunk)
        if len(result) > maximum:
            raise ProxyException(
                status_code=502,
                message="The upstream response was invalid.",
                error_type="server_error",
                code="upstream_response_too_large",
            )
    return bytes(result)
