from __future__ import annotations

import ipaddress
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict
from starlette.requests import Request

type IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
type IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


class TrustedProxyConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    trusted_proxy_cidrs: tuple[str, ...] = ()
    max_forwarded_hops: int = 16


@dataclass(frozen=True, slots=True)
class NetworkContext:
    client_ip: str
    peer_ip: str
    via_trusted_proxy: bool


def _canonical_address(value: str) -> IPAddress:
    address = ipaddress.ip_address(value.strip())
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return address.ipv4_mapped
    return address


def normalize_cidr_ranges(value: str | tuple[str, ...] | list[str]) -> list[str]:
    entries = value.split(",") if isinstance(value, str) else value
    return [str(ipaddress.ip_network(entry.strip(), strict=False)) for entry in entries if entry.strip()]


def parse_trusted_proxy_ranges(value: str | tuple[str, ...] | list[str]) -> tuple[IPNetwork, ...]:
    return tuple(ipaddress.ip_network(entry, strict=False) for entry in normalize_cidr_ranges(value))


def ip_in_networks(value: str, networks: tuple[IPNetwork, ...]) -> bool:
    address = _canonical_address(value)
    return any(address.version == network.version and address in network for network in networks)


def resolve_client_ip(request: Request, config: TrustedProxyConfig) -> tuple[str, bool]:
    if request.client is None:
        return "0.0.0.0", False
    peer = str(_canonical_address(request.client.host))
    networks = parse_trusted_proxy_ranges(config.trusted_proxy_cidrs)
    if not ip_in_networks(peer, networks):
        return peer, False
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer, False
    try:
        hops = [str(_canonical_address(part)) for part in forwarded.split(",") if part.strip()]
    except ValueError:
        return peer, False
    if len(hops) > config.max_forwarded_hops:
        return peer, False
    for hop in reversed(hops):
        if not ip_in_networks(hop, networks):
            return hop, True
    return (hops[0], True) if hops else (peer, False)


def resolve_network_context(request: Request, config: TrustedProxyConfig) -> NetworkContext:
    client_ip, trusted = resolve_client_ip(request, config)
    peer_ip = str(_canonical_address(request.client.host)) if request.client else "0.0.0.0"
    return NetworkContext(client_ip=client_ip, peer_ip=peer_ip, via_trusted_proxy=trusted)
