# Data Model: Shared Chat Skeleton

Conversation and Message use feature 003 storage. The client retains `{conversationId, accessToken}` under a product-specific local-storage key. Stream events carry request, conversation, and message UUIDs; completion carries content, citations, and usage metadata.
