from __future__ import annotations

from importlib.resources import files
from typing import Any, cast

from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse, JSONResponse, Response

DOCS_URL = "/docs"
OPENAPI_URL = "/openapi.json"
SWAGGER_ASSET_PREFIX = "/static/swagger"


def mount_swagger_ui(app: FastAPI, public_model: str) -> None:
    static_dir = files("ai_gateway.proxy.static.swagger")
    assets = {
        "swagger-ui-bundle.js": (static_dir.joinpath("swagger-ui-bundle.js").read_bytes(), "application/javascript"),
        "swagger-ui.css": (static_dir.joinpath("swagger-ui.css").read_bytes(), "text/css"),
        "favicon.png": (static_dir.joinpath("favicon.png").read_bytes(), "image/png"),
    }

    @app.get(f"{SWAGGER_ASSET_PREFIX}/{{asset_name}}", include_in_schema=False)
    async def swagger_asset(asset_name: str) -> Response:
        asset = assets.get(asset_name)
        if asset is None:
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "message": "The requested resource was not found.",
                        "type": "invalid_request_error",
                        "param": None,
                        "code": "not_found",
                    }
                },
            )
        return Response(asset[0], media_type=asset[1])

    @app.get(OPENAPI_URL, include_in_schema=False)
    async def openapi_json() -> JSONResponse:
        return JSONResponse(build_public_openapi_schema(app, public_model))

    @app.get(DOCS_URL, include_in_schema=False)
    async def swagger_ui() -> HTMLResponse:
        return get_swagger_ui_html(
            openapi_url=OPENAPI_URL,
            title="AI Gateway - Swagger UI",
            swagger_js_url=f"{SWAGGER_ASSET_PREFIX}/swagger-ui-bundle.js",
            swagger_css_url=f"{SWAGGER_ASSET_PREFIX}/swagger-ui.css",
            swagger_favicon_url=f"{SWAGGER_ASSET_PREFIX}/favicon.png",
            swagger_ui_parameters={"tryItOutEnabled": True, "displayRequestDuration": True},
        )


def build_public_openapi_schema(app: FastAPI, public_model: str) -> dict[str, Any]:
    cached = getattr(app.state, "public_openapi_schema", None)
    if cached is not None:
        return cast(dict[str, Any], cached)
    schema = get_openapi(
        title="AI Gateway",
        version="1.0.0",
        description=(
            "Anonymous OpenAI-compatible chat gateway for one operator-configured model. "
            "Streaming responses use raw server-sent events and end with data: [DONE]."
        ),
        routes=app.routes,
    )
    schema["openapi"] = "3.1.0"
    chat = schema["paths"]["/v1/chat/completions"]["post"]
    chat["requestBody"]["content"]["application/json"]["examples"] = {
        "basic": {"value": {"model": public_model, "messages": [{"role": "user", "content": "Hello"}]}},
        "streaming": {
            "value": {"model": public_model, "messages": [{"role": "user", "content": "Hello"}], "stream": True}
        },
    }
    chat["responses"]["200"]["content"]["text/event-stream"] = {
        "schema": {
            "type": "string",
            "description": "Ordered data events followed exactly once by data: [DONE].",
        },
    }
    for path_item in schema["paths"].values():
        for operation in path_item.values():
            if isinstance(operation, dict):
                operation.get("responses", {}).pop("422", None)
    app.state.public_openapi_schema = schema
    return schema
