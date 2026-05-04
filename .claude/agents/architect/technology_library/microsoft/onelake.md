# OneLake

## Purpose

The single, tenant-wide data lake underneath Microsoft Fabric — an ADLS Gen2-compatible namespace that is automatically provisioned with the tenant and shared across all Fabric workloads. Pitched as "OneDrive for data": every Fabric workspace stores its lakehouses, warehouses, KQL databases, and dataflows in OneLake by default, and shortcuts let workspaces project external storage in without copying.

## Trade-offs

- **Single source of truth across Fabric workloads.** Lakehouses, warehouses, KQL databases, and Power BI semantic models all see the same physical files; the historical pattern of copying data between analytical stores collapses into shortcuts and Direct Lake reads.
- **Mirroring and shortcuts reduce duplication — when used.** Mirroring from Azure SQL, Cosmos DB, or Snowflake into OneLake, and shortcuts to ADLS / S3 / Dataverse, mean ingestion no longer has to mean copy; teams that don't use them end up running OneLake as another silo.
- **Tied to Fabric capacity and lifecycle.** OneLake is not a standalone storage account; cost, capacity throttling, and governance follow Fabric. Architectures that need ADLS-style isolation per project still belong on a dedicated ADLS Gen2 account behind shortcuts.
- **Not a replacement for transactional or app stores.** OneLake is an analytics lake; OLTP, low-latency app data, and per-row-protected operational stores still live in Azure SQL, Cosmos DB, or Dataverse. Treating it as a general-purpose database is a recurring anti-pattern.
