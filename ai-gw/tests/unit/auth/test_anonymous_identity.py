from ai_gateway.proxy.auth.anonymous_identity import canonicalize_ip_address, derive_anonymous_client_id


def test_ipv4_mapped_ipv6_canonicalizes_to_ipv4() -> None:
    assert canonicalize_ip_address("::ffff:192.0.2.5") == canonicalize_ip_address("192.0.2.5")


def test_identity_is_deterministic_scoped_and_not_raw() -> None:
    secret = b"0123456789abcdef0123456789abcdef"
    first = derive_anonymous_client_id("192.0.2.5", secret)
    second = derive_anonymous_client_id("192.0.2.5", secret)
    other = derive_anonymous_client_id("192.0.2.6", secret)
    assert first == second and first != other
    assert "192.0.2.5" not in first
    assert len(first) == 43


def test_ipv6_identity_never_contains_raw_or_canonical_address() -> None:
    secret = b"0123456789abcdef0123456789abcdef"
    raw = "2001:0db8:0000:0000:0000:0000:0000:0005"
    identity = derive_anonymous_client_id(raw, secret)

    assert raw not in identity
    assert canonicalize_ip_address(raw) not in identity
    assert identity.replace("-", "").replace("_", "").isalnum()
