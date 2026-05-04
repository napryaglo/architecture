# Azure SQL

## Purpose

Managed relational database family on Azure — Single Database, Elastic Pool, Hyperscale, Serverless, and Managed Instance — built on the SQL Server engine. The default RDBMS for Microsoft-stack applications: familiar T-SQL surface, strong tooling, automated backups and HA, and clean integration with the rest of Azure (private endpoints, Entra ID auth, Defender for SQL).

## Trade-offs

- **SQL Server compatibility with PaaS operations.** Existing SQL Server skills, queries, and tooling carry over directly; backups, patching, and HA are managed without sacrificing the engine's behaviour. For migrations and greenfield Microsoft-stack alike, the lowest-friction relational option.
- **SKU choice is a real architectural decision.** Single DB, Elastic Pool, Hyperscale, Serverless, and Managed Instance differ on cost shape, scale ceiling, feature surface, and feature parity with on-prem SQL Server — picking wrong rarely shows up until traffic hits production.
- **Cost scales aggressively with managed-feature use.** vCore + storage + backup retention + cross-region read replicas + auditing combine into bills that surprise teams used to per-instance VM pricing; capacity reservations and Azure Hybrid Benefit help, but only when applied deliberately.
- **Tuning still matters.** PaaS automates the operational floor; query design, index strategy, and partitioning still drive performance. "Managed" doesn't mean "no DBA work" at scale.
