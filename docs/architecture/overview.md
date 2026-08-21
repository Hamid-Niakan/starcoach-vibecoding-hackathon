# Architecture Overview

The repository contains two independently buildable Next.js products and one independently
deployable FastAPI AI gateway. Liara Docs consumes the gateway's stateless OpenAI-compatible
`/v1/models` and `/v1/chat/completions` contract. ZarinPal remains disconnected until a later
specification defines analytics-aware AI behavior.

Redis is owned by the gateway solely for atomic anonymous usage enforcement and readiness. Browser
conversation history belongs to Liara's tab-scoped session state; the gateway does not persist
messages. Any future ZarinPal analytical database belongs to that product's data-platform
specification and is not part of the gateway.

Shared packages form a one-way dependency layer and never import application or gateway source.
Gateway consumers use versioned public schemas rather than Python internals. Provider destinations,
protected model identifiers, credentials, trusted proxy policy, and enforcement secrets stay on the
server.
