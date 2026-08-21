from prometheus_client import generate_latest

from ai_gateway.proxy.observability.events import RequestOutcome
from ai_gateway.proxy.observability.prometheus import PrometheusLogger


def test_private_registry_has_only_fixed_gateway_families_and_zero_labels() -> None:
    metrics = PrometheusLogger()
    families = list(metrics.registry.collect())
    body = generate_latest(metrics.registry).decode()
    assert "python_" not in body and "process_" not in body and "gc_" not in body
    assert "ai_gateway_chat_requests_total" in body
    for outcome in RequestOutcome:
        assert f'outcome="{outcome.value}"' in body
    assert sum(len(family.samples) for family in families) == 735
    assert not any(sample.name.endswith("_created") for family in families for sample in family.samples)


def test_request_finalization_records_exactly_once_per_call() -> None:
    metrics = PrometheusLogger()
    metrics.request_started()
    metrics.request_finished(RequestOutcome.SUCCESS, 0.25)
    assert metrics.chat_requests_in_progress._value.get() == 0
    assert metrics.chat_requests_total.labels("success")._value.get() == 1
