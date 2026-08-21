from __future__ import annotations

from pathlib import Path

from ai_gateway.proxy.auth.anonymous_identity import derive_anonymous_client_id
from ai_gateway.proxy.constants import NO_STORE_HEADERS


def test_retained_security_controls_and_runtime_exclusions() -> None:
    assert NO_STORE_HEADERS["x-content-type-options"] == "nosniff"
    assert NO_STORE_HEADERS["x-frame-options"] == "DENY"
    assert "192.0.2.1" not in derive_anonymous_client_id("192.0.2.1", b"x" * 32)
    project = (Path(__file__).parents[2] / "pyproject.toml").read_text()
    for excluded in ("litellm", "prisma", "opentelemetry", "structlog", "sqlalchemy", "tiktoken"):
        assert f'"{excluded}' not in project
