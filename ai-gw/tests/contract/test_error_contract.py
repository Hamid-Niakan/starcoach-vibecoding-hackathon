from ai_gateway.proxy._types import ErrorObject, ErrorResponse
from ai_gateway.proxy.errors import ProxyException


def test_error_response_is_openai_compatible() -> None:
    response = ErrorResponse(
        error=ErrorObject(message="invalid request", type="invalid_request_error", param="model", code="invalid_model")
    )
    assert response.model_dump() == {
        "error": {
            "message": "invalid request",
            "type": "invalid_request_error",
            "param": "model",
            "code": "invalid_model",
        }
    }


def test_proxy_exception_is_bounded() -> None:
    exc = ProxyException.invalid_model()
    assert exc.status_code == 400
    assert exc.code == "invalid_model"
    assert len(exc.message) <= 512
