# Implementation Plan: Shared Chat Skeleton

Define Zod contracts in `@hackathon/contracts`, a fetch/ReadableStream SSE transport in `@hackathon/api-client`, and a React 18 stateful `ChatPanel` in `@hackathon/chat-ui`. NestJS exposes identical product-scoped route shapes backed by one ChatService and PersistenceService. The UI stores opaque credentials in local storage, renders Markdown/code safely, and exposes cancellation and failure states.

## Constitution Check

PASS: contracts are versioned, product data is isolated, tokens are hashed, content is not logged, costs are explicit zeroes in mock mode, and RTL/LTR behavior is present.
