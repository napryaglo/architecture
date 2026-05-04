# Power BI

## Purpose

Reporting and analytics surface in the Microsoft estate: semantic models, reports, dashboards, paginated reports, and embedded analytics. As part of Microsoft Fabric it sits naturally on top of OneLake-backed data, but it is also the default BI front-end for tenants whose data lives in Dataverse, Azure SQL, or external warehouses. Most often plays the reporting-surface and analytical-store role simultaneously — model and presentation in one product.

## Trade-offs

- **Native M365 / Fabric integration.** Reports embed cleanly into Teams, SharePoint, and PowerPoint; sharing follows the M365 identity model. Dataset reuse across reports keeps modelling consistent in Fabric-aligned estates.
- **Premium capacity is expensive at the threshold.** Dataset size, refresh frequency, and embedded scenarios push tenants from per-user (Pro/PPU) into capacity SKUs (F-SKU/Premium); the price step is large and rarely surfaces until the workload is already running.
- **Modelling is its own discipline.** Strong DAX, semantic modelling, and incremental refresh pay back at scale; getting them wrong produces reports that look right at small scale and collapse at production volume.
- **Embedded vs interactive trade-off.** Embedding into custom apps unlocks user reach but adds licensing complexity (App Owns Data vs User Owns Data) and rarely matches the depth of the Power BI service experience for power users.
