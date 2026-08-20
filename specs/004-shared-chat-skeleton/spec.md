# Feature Specification: Shared Chat Skeleton

**Created**: 2026-08-20 | **Status**: Approved

## User Scenarios & Testing

### User Story 1 - Continue a Conversation (Priority: P1)
As an anonymous visitor, I can create a product-scoped conversation, receive a visibly streaming response, reload, and recover history.

### User Story 2 - Use the Same Experience in Both Products (Priority: P2)
As a user, I can use the shared assistant through a Liara full-screen/floating entry and the ZarinPal dashboard without losing each product's visual context.

### User Story 3 - Fail Safely (Priority: P3)
As an operator, I can bound input/rate, cancel streams, diagnose request IDs, and avoid logging message bodies or tokens.

## Requirements

- Separate Liara and ZarinPal endpoints MUST enforce product-scoped conversation lookup.
- Conversation access MUST require a 256-bit opaque token whose hash alone is stored.
- POST message responses MUST use SSE events `message.started`, `message.delta`, `message.completed`, and `error` from `@hackathon/contracts`.
- Mock responses MUST be deterministic, need no model key, stream incrementally, and persist completed messages.
- The React package MUST handle create/load/send/cancel/error state and locally retain only conversation credentials.
- Inputs MUST be trimmed and limited to 8,000 characters; requests MUST be rate-limited and body-limited.
- Logs MUST contain request metadata but never content, access tokens, or merchant data.

## Success Criteria

- Both applications can stream and reload the same product-specific conversation contract.
- Cross-product access, missing/invalid token, invalid payload, and rate-limit tests fail safely.
- Completed events reserve citations and token/cost fields for later providers.
