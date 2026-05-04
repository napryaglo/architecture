# SharePoint Online

## Purpose

The M365 estate's primary store for unstructured and semi-structured business content: document libraries, lists, sites, and pages. Already populated with the bulk of an enterprise's working documents and indexed by Microsoft Search and Microsoft Graph, it is the default knowledge source for Copilot, M365 search experiences, and RAG pipelines that need to ground answers in tenant content without a separate ingestion programme.

## Trade-offs

- **Content gravity.** Documents already live there; routing a new application or AI surface through SharePoint avoids a parallel content store and inherits Microsoft 365 compliance, retention, and DLP boundaries.
- **Permission inheritance is powerful but easy to mis-model.** Item-, library-, and site-level permissions, sharing links, and group memberships interact in non-obvious ways; AI workloads that surface content across permission boundaries need careful trimming or they leak data.
- **Throttling on automation.** Per-tenant and per-app request budgets clamp aggressive ingestion or write-back patterns. High-volume integration (mass migration, bulk metadata updates) needs explicit throttling discipline and often a queue in front.
- **Lists are not databases.** Lists work well at small-to-mid scale and for citizen-developed scenarios; pushing them into transactional or high-cardinality use cases ends with view thresholds, lookup-column limits, and pain. A real database (Dataverse, Azure SQL) is the correct destination once the workload outgrows them.
