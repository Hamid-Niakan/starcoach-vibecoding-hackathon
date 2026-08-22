from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ErrorObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(max_length=512)
    type: str = Field(max_length=64)
    param: str | None = Field(default=None, max_length=64)
    code: str = Field(max_length=64)


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: ErrorObject


class FunctionCall(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=64)
    arguments: str


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=256)
    type: Literal["function"]
    function: FunctionCall


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["developer", "system", "user", "assistant", "tool", "function"]
    content: str | list[dict[str, Any]] | None = None
    name: str | None = Field(default=None, max_length=64)
    refusal: str | None = None
    tool_calls: list[ToolCall] | None = Field(default=None, max_length=32)
    tool_call_id: str | None = Field(default=None, max_length=256)
    function_call: FunctionCall | None = None

    @model_validator(mode="after")
    def validate_role_content(self) -> ChatMessage:
        if self.role in {"developer", "system", "user", "tool"} and self.content is None:
            raise ValueError("content_required")
        if self.role == "tool" and not self.tool_call_id:
            raise ValueError("tool_call_id_required")
        if self.role == "function" and (not self.name or self.content is None):
            raise ValueError("function_message_fields_required")
        if self.role == "assistant" and self.content is None and not self.tool_calls and not self.function_call:
            raise ValueError("assistant_payload_required")
        if isinstance(self.content, list):
            if not self.content or len(self.content) > 128:
                raise ValueError("invalid_content_parts")
            for part in self.content:
                _validate_content_part(part, user=self.role == "user")
        return self


_DATA_IMAGE_RE = re.compile(r"^data:image/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$")
_BASE64_RE = re.compile(r"^(?:data:[^;,]+;base64,)?[A-Za-z0-9+/]+={0,2}$")


def _validate_content_part(part: dict[str, Any], *, user: bool) -> None:
    if not isinstance(part, dict) or "type" not in part:
        raise ValueError("invalid_content_part")
    kind = part["type"]
    if kind == "text":
        if set(part) != {"type", "text"} or not isinstance(part["text"], str):
            raise ValueError("invalid_text_part")
        return
    if not user:
        raise ValueError("non_text_part_not_allowed")
    if kind == "image_url":
        if set(part) != {"type", "image_url"}:
            raise ValueError("invalid_image_part")
        image = part["image_url"]
        url = image if isinstance(image, str) else image.get("url") if isinstance(image, dict) else None
        if not isinstance(url, str) or not _DATA_IMAGE_RE.fullmatch(url):
            raise ValueError("remote_media_not_allowed")
        if isinstance(image, dict) and set(image) - {"url", "detail"}:
            raise ValueError("invalid_image_part")
        return
    if kind == "input_audio":
        audio = part.get("input_audio")
        if set(part) != {"type", "input_audio"} or not isinstance(audio, dict) or set(audio) != {"data", "format"}:
            raise ValueError("invalid_audio_part")
        if (
            audio["format"] not in {"wav", "mp3"}
            or not isinstance(audio["data"], str)
            or not _BASE64_RE.fullmatch(audio["data"])
        ):
            raise ValueError("invalid_audio_part")
        return
    if kind == "file":
        file_part = part.get("file")
        if (
            set(part) != {"type", "file"}
            or not isinstance(file_part, dict)
            or "file_data" not in file_part
            or "file_id" in file_part
        ):
            raise ValueError("provider_file_reference_not_allowed")
        if (
            set(file_part) - {"file_data", "filename"}
            or not isinstance(file_part["file_data"], str)
            or not _BASE64_RE.fullmatch(file_part["file_data"])
        ):
            raise ValueError("invalid_file_part")
        return
    raise ValueError("unsupported_content_part")


class ToolFunction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=4096)
    parameters: dict[str, Any] | None = None
    strict: bool | None = None


class ToolDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["function"]
    function: ToolFunction


class StreamOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    include_usage: bool | None = None


class ProxyChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str = Field(min_length=1, max_length=128)
    messages: list[ChatMessage] = Field(min_length=1, max_length=128)
    frequency_penalty: float | None = Field(default=None, ge=-2, le=2)
    presence_penalty: float | None = Field(default=None, ge=-2, le=2)
    logit_bias: dict[str, float] | None = None
    logprobs: bool | None = None
    top_logprobs: int | None = Field(default=None, ge=0, le=20)
    max_tokens: int | None = Field(default=None, ge=1)
    max_completion_tokens: int | None = Field(default=None, ge=1)
    n: int | None = Field(default=None, ge=1, le=8)
    response_format: dict[str, Any] | None = None
    seed: int | None = None
    service_tier: str | None = Field(default=None, max_length=64)
    stop: str | list[str] | None = None
    stream: bool | None = False
    stream_options: StreamOptions | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    tools: list[ToolDefinition] | None = Field(default=None, max_length=32)
    functions: list[ToolFunction] | None = Field(default=None, max_length=32)
    tool_choice: str | dict[str, Any] | None = None
    parallel_tool_calls: bool | None = None
    function_call: str | dict[str, Any] | None = None
    user: str | None = Field(default=None, max_length=256)

    @model_validator(mode="after")
    def validate_combinations(self) -> ProxyChatCompletionRequest:
        if self.max_tokens is not None and self.max_completion_tokens is not None:
            raise ValueError("conflicting_output_limits")
        if self.stream_options is not None and not self.stream:
            raise ValueError("stream_options_require_stream")
        if self.top_logprobs is not None and self.logprobs is not True:
            raise ValueError("top_logprobs_require_logprobs")
        if isinstance(self.stop, list) and len(self.stop) > 4:
            raise ValueError("too_many_stop_sequences")
        if isinstance(self.stop, str) and len(self.stop) > 1024:
            raise ValueError("stop_too_long")
        if self.response_format is not None:
            _validate_response_format(self.response_format)
        if self.tool_choice is not None:
            _validate_tool_choice(self.tool_choice)
        if self.function_call is not None:
            _validate_function_choice(self.function_call)
        if self.logit_bias is not None and len(self.logit_bias) > 4096:
            raise ValueError("logit_bias_too_large")
        return self


def _validate_response_format(value: dict[str, Any]) -> None:
    kind = value.get("type")
    if kind in {"text", "json_object"}:
        if set(value) != {"type"}:
            raise ValueError("invalid_response_format")
        return
    if kind != "json_schema" or set(value) != {"type", "json_schema"}:
        raise ValueError("invalid_response_format")
    schema = value["json_schema"]
    if not isinstance(schema, dict) or set(schema) - {"name", "description", "schema", "strict"}:
        raise ValueError("invalid_json_schema_format")
    if not isinstance(schema.get("name"), str) or not 1 <= len(schema["name"]) <= 64:
        raise ValueError("invalid_json_schema_name")
    if not isinstance(schema.get("schema"), dict):
        raise ValueError("invalid_json_schema")


def _validate_tool_choice(value: str | dict[str, Any]) -> None:
    if isinstance(value, str):
        if value not in {"none", "auto", "required"}:
            raise ValueError("invalid_tool_choice")
        return
    function = value.get("function")
    if set(value) != {"type", "function"} or value.get("type") != "function" or not isinstance(function, dict):
        raise ValueError("invalid_tool_choice")
    if set(function) != {"name"} or not isinstance(function.get("name"), str) or len(function["name"]) > 64:
        raise ValueError("invalid_tool_choice")


def _validate_function_choice(value: str | dict[str, Any]) -> None:
    if isinstance(value, str):
        if value not in {"none", "auto"}:
            raise ValueError("invalid_function_call")
        return
    if set(value) != {"name"} or not isinstance(value.get("name"), str) or len(value["name"]) > 64:
        raise ValueError("invalid_function_call")


class Usage(BaseModel):
    # OpenAI-compatible providers may add usage breakdowns (for example,
    # RAGFlow's `completion_tokens_details`).  Keep the accounting fields
    # required by the gateway while allowing those provider extensions.
    model_config = ConfigDict(extra="allow")
    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_total(self) -> Usage:
        if self.total_tokens != self.prompt_tokens + self.completion_tokens:
            raise ValueError("invalid_usage_total")
        return self


class ModelInfoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    object: Literal["model"] = "model"
    created: Literal[0] = 0
    owned_by: Literal["ai-gateway"] = "ai-gateway"


class ModelListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    object: Literal["list"] = "list"
    data: list[ModelInfoResponse] = Field(min_length=1, max_length=1)


class ModelResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    object: Literal["chat.completion"]
    created: int
    model: str
    choices: list[dict[str, Any]]
    usage: Usage | None = None


class ModelResponseStream(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    object: Literal["chat.completion.chunk"]
    created: int
    model: str
    choices: list[dict[str, Any]]
    usage: Usage | None = None
