from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress


def canonicalize_ip_address(value: str) -> str:
    address = ipaddress.ip_address(value.strip())
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return address.compressed


def derive_anonymous_client_id(client_ip: str, identity_secret: bytes | str, deployment_id: str = "ai-gateway") -> str:
    key = identity_secret.encode() if isinstance(identity_secret, str) else identity_secret
    if len(key) < 32:
        raise ValueError("identity_secret_too_short")
    address = ipaddress.ip_address(canonicalize_ip_address(client_ip))
    family = b"\x04" if address.version == 4 else b"\x06"
    message = b"anon-client:v1\x00" + family + address.packed
    digest = hmac.new(key, message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
