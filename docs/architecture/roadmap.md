# SDD Delivery Roadmap

| Feature                       | State                                  | Notes                                                                                                                         |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 001 Monorepo foundation       | Implemented                            | Root workspace, imported Liara docs, Zarin shell, API, packages, Docker definitions                                           |
| 002 Drizzle ORM               | Superseded by 003                      | Configuration decision retained as history; PostgreSQL runtime work belongs to 003                                            |
| 003 Data platform foundation  | Implemented; integration check pending | PostgreSQL migrations and DuckDB adapter exist; a reachable PostgreSQL/Docker runtime is required for the final restart check |
| 004 Shared chat skeleton      | Implemented; acceptance checks pending | Mock SSE, persistence, shared UI, isolation, redacted logs, and throttling are present                                        |
| 005 Supported Next.js upgrade | Approved; next                         | Blocks every public deployment while either application remains on Next.js 14                                                 |
| 006 Liara RAG assistant       | Deferred                               | Specify after 005; provider, retrieval, citations, evaluation, and cost policy belong here                                    |
| 007 ZarinPal analytics        | Input-blocked                          | Create only after the real dataset and remaining business rules are supplied                                                  |

The active Spec Kit pointer remains on feature 004 until its PostgreSQL-backed reload and responsive browser acceptance checks can run. Features are executed in numeric order.
