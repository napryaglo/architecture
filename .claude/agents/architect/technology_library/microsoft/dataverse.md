# Dataverse

## Purpose

Power Platform's relational data store — schema-on-write tables with rich metadata, role-based security, business rules, audit, change tracking, and a uniform Web API. Backs Dynamics 365 modules, model-driven Power Apps, Copilot Studio knowledge, and Power Automate flows; the default place to put structured business data when the rest of the architecture lives on Power Platform.

## Trade-offs

- **Metadata-rich modelling out of the box.** Field-level security, calculated and rollup fields, lookup relationships, and audit are first-class instead of bolt-ons. For canonical CRM/ERP-shaped data, getting these from a raw RDBMS is its own project.
- **Higher TCO than Azure SQL for the same shape of data.** Per-user / per-app licences plus Dataverse capacity (database, file, log) add up quickly; high-volume, low-business-logic workloads are usually cheaper in Azure SQL with bespoke security on top.
- **Tight coupling to Power Platform governance.** Solutions, environments, DLP, and ALM tooling are the unit of change; Dataverse outside Power Platform's lifecycle assumptions ends up fighting the platform.
- **API throttling and request unit budgets.** Per-user and per-tenant call limits push high-volume integrations toward bulk APIs, dataflows, or replication into Fabric/OneLake; naive transactional ingestion patterns hit ceilings under load.
