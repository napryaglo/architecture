# Azure Blob Storage

## Purpose

Azure's object store for unstructured content: documents, images, video, archives, telemetry dumps, machine-learning artefacts, and the underlying storage for ADLS Gen2 data lakes. Combines very low cost-per-GB with effectively unlimited scale, multiple access tiers, and a deep ecosystem of integrations — the workhorse durable store underneath most non-relational workloads on Azure.

## Trade-offs

- **Cheapest durable storage on Azure.** Per-GB cost is meaningfully lower than relational or document databases; for any workload whose access pattern is "read whole blobs occasionally," this is the right destination.
- **Tiered storage shapes economics.** Hot, Cool, Cold, and Archive tiers differ by an order of magnitude in storage cost but trade against retrieval cost and rehydration latency; lifecycle management policies are essential, not optional, on large estates.
- **Rich auxiliary surface.** Change feed, immutable storage, lifecycle policies, soft delete, versioning, and event grid integration give a lot of operational levers; teams that aren't deliberate end up either under-using them (re-implementing change feed) or mis-configuring them (cost surprises).
- **Access control is broad and easy to mis-set.** Access keys, SAS tokens, RBAC, ACLs (on ADLS Gen2), and storage-account firewalls overlap; production hardening requires deliberate IAM design rather than ad-hoc key issuance, and audit shows up here as a recurring finding.
