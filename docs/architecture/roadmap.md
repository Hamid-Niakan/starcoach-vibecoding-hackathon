# SDD Delivery Roadmap

| Feature                       | State                             | Notes                                                                                                                        |
| ----------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 001 Monorepo foundation       | Historical baseline               | Established the workspace and product shells; its original backend choice is superseded by constitution v2 and feature 006   |
| 002 ORM decision              | Superseded                        | Retained as specification history; it does not configure the active gateway                                                  |
| 003 Data platform foundation  | Superseded for the shared backend | Future ZarinPal storage must be specified inside the analytics product boundary                                              |
| 004 Shared chat skeleton      | Superseded integration            | UI concepts were retained where compatible; server-owned conversations were replaced by stateless OpenAI-compatible requests |
| 005 Supported Next.js upgrade | Required before release           | Public deployment remains blocked while either frontend uses Next.js 14                                                      |
| 006 AI gateway integration    | Active                            | Makes `ai-gw/` authoritative, connects Liara, removes the legacy backend, and keeps ZarinPal disconnected                    |
| 007 ZarinPal analytics        | Input-blocked                     | Requires the official dataset and remaining merchant business rules                                                          |
| Future Liara RAG              | Deferred                          | Retrieval, citations, answer evaluation, provider policy, and cost tuning require a dedicated later specification            |

The active Spec Kit pointer is feature 006. Historical specifications remain auditable but do not
override the ratified constitution or the current runtime architecture.
