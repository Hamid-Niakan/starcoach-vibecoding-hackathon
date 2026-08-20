from __future__ import annotations

from fastapi.responses import JSONResponse

from ai_gateway.proxy._types import ErrorObject, ErrorResponse


class ProxyException(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        message: str,
        error_type: str,
        code: str,
        param: str | None = None,
        retry_after: int | None = None,
    ) -> None:
        self.status_code = status_code
        self.message = message[:512]
        self.error_type = error_type
        self.code = code
        self.param = param
        self.retry_after = retry_after
        super().__init__(self.message)

    @classmethod
    def invalid_model(cls) -> ProxyException:
        return cls(
            status_code=400,
            message="The requested model is not available.",
            error_type="invalid_request_error",
            code="invalid_model",
            param="model",
        )

    @classmethod
    def invalid_request(cls, message: str = "The request is invalid.", param: str | None = None) -> ProxyException:
        return cls(
            status_code=400,
            message=message,
            error_type="invalid_request_error",
            code="invalid_request",
            param=param,
        )

    @classmethod
    def payload_too_large(cls) -> ProxyException:
        return cls(
            status_code=413,
            message="The request body is too large.",
            error_type="invalid_request_error",
            code="payload_too_large",
        )

    @classmethod
    def unsupported_content_encoding(cls) -> ProxyException:
        return cls(
            status_code=415,
            message="Content-Encoding is not supported.",
            error_type="invalid_request_error",
            code="unsupported_content_encoding",
        )

    @classmethod
    def unsupported_media_type(cls) -> ProxyException:
        return cls(
            status_code=415,
            message="Content-Type must be application/json.",
            error_type="invalid_request_error",
            code="unsupported_media_type",
        )

    @classmethod
    def service_unavailable(cls) -> ProxyException:
        return cls(
            status_code=503,
            message="The service is temporarily unavailable.",
            error_type="server_error",
            code="service_unavailable",
        )

    def as_response(self) -> JSONResponse:
        headers = {"Retry-After": str(self.retry_after)} if self.retry_after is not None else None
        body = ErrorResponse(
            error=ErrorObject(message=self.message, type=self.error_type, param=self.param, code=self.code)
        )
        return JSONResponse(status_code=self.status_code, content=body.model_dump(), headers=headers)
