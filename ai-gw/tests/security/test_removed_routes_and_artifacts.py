from __future__ import annotations

from pathlib import Path


def test_runtime_has_no_router_ui_tracing_database_or_analytics_subsystem() -> None:
    root = Path(__file__).parents[2] / "src" / "ai_gateway"
    paths = {path.name.lower() for path in root.rglob("*")}
    assert not paths.intersection({"router.py", "dashboard", "analytics", "database.py", "tracing.py"})
