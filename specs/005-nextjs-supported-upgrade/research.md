# Research: Supported Next.js Upgrade

- Treat official Next.js support and security guidance as authoritative and re-check it when this feature starts.
- Prefer the smallest supported major/version jump that covers published security fixes and the repository's deployment horizon.
- Preserve React compatibility across both applications and `@hackathon/chat-ui`; do not split React runtimes.
- Use codemods only after reviewing their diff, especially inside the imported Liara snapshot.
