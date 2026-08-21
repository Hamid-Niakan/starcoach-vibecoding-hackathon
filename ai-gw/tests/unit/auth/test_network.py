from __future__ import annotations

from starlette.requests import Request

from ai_gateway.proxy.auth.network import (
    TrustedProxyConfig,
    ip_in_networks,
    normalize_cidr_ranges,
    parse_trusted_proxy_ranges,
    resolve_client_ip,
    resolve_network_context,
)


def request_for(client: str, forwarded_for: str | None = None) -> Request:
    headers = [] if forwarded_for is None else [(b"x-forwarded-for", forwarded_for.encode())]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers, "client": (client, 1234)})


def test_untrusted_peer_cannot_spoof_forwarded_for() -> None:
    request = request_for("198.51.100.2", "203.0.113.8")
    config = TrustedProxyConfig(trusted_proxy_cidrs=("10.0.0.0/8",))
    assert resolve_client_ip(request, config) == ("198.51.100.2", False)


def test_trusted_chain_resolves_first_untrusted_hop() -> None:
    request = request_for("10.0.0.2", "203.0.113.9, 10.0.0.3")
    config = TrustedProxyConfig(trusted_proxy_cidrs=("10.0.0.0/8",))
    assert resolve_client_ip(request, config) == ("203.0.113.9", True)
    context = resolve_network_context(request, config)
    assert context.client_ip == "203.0.113.9"
    assert context.via_trusted_proxy is True


def test_forwarded_chain_beyond_operator_hop_limit_falls_back_to_peer() -> None:
    request = request_for("10.0.0.2", "203.0.113.9, 10.0.0.3")
    config = TrustedProxyConfig(trusted_proxy_cidrs=("10.0.0.0/8",), max_forwarded_hops=1)
    assert resolve_client_ip(request, config) == ("10.0.0.2", False)


def test_malformed_forwarded_address_falls_back_to_peer() -> None:
    request = request_for("10.0.0.2", "not-an-address")
    config = TrustedProxyConfig(trusted_proxy_cidrs=("10.0.0.0/8",))
    assert resolve_client_ip(request, config) == ("10.0.0.2", False)


def test_cidr_helpers_normalize_and_match() -> None:
    values = normalize_cidr_ranges("10.0.0.1/8, 2001:db8::1/32")
    networks = parse_trusted_proxy_ranges(values)
    assert values == ["10.0.0.0/8", "2001:db8::/32"]
    assert ip_in_networks("10.4.5.6", networks)
    assert not ip_in_networks("192.0.2.1", networks)


def test_empty_trust_boundary_ignores_forwarding_even_from_private_peer() -> None:
    request = request_for("10.0.0.2", "203.0.113.9")
    context = resolve_network_context(request, TrustedProxyConfig())
    assert context.client_ip == "10.0.0.2"
    assert context.peer_ip == "10.0.0.2"
    assert context.via_trusted_proxy is False


def test_all_trusted_forwarded_hops_use_leftmost_address() -> None:
    request = request_for("10.0.0.2", "10.0.0.4, 10.0.0.3")
    config = TrustedProxyConfig(trusted_proxy_cidrs=("10.0.0.0/8",))
    assert resolve_client_ip(request, config) == ("10.0.0.4", True)
