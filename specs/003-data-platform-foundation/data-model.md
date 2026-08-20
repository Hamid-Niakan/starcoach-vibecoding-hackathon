# Data Model: Data Platform Foundation

- `Conversation`: UUID, product discriminator, SHA-256 access-token hash, timestamps.
- `Message`: UUID, conversation FK, role, content, delivery status, request UUID, JSON metadata, timestamp.
- No ZarinPal analytical table is defined until the official dataset is profiled.
