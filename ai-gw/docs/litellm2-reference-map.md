# LiteLLM2 reference map

LiteLLM2 is a read-only behavioral and security reference, never a runtime dependency.

| Area                     | LiteLLM2 reference                             | AI gateway implementation/tests                            | Deliberate exclusions                                                 |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Config/model terms       | `litellm/proxy/proxy_server.py`, `_types.py`   | `proxy_config.py`, `test_proxy_config.py`                  | `model_list` configuration, Router, Deployment, fallbacks, hot reload |
| Chat schemas             | `litellm/proxy/_types.py`, `types/utils.py`    | `_types.py`, `test_proxy_types.py`, parity chat tests      | non-chat APIs, arbitrary provider extras                              |
| Request processing/SSE   | `proxy/common_request_processing.py`           | `common_request_processing.py`, streaming tests            | routing, retry, caching, callbacks                                    |
| Fixed provider transport | proxy HTTP client patterns                     | `providers/openai_compatible.py`, destination/header tests | caller headers, redirects, environment proxies                        |
| Network identity         | `proxy/auth/network.py`                        | `auth/network.py`, `anonymous_identity.py`, unit tests     | API-key/team/user principals                                          |
| Safety middleware        | `proxy/middleware/`                            | request context/size/security/in-flight middleware tests   | caller-controlled LiteLLM call IDs                                    |
| Enforcement              | `parallel_request_limiter_v3.py`, TOCTOU tests | enforcement policies, Lua scripts, Redis integration tests | cache fallback, spend/budget/database hooks                           |
| Errors                   | proxy exception handling                       | `errors.py`, error and route contracts                     | raw provider errors/tracebacks                                        |
| Swagger/OpenAPI          | proxy Swagger tests/assets                     | local `static/swagger`, docs/schema tests                  | custom dashboard, ReDoc, CDN, management schemas                      |
| Metrics                  | `integrations/prometheus.py`                   | private `PrometheusLogger`, metrics contract               | dynamic labels, default collectors, costs/users                       |
| Logging/redaction        | `_logging.py`, redaction tests                 | stdlib `ProxyLogging`, queue and redaction tests           | callback logging, arbitrary payload promotion, tracing                |
| Health                   | proxy health endpoints                         | fixed liveness/readiness routes/tests                      | detailed dependency/provider/database health                          |

Security parity is asserted in `tests/parity/test_litellm2_security_controls.py`; route/dependency exclusions are asserted in `tests/security/test_removed_routes_and_artifacts.py`.
