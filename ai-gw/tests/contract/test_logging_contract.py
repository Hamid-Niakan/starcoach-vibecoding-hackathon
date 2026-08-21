from ai_gateway.proxy.observability.logging import sanitize_event


def test_request_event_field_types_remain_bounded() -> None:
    event = sanitize_event(
        {
            "event": "request.completed",
            "severity": "info",
            "request_id": "x" * 1000,
            "http_status": 200,
            "request_duration_seconds": 0.1,
        }
    )
    assert len(event["request_id"]) == 128
    assert isinstance(event["http_status"], int)
    assert isinstance(event["request_duration_seconds"], float)
