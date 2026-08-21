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
